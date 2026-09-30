# Phase 5: fix the whole-branch review findings

Status: ready-for-agent
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
