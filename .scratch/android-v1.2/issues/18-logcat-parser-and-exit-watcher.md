# Phase 5: the logcat line parser and the app-exit watcher

Status: ready-for-agent
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 5". The work is [the release spec's phase 5](../../android-support/release-spec.md#phase-5-the-log-pane-and-app-exit-detection-log-pane-and-app-exit-detection-on-android-where-android-plugs-into-the-code-item-7) items 2 (the parser), 4 (the watcher), 6 (reason codes and notes) and 7 (tests). The measurements are in [the log pane findings](../../android-support/findings/06-log-pane.md), and the prototypes are `logcat-line.mjs` and `exit-watch.mjs` in `../../android-support/findings/06-assets/`. Read them in full. The detail below only adds acceptance criteria and fixes the watcher's shape, which Issues 19 and 20 rely on.

Both pieces are pure functions: no device, no process, no timer.

## Files this Issue owns

- `src/logpane/format.ts` (add `logcatLine` only; don't change `appLine`, `osLine`, `masker` or `renderLine`);
- a new `src/device/android/exit-watch.ts`;
- new fixtures under `tests/fixtures/android/logcat/`;
- new tests `tests/android-logcat-line.test.ts` and `tests/android-exit-watch.test.ts`.

Issue 19 is built in parallel and owns the Android driver. Don't edit `src/device/android/driver.ts`, `src/contracts/`, `src/scripted/` or `src/service.ts`.

## What to build

1. **`logcatLine(raw)`**, a `PaneLine` parser for `adb logcat -v threadtime,year,uid` lines, lifted from the prototype:
   - `System.out` and `System.err` become source `app`, with the message as the text;
   - every other tag becomes source `os`, with text `[Tag] message`;
   - levels `E`, `F` and `A` are `error`, `V` and `D` are `dim`, and the rest are `normal`;
   - the time is the line's `HH:MM:SS.mmm`;
   - blank lines, `--------- beginning of …` dividers and lines that don't parse give `undefined`.
2. **The app-exit watcher**, exported with exactly this shape (Issue 19's driver types it structurally, so keep the names):

   ```ts
   export type AppProblem = { code: 'APP_EXITED' | 'APP_NOT_RESPONDING'; note: string };
   export interface AppExitWatch {
     feed(raw: string): void;      // one line of `logcat -b events -v threadtime,year`
     launched(pid: number | undefined): void;  // from `pidof` after `am start -W`; undefined = none found
     expectStop(): void;           // the bridge is about to force-stop the app itself
     streamEnded(): void;          // the events stream exited on its own
     running(): boolean | undefined;   // undefined = can't tell
     problem(): AppProblem | undefined;
   }
   export function createExitWatch(options: { package: string; startTime: number }): AppExitWatch;
   ```

   `startTime` is the device time in epoch seconds, with milliseconds, that the streams were started from.
   - **Timestamps:** read each line's timestamp as device local time. Take the device's UTC offset from the line, or compare the line's local date and time against `startTime` converted with an offset the caller passes. Pick one approach and pin it with a test. The rule is that a line stamped before `startTime` is ignored. If the line format can't carry this reliably, say so in your report and ignore by `am_proc_start` order instead.
   - **Matching:** match as the prototype does:
     - `am_crash` for the pid is a crash;
     - `am_crash` for the package whose type is `Native crash` is a native crash, whatever its pid;
     - `am_kill` for the pid with a `stop …` reason is a force-stop, and any other reason is a kill;
     - `am_proc_died` for the pid is an exit;
     - `am_anr` for the pid is "not responding". The app is still running, and a later exit still counts.
   - **Expected stops:** after `expectStop()`, an exit is expected and gives no problem. A crash seen before it still does.
   - **Can't tell:** before `launched`, after `launched(undefined)`, or after `streamEnded()` with nothing seen, `running()` is `undefined` and `problem()` is `undefined`. A native crash matched by package still counts before `launched`.
   - **Problems:** `problem()` gives `APP_EXITED` for every exit cause, and `APP_NOT_RESPONDING` for a freeze with no later exit. The note names the cause in plain words: "crashed: <the crash's short message, for example FATAL EXCEPTION on main>", "native crash: <signal>", "killed", "force-stopped by another process", "exited" or "not responding". Take the short message only from the event's own fields, never from the app's log text, and keep it to one short line with no script value in it. Say what you used in your report.
3. **Fixtures:** copy the lines you use from `findings/06-assets/captures/` into `tests/fixtures/android/logcat/`, keeping each run's folder name, so tests never read `.scratch`. Strip the host-ms stamp the capture tool added (`^\d{13} `), or keep it and strip it in the test helper. Add a README of three lines saying where they came from.

## Acceptance

- **The parser:** every app-log line in the copied captures parses or is a divider, and no line is dropped unexpectedly (assert the counts). Tests pin the source, level and tag rules on hand-picked lines, including a `System.err` stack line, a `F`/`A` native dump line and a `D` line.
- **The watcher sorts every captured run as the prototype did:** `twin-normal` and `probe-normal` running; `twin-amcrash`, `probe-crash`, `probe-bgcrash` (process alive behind the dialog) crashed; `twin-segv` and `probe-native` native crash; `twin-kill9` killed; `twin-forcestop` force-stopped; `probe-exit` and `probe-finish` exited; `twin-home` running; `probe-anr` `APP_NOT_RESPONDING`. Use each capture's `meta.txt` for the package and pid.
- **Stale crashes:** a native crash for the package placed before `startTime` is ignored.
- **The bridge's own stops:** `expectStop()` then a `stop …` `am_kill` or `am_proc_died` gives no problem.
- **Can't tell:** `launched(undefined)` and `streamEnded()` answer `undefined`.
- **Notes:** no note contains a line from the app log.
- `npm run check` passes. No device is touched.
