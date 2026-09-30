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
