# Phase 5: the pane, the run's app check, and the end-to-end run

Status: claimed
Claimed by: claude-issue-20
Blocked by: 18, 19

Spec: [../spec.md](../spec.md), "Phase 5". The work is [the release spec's phase 5](../../android-support/release-spec.md#phase-5-the-log-pane-and-app-exit-detection-log-pane-and-app-exit-detection-on-android-where-android-plugs-into-the-code-item-7) items 2 (the pane, log tails and `logs`), 3 (masking), 5 (the pane's check moves onto the driver), 6 (reason codes) and 7 (tests), plus wiring Issue 18's watcher into Issue 19's driver. Read them in full, with the spec's "Phase 5" Implementation Decisions and both earlier Issues' reports. The detail below only adds acceptance criteria.

## What to build

1. **Wire the watcher.** The factory, or the driver's default, passes Issue 18's `createExitWatch` to the Android driver. Replace Issue 19's structural type with the import.
2. **The driver's problem, on both platforms.** Add an optional `appProblem?(): AppProblem | undefined` to `DeviceDriver` beside `appRunning`. You may fix the exact name and shape, and say so in your report.
   - The Android driver returns the watch's `problem()`.
   - The iOS driver returns `{ code: 'APP_EXITED', note: <today's note, word for word> }` when its helper-pid check says the app isn't running, and `undefined` otherwise.
3. **The run.** Where `runScriptedScenario` replaces a step's error with `APP_EXITED`, it asks `appProblem()` first and uses its code, which may be `APP_NOT_RESPONDING`. It falls back to `appRunning() === false` for a driver without the method.
   - A cancel still wins.
   - A verdict already given stands.
   - The error event keeps its fields.
4. **The pane.**
   - **The app check:** `startLogStream` takes an `appProblem` callback instead of parsing `_helperpid`. It notes the problem's note once, unless `expectStop()` was called. `BridgeService` passes the driver's method. The socket protocol, `expectStop()` and `finish` are otherwise unchanged.
   - **Sources:** `sources` gains an optional `logcat`, which gets a follower with `logcatLine`. Masking is the existing masker.
   - **The header:** for a run with a `logcat` source, `attachLogPane`'s header names the logcat file and the app's uid filter (for example, "device log (logcat, the app's uid only): <path>") in place of the two iOS source lines. An iOS header is unchanged byte for byte.
   - **The type:** widen `logSources` and `onPrepared`'s type to carry `logcat` through `run.ts` and `service.ts`.
5. **`logs` after the run.** The CLI's fallback lists `logcat` with the iOS paths, in the same message.
6. **The end-to-end test.** `runScriptedScenario` with the real Android driver, the real watcher, a fake `adb` runner, a fake agent client and a fake stream starter replaying events lines from `tests/fixtures/android/logcat/`:
   - a crash partway through gives `APP_EXITED`;
   - `probe-anr`'s lines give `APP_NOT_RESPONDING`;
   - a normal run passes;
   - in each, `close` stopped both streams, the holder record is empty, and the lease is released.

## Acceptance

- **Wire and persistence:**
  - `prepared`'s `logSources.logcat` in `run.jsonl`;
  - a step's `logTails.logcat` in `run.jsonl`, with a planted script value redacted;
  - the pane's line for the same value shown as `[value:<key>]`.
- **The leak test:** `tests/scripted-run.test.ts`'s whole-evidence scan still passes, and it covers the logcat tail if it reads `logTails`.
- **The pane:**
  - an Android pane test pins the header and the cause note;
  - the existing `_helperpid` test in `tests/logpane.test.ts` changes to the callback, the one allowed edit to an existing test's setup (release spec item 7), and its assertion on "The app stopped unexpectedly" stays;
  - an expected stop gives no note.
- **The run:**
  - with a fake driver, `appProblem` returning `APP_NOT_RESPONDING` ends the run with that reason;
  - one without the method keeps today's `APP_EXITED` behaviour;
  - a cancel wins over both.
- **The iOS driver:** `appProblem` goes through the `CliRunner` fake with the same cases as `appRunning`.
- **The `logs` fallback:** a CLI test for a finished Android run lists the logcat file.
- **iOS is unchanged:** golden files and `tests/scripted-production-parity.test.ts` are untouched.
- `npm run check` passes. No device is touched.

## Comments

### 2026-09-30, claude-issue-20: built, ready for the coordinator

**What I built** (commits `2be6f1b`, `23457d7`):
- **The interface:** `DeviceDriver.appProblem?(): AppProblem | undefined`, beside `appRunning`.
  - `AppProblem` (`{ code: 'APP_EXITED' | 'APP_NOT_RESPONDING'; note: string }`) now lives in `src/contracts/index.ts`. `exit-watch.ts` imports it and still re-exports it, so Issue 18's exports stay the same.
  - A new `LogSources` type (`runtime`, `os`, `logcat`, all optional) is used by the interface, both drivers, `run.ts`'s `onPrepared`, the service, the pane's `hello` and the CLI.
