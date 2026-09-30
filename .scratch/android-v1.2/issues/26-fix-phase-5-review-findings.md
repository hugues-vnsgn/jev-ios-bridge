# Phase 5: fix the whole-branch review findings

Status: closed
Closed: Merged into agent/android-v1.2-phase5 at 9d5f540
Claimed by: claude-issue-26
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 5", and Issues 18 to 20 with their comments. A two-axis `/code-review` of the whole phase 5 branch (`b4ede43...agent/android-v1.2-phase5`, at `6bd9db1`) found the items below. Fix each, test first, and keep every other behaviour as it is.

## Spec findings

1. **P2: a cancel during a stream's start leaves an unowned `adb logcat`.**
   - **Where:** `startStream` in `src/device/android/driver.ts` checks `mayIssue`, then `logcat.start` awaits (`open`, `file.close`) before `lease.own`.
   - **The failure:** the ledger doesn't track streams. If the run is cancelled or times out in those awaits, `close` runs, finds no streams, and releases the lease. `own()` then fails with "not held" and the process keeps running, listed in no holder record. The release spec's phase 4 item 8 ("when the lease is released, nothing the run started can still act on the device") and release check 15 both forbid this.
   - **The fix:** make it impossible. For example, `close` waits for any stream start in flight, within its time limit, and then stops what it started. If `own()` fails, stop the stream that just started before rethrowing.
   - **The test:** a start that resolves after `close` began.
2. **P3: `close` stops only the first stream when that stream won't stop.** Try to stop every stream, and keep the lease (and fail) if any one couldn't be confirmed stopped.
3. **P3: an Android pane without a logcat file shows the iOS header lines** ("app output: unavailable", "system log (subsystem …)"). An Android run's header must never show the iOS source lines.
   - **The header:** it shows "device log (logcat): unavailable" when there's no file, and names the uid filter when there is one.
   - **What the pane needs:** a way to know the run is Android, for example the `hello` message carrying the platform. The socket protocol is internal.
   - **iOS:** its header stays byte for byte.
4. **P3: `nativeCrashNote` can print an unknown signal text.** Map only known signal texts to their names (`SIGSEGV`, `SIGABRT`, `SIGBUS`, `SIGFPE`, `SIGILL`, `SIGTRAP`, `SIGSYS`). Anything else is just "native crash", so no field text ever reaches a note unmapped.
5. **P3: a native crash of the previous instance, logged between the stream start and the restart's force-stop, marks the fresh launch exited.** Start the streams **after** the restart's `am force-stop`, and before `am start -W`. That still satisfies the release spec ("before `am start -W`"). A test pins the new order. Phase 4's exact call lists don't change, because the harness runs with `logFolder: false`.

## Standards findings, judgement calls

6. One threadtime stamp parser, shared by `logcatLine` (`src/logpane/format.ts`) and the watcher (`src/device/android/exit-watch.ts`).
7. One list of event tags: the driver's `EVENT_FILTER` and the watcher's `EVENT`/`PID_FIELD` come from the same constant.
8. Rename the watcher's `deviceTime` helper (it converts a line's stamp to epoch ms; the driver's `deviceTime` reads the device clock), for example `lineEpochMs`.
9. Drop the `export type { AppProblem }` re-export from `exit-watch.ts` if nothing needs it.
10. `run.ts`: pull the `appProblem` / `appRunning` fallback into one small named helper.
11. Tests: share the one `Capture` writable between `tests/logpane.test.ts` and `tests/service.test.ts` through a fixture.

## Recorded, no change

- **The `tests/android-driver.test.ts` harness edit.** It adds `logcat` and `logFolder: false` to the pre-phase-5 driver setup and changes no assertion. The coordinator accepts it as the setup the new seam needs.
- **Accepted deviations stay:** the 0700 fix-up of an owned folder, `logFolder: false`, the sweep order, the crash note's class and location, and the `twin-kill9`/`probe-finish` sorting.

## Acceptance

- A failing test first for each of 1 to 5, then the fix.
- No golden file changes, and iOS output is unchanged.
- `npm run check` passes. No device is touched.

## Comments

### 2026-09-30, claude-issue-26: built, ready for the coordinator

**What I built** (commits `02a9a04`, `8a05209`, `ccb3306`, `5a4817f`):
1. **The stream start and `close`:** `startStream` now stops a stream it just started when `lease.own` fails, then rethrows. Once the stop is confirmed, the entry is disowned. A stream that won't stop stays in `streams` and in the lease's in-memory `owned`, so `close` tries again and the lease can't be released.
2. **`close` tries every stream:** `stopStreams` stops each one (through the new `stopStream`), disowns each confirmed stop, and only then fails with `DEVICE_ERROR`/`adb` if any stop couldn't be confirmed. The lease is kept, and the forward step isn't reached, as before.
3. **The Android header:** the pane's `hello` carries `platform` (`isIosApp(app) ? 'ios' : 'android'`).
   - An Android header prints `device log (logcat, the app's uid only): <path>`, or `device log (logcat): unavailable` when there's no file.
   - The iOS branch is untouched, so an iOS header is unchanged byte for byte. An old bridge's `hello` has no platform, so it gets the iOS header, as before.
