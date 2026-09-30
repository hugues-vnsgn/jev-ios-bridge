# Phase 5: the logcat line parser and the app-exit watcher

Status: claimed
Claimed by: claude-issue-18
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
   export function createExitWatch(options: { package: string; startTime: number; utcOffsetMinutes: number }): AppExitWatch;
   ```

   `startTime` is the device time in epoch seconds, with milliseconds, that the streams were started from, and `utcOffsetMinutes` is the device's UTC offset (Issue 19 reads both in one `date +'%s.%3N %z'` call).
   - **Timestamps:** the lines carry device local time with no zone (`2026-09-28 23:22:52.533`). Convert each with `utcOffsetMinutes` and ignore any line stamped before `startTime`. A line whose time doesn't parse is ignored.
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

## Comments

### 2026-09-30, claude-issue-18

**Built** on `agent/android-v1.2-phase5-issue-18`: `9ef9ba5` (parser), `d57b3b2` (watcher), `b1f5980` (review fixes). `npm run check` passes at `b1f5980`: 434 of 434 tests, then a clean build. No device was touched, and mobilecli was never run.

- **`logcatLine(raw)`** in `src/logpane/format.ts`, beside `appLine`/`osLine`, which weren't changed. It is the prototype's regex and rules: `System.out`/`System.err` → `app` with the bare message; any other tag → `os` with `[Tag] message`; `E F A` → `error`, `V D` → `dim`, `I W` → `normal`; the time is the line's `HH:MM:SS.mmm`; blanks, `--------- beginning of …` dividers and lines that don't parse give `undefined`.
- **`createExitWatch`** in `src/device/android/exit-watch.ts`, exporting `AppProblem`, `AppExitWatch` and `createExitWatch` with exactly the Issue's shape.
  - **Timestamps:** each line's `YYYY-MM-DD HH:MM:SS.mmm` is read as device local time, then converted with `utcOffsetMinutes`. A line before `startTime` is ignored. So is one whose stamp is missing or isn't a real time, for example hour 25 or 30 February. Comparisons are in whole milliseconds, so floats can't cause an off-by-one.
  - **Kept events:** the watcher keeps only the `am_crash`, `am_anr`, `am_kill` and `am_proc_died` lines that name the package or the launched pid, so the list stays short. It folds them in order whenever `running()` or `problem()` is asked. This means an event that arrives before `launched()` still counts once the pid is known, for example a background crash between `am start -W` and `pidof`. After `streamEnded()`, fed lines are ignored.
  - **Matching** is the prototype's:
    - `am_crash` needs both the package and the pid (field 0). With `Native crash`, it needs the package alone.
    - `am_kill` and `am_proc_died` match by pid (field 1). A kill reason starting `stop ` is a force-stop, and any other reason is a kill.
    - `am_anr` by pid means frozen.
    - The first exit wins.
  - **`running()`:** `false` once an exit is seen, including an expected one. Otherwise it is `undefined` before `launched`, after `launched(undefined)`, or after `streamEnded()`. In every other case it is `true`, and that includes a freeze.
  - **`problem()`:**
    - an unexpected exit gives `APP_EXITED` with its note;
    - failing that, a freeze gives `APP_NOT_RESPONDING` "not responding";
    - otherwise `undefined`.

**Deviations and choices the Issue left open:**
- **`twin-kill9` gives "exited", not "killed", and `probe-finish` gives running, not "exited".** The Issue's acceptance list says otherwise, but the release spec item 7 and the Issue both say to sort every run "as the prototype did". The prototype, run over the captures, gives "exited" and running, and so do the findings (06-log-pane.md, table and "Over every captured run"). The data can't support the Issue's list: `kill -9` logs only `am_proc_died`, the same as `System.exit`, and `finish()` logs no event at all. Both notes still give `APP_EXITED` or nothing, as the run needs. The acceptance list in this Issue should be corrected; I left that to the coordinator.
- **The crash note uses the exception class and where it was thrown**, taken from `am_crash`'s own fields, for example "crashed: IllegalStateException at MainActivity.java:59" or "crashed: CrashedByAdbException at ActivityThread.java:2513". A nested class shows its innermost name. The Issue's example, "FATAL EXCEPTION on main", exists only in the app log (`AndroidRuntime`), which the note mustn't use, and the event carries no thread name. The event's message field is the exception's message, which is the app's own text and could hold a script value, so it is never used. The file and line are read from the end, because a message can contain commas. The class, file and line must each match a narrow character set, or they are left out, which leaves "crashed".
- **The native crash note** maps the event's `strsignal()` text to the signal's name: "Segmentation fault" becomes SIGSEGV, and the table also has ABRT, BUS, FPE, ILL, TRAP and SYS. Unknown text that passes a narrow character check is shown as it is. Otherwise the note is just "native crash".
- **Expected stops:** after `expectStop()`, an `am_kill` (any reason) or `am_proc_died` gives no problem. An `am_crash` still counts, whether it arrives before or after `expectStop()`. A freeze seen before the bridge's own stop still gives `APP_NOT_RESPONDING`. The Spec review caught that this was masked in the first cut.
- **`streamEnded()` after a freeze:** `running()` is `undefined` and `problem()` stays `APP_NOT_RESPONDING`. Issue 20 should know about this combination.
- **Fixtures** (`tests/fixtures/android/logcat/<run>/`, 13 runs):
  - `uid.log` and `events.log` are copied with the host-ms stamp and the capture tool's closing `EXIT …` line stripped. A probe run's `events.log` is its `lifecycle.log`.
  - The twin captures had no `meta.txt`, so I wrote one holding `pid=` from each run's `steps.json` "pid" step.
  - No `meta.txt` names the package, so the tests take it from the run name (`twin-` → `dev.jevbridge.diagnostic`, `probe-` → `dev.jevbridge.logprobe`).
  - The README says all this.
- **`probe-normal`** is tested running with its restart pid (10107), because the restart's force-stop comes before `pidof`. With its first pid (9784) it is the fixture for the bridge's own stop.
- **Not verified:** `am_crash`'s field order on API 31. The prototype's pid-first order is from API 36. Phase 8's live runs will show it.

**Tests added:**
- **`tests/android-logcat-line.test.ts` (4):**
  - every captured app-log line parses or is a divider, with per-run counts matching the prototype's (1,009 parsed in all);
  - the source rules, including a `System.err` stack line and unicode;
  - the level rules on `E`, `F`, `A`, `D`, `V`, `I` and `W` lines;
  - blanks, dividers and unparsed lines give nothing.
- **`tests/android-exit-watch.test.ts` (15):**
  - every captured run is sorted as the prototype did;
  - `probe-normal`'s restart;
  - a stale native crash before the start time is ignored;
  - the UTC offset places a line;
  - a line with a bad time is ignored;
  - the bridge's own stop, both `am_kill stop` and `am_proc_died`;
  - a crash before `expectStop()` still counts;
  - a freeze before `expectStop()` still counts;
  - a pid event matches whatever process name it carries;
  - a freeze followed by an exit counts as an exit;
  - a non-stop `am_kill` is a kill;
  - "can't tell" before `launched`, after `launched(undefined)`, and after `streamEnded()`;
  - a native crash counts before `launched`;
  - a crash fed before `launched()` counts once the pid is known;
  - no note holds an app-log line, and a comma-laden secret message never reaches a note.

**Review** (`/code-review`, fixed point `2cad0f5`):
- **Standards:** 0 hard violations and 5 judgement calls, all fixed in `b1f5980`: the event field layouts are now documented, with a per-tag pid index; the non-null assertions and long lines are gone; the test helper no longer repeats itself.
- **Spec:** no blocking gaps, 3 actionable findings, all fixed or recorded above. The freeze masked by an expected stop is fixed. Pid events now match by pid alone, as in the prototype. The derived package and twin pids are recorded.