- **Android driver:** `appProblem()` returns the watch's `problem()`. The structural `AppExitWatch` is gone. `createExitWatch` is typed `typeof createExitWatch` from `exit-watch.ts`.
- **iOS driver:** `appProblem()` returns `APP_EXITED` with "The app stopped unexpectedly: its console output ended while the run was still going." (the pane's old note, word for word) when `appRunning()` is `false`. Otherwise it returns `undefined`.
- **The run:** `runScriptedScenario` asks `appProblem()` when the driver has it, and uses `appRunning() === false` → `APP_EXITED` only when it doesn't. A cancel still wins, a verdict already given stands, and the error event's fields are unchanged.
- **The pane:**
  - `startLogStream` takes `appProblem?` and notes the first problem's note once, unless `expectStop()` was called. A callback that throws counts as "can't tell", so the pane can never throw from its timer.
  - A `logcat` source gets a `Follower` with `logcatLine`, masked by the existing masker.
  - `attachLogPane`'s header prints `device log (logcat, the app's uid only): <path>` in place of the two iOS lines when `sources.logcat` is set. The iOS header is unchanged, and a test pins it line by line.
- **Service and factory:**
  - `BridgeService` makes the run ID before `createDriver`, which is now `(scenario, { runId })`. `randomUUID()` is pure, so moving it earlier changes nothing else.
  - The service passes `() => driver.appProblem?.()` to the pane.
  - `createDriverFactory` passes `createExitWatch` (it can be overridden through `options.android`) and the run's ID to the Android driver. Its `run` argument is optional, so existing one-argument calls still type-check.
- **The `logs` fallback** lists `logcat` after the iOS paths, in the same message.

**Choices the Issue left open:**
1. **The run's fallback is literal.** A driver that has `appProblem` is never second-guessed by `appRunning`. So an Android app the bridge itself stopped (`running()` false, `problem()` undefined) keeps the step's own error. A test pins this.
2. **The pane notes once.** A freeze followed by a crash shows only "not responding", as the Issue says ("notes the problem's note once"). The run's reason is still read when the step fails, so it becomes `APP_EXITED`.
3. **Freeze, then the events stream ends:** `problem()` stays `APP_NOT_RESPONDING`, so both the run and the pane still report the freeze. `appRunning()` being `undefined` isn't consulted, because the driver has `appProblem`.
4. **An Android run with no logcat file** (a refused folder or a failed stream) shows the iOS header lines with "unavailable". The Issue asks for the logcat header only "for a run with a `logcat` source", and `hello` carries no platform.
5. **Notes are shown as the driver gives them**, with no prefix. Android notes read, for example, `!! crashed: IllegalStateException at MainActivity.java:59`.

**Deviations:** none from the Issue. I changed the import in one phase 5 test (`tests/android-driver.test.ts`, Issue 19's): `AppExitWatch` now comes from `exit-watch.ts`.

**Tests added** (the only pre-phase-5 edit is the allowed `_helperpid` setup in `tests/logpane.test.ts`; its "The app stopped unexpectedly" assertion stays):
- `tests/logpane.test.ts` (3):
  - the Android header, `[value:city]` masking and the cause note once;
  - the iOS header line by line;
  - no note after `expectStop()`.
- `tests/scripted-run.test.ts` (4):
  - `APP_NOT_RESPONDING` from a fake driver, with the error event's fields;
  - `appProblem` wins over `appRunning`;
  - a given verdict stands;
  - a cancel wins over `appProblem` and over `appRunning`.
- `tests/device.test.ts` (1): the iOS `appRunning` and `appProblem` through the `CliRunner` fake. It covers a dead helper, a live helper, no helper pid, no runtime log, before launch and after close.
- `tests/service.test.ts` (1): the driver gets the run's own ID; the pane follows the logcat file and notes the driver's problem; the run ends `APP_NOT_RESPONDING`.
- `tests/integration-edge.test.ts` (1): the CLI `logs` on a finished Android run lists the logcat file.
- `tests/android-driver.test.ts` (3, end to end):
  - Each runs `runScriptedScenario` on the driver the real factory builds, with the real watcher, fake `adb`, agent and stream starter, fed `probe-crash`, `probe-anr` and `probe-normal`.
  - Results: `APP_EXITED` (the crash is fed while the city is typed), `APP_NOT_RESPONDING`, and a pass with a redacted `logTails.logcat`.
  - In each: `prepared.logSources.logcat` is `<folder>/<runId>.log`, both streams stopped, streams and agent disowned before the forward's removal, the lease file gone, no agent or forward left, and no typed value in `run.jsonl`.
  - With `createExitWatch` removed from the factory, the crash and freeze tests fail.

**The leak test:** `tests/scripted-run.test.ts`'s whole-evidence scan is unchanged and passes. Its driver returns no `logTails`, so the redacted logcat tail is covered by the end-to-end normal run and Issue 19's run test.

**Review** (`/code-review`, fixed point `d9d1588`):
- **Standards:** 0 hard violations, 6 judgement calls. Fixed in `23457d7`: both drivers return `LogSources`, and `problem` is renamed to `problemCode`. Kept on purpose:
  - the `appRunning` fallback, which the Issue requires;
  - the `AppProblem` re-export, Issue 18's interface;
  - the factory's optional `run`, for existing callers;
  - the separate source checks in cli, attach and stream.
- **Spec:** no blocking gaps, 3 partial points. Two are fixed in `23457d7` (the freeze run now checks its error event; the holder-record check is stated plainly). The third is this report.

**Gate:** `npm run check` passed, 485 of 485 tests, then the build, at `23457d7` (log: `$TMPDIR/implement-phase5-20-check.log`). No device, adb server or mobilecli was touched.