4. **Native crash notes:** a signal text is named only when it is one of the seven in `SIGNALS` (`Object.hasOwn`, so a text like `constructor` can't match through the prototype). Anything else is `native crash`.
5. **The order:** `restart` is split into `stopForRestart` (force-stop, then find the activity) and `launch` (`am start -W`). `prepare` now runs: force-stop, launcher lookup, uid, device time, both streams, `am start -W`, `pidof`.
6. **One stamp parser:** `src/device/android/threadtime.ts` has `threadtimeStamp`, used by `logcatLine` and the watcher.
7. **One events list:** the watcher's `PID_FIELD` builds both its `EVENT` regex and the exported `EVENT_FILTER`, which the driver imports. `am_proc_start` stays in the filter, in the release spec's order, so the command is unchanged, and the unchanged `EVENTS` test pins that.
8. **The rename:** the watcher's `deviceTime` is now `lineEpochMs`.
9. **The re-export:** `export type { AppProblem }` is gone from `exit-watch.ts`. Nothing imported it.
10. **The run's check:** `run.ts` has a new `appProblemCode(driver)`.
11. **The test writable:** `tests/fixtures/capture.ts` holds the `Capture` both test files now import.

**Deviations and choices where the Issue left it open**
- **Finding 1 didn't reproduce as described.** `close`'s first step, `lease.settle`, waits for every tracked operation, and that includes `prepare`. So a stream start that resolves after `close` began is stopped by `close` before the release.
  - I wrote the Issue's test ("a start that resolves after `close` began") and a second one ("…after `close`'s limit": the lease is kept, then the late close stops the stream and releases). Both passed before any fix, and they now pin that behaviour.
  - The one real gap was a failing `own()`. Its test ("a started stream the holder record can't list is stopped before prepare fails", with the lease root made read-only) failed first, then passed with the fix.
  - `own()` failing with "not held" can't happen while `prepare` runs, because the lease is only released by `prepare`'s own catch or by `close` after the settle.
- **Where the streams start (5):** after the launcher-activity lookup, just before `am start -W`, not straight after the force-stop. Both satisfy "after the restart's force-stop, and before `am start -W`". With this choice, a failed lookup starts no stream, and the device time is read after the force-stop, so the previous instance's lines are stamped before the start time.
- **`hello.platform` is required** in the internal `PaneMessage` type, and `attach` checks it for `'android'`, so a message without it gets the iOS header.
- **The Android service test changed:** the phase 5 service test "the driver is built with the run's own ID…" ran an iOS script with a logcat source. Now that the header follows the platform, it runs an Android script (an inline literal, as that file's other Android tests do). It was added in phase 5 (`2be6f1b`), so the rule for older tests doesn't apply, and its assertions are unchanged.
- **Where the shared stamp parser lives (6):** `src/device/android/threadtime.ts`. It's Android's log format and has no Node imports, so the pure `format.ts` can import it. The review noted this is the only `src/logpane` import from `src/device/android/`. I kept it: no rule forbids it, and the other homes were `logcat.ts` (which imports `child_process`) or the pane, which would have the device layer import the pane.

**Tests added**
- `tests/android-driver.test.ts`:
  - close stops every stream past a stubborn one (failed first);
  - a start that resolves after close began (passed first, see above);
  - after close's limit (passed first);
  - a stream the holder record can't list (failed first);
  - the phase 5 order test now pins the new order (failed first). To stall a start, `FakeStreams` gained a `held` gate.
- `tests/android-exit-watch.test.ts`: only known signal texts are named (failed first on "User defined signal 1").
- `tests/logpane.test.ts`: an Android pane without a logcat file (failed first).
- No test that existed before `b4ede43` changed an assertion. No golden file changed. No device was touched, and mobilecli never ran.

**Review** (`/code-review` against `2e9f692`)
- **Spec:** 0 defects. It flagged that test-first for 1 to 5 can't be seen in the history, because each test was committed with its fix. The runs above show each failing first, except finding 1's two settle tests. It also flagged a stubborn stream after a failed `own()`: it stays owned, so the lease is kept.
- **Standards:** 0 hard violations, 5 judgement calls. I fixed two in `5a4817f`: `ThreadtimeStamp` now carries the date as written, so `lineEpochMs` no longer slices the raw line, and a stray blank line is gone. I left three: the seven numeric stamp fields, `.catch(() => undefined)` (the idiom `driver.ts` already uses), and the inline Android scenario literal (the idiom `service.test.ts` already uses).

**Gate:** `npm run check` passed, 491 of 491 tests, at `5a4817f`. The log is `$TMPDIR/implement-phase5-26-check.log`.
