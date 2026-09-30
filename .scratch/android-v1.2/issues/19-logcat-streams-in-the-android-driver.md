# Phase 5: the logcat streams in the Android driver

Status: ready-for-agent
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 5". The work is [the release spec's phase 5](../../android-support/release-spec.md#phase-5-the-log-pane-and-app-exit-detection-log-pane-and-app-exit-detection-on-android-where-android-plugs-into-the-code-item-7) item 1 (the log stream), the stream side of item 4 (the events stream, `pidof`), step 4 of [phase 4's `close`](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) (item 8), and the crash-takeover sweep of the streams (phase 2's holder record, release check 15). Read them in full, with the spec's "Phase 5" Implementation Decisions. The detail below only adds acceptance criteria.

## Files this Issue owns

- `src/device/android/driver.ts`;
- a new `src/device/android/logcat.ts` (the stream starter and the log folder);
- `src/contracts/index.ts`, only to add `logcat?: string` to `logSources()`'s return type;
- tests: extend `tests/android-driver.test.ts`, and a new `tests/android-logcat.test.ts`.

Issue 18 is built in parallel and owns `src/logpane/format.ts` and `src/device/android/exit-watch.ts`. Don't create or edit either. The run, the pane, the service and the CLI belong to Issue 20.

## What to build

1. **The stream starter**, the phase's one new seam, injected into the driver's options beside `runner`. It defaults to the production form.
   - **`start(args, output, signal?)`:** `output` is either a file path or a line callback. It spawns `adb` with `adbEnvironment()` and no shell, and returns `{ pid, stop(): Promise<void>, exited: Promise<void> }`.
     - A file output goes straight to a file descriptor opened `O_CREAT|O_EXCL`, mode 0600, so nothing is buffered in the bridge.
     - `stop` sends SIGTERM, then SIGKILL after 1 s, and resolves once the process has exited. It resolves at once for one that already exited.
   - **`isLeftover(pid, serial)`:** true only when the Mac process with that pid is still an `adb` command line holding `-s <serial>` and `logcat`.
   - **`kill(pid)`:** the same escalation, for a pid the bridge didn't spawn in this process. It resolves once the pid is gone.

   Test the production form with a fake spawn and a fake process lister, as `tests/fixtures/adb-spawn.ts` does for the `adb` runner.
2. **The log folder:** `jev-android-logs/` under `os.tmpdir()`, created 0700.
   - Refuse to use a path that exists but is a symlink, isn't a directory, or isn't owned by this user. The streams are then not started, the run goes on, and there's no pane source.
   - At each `prepare`, delete regular files there whose modification time is older than 3 days. A failed delete never fails the run.
   - The app's log file is `<run ID>.log`. If the driver has no run ID, pass one in through the factory options the way `screenshotFolder` comes in, and say which you chose.
3. **`prepare`,** in the spec's order. After the device checks and wake, and before the restart:
   - clean the folder;
   - read the uid by an **exact** match on `package:<package> uid:<n>` in the full `pm list packages -U` output, never by passing the package as a filter;
   - read the device time and its UTC offset in one call, `date +'%s.%3N %z'` (the offset is for Issue 18's watcher, whose lines carry local time with no zone);
   - start the app log with `logcat -v threadtime,year,uid --uid=<uid> -T <time>` to the file;
   - start the events stream with `logcat -b events -v threadtime,year -T <time> am_proc_start:I am_proc_died:I am_crash:I am_anr:I am_kill:I *:S`, line by line.

   Each stream is `lease.own('logcat <serial> <pid>')`'d as soon as it has a pid. After `am start -W`, run `pidof <package>` once. A missing uid or device time, or a stream that fails to start, doesn't refuse the run: log nothing sensitive, skip the streams, and go on.
4. **The events sink.** The driver takes an optional `createExitWatch({ package, startTime, utcOffsetMinutes })` in its options. Type it structurally in `driver.ts` with the `AppExitWatch` shape written in Issue 18 (`feed`, `launched`, `expectStop`, `streamEnded`, `running`, `problem`), because Issue 18's module doesn't exist on your branch yet.
   - Feed it every events line, `launched(pid)` after `pidof`, and `streamEnded()` when the events stream exits by itself.
   - Call `expectStop()` before `close`'s force-stop.
   - The driver's `appRunning()` returns the watch's `running()`, or `undefined` with no watch.
   - Don't import or implement the real watcher. Issue 20 wires it in.
5. **`logSources()`** returns `{ logcat: <file> }` once the app log started. **`observe`**'s snapshot carries `logTails: { logcat: … }` from `readLogTail` (`src/device/logs.ts`) when a log file exists.
6. **`close` step 4,** at the marked placeholder, after the app stop and before the forward:
   - stop both streams and wait for them to exit, tolerating one that already ended;
   - disown each, and keep the lease with `CLEANUP_FAILED` if a stop can't be confirmed.

   It runs whether or not the app was restarted, because streams can start before a failed restart. It is never a tracked ledger command.
7. **The takeover sweep.** With a dead holder, before the device checks, sweep each of its `logcat <serial> <pid>` entries:
   - `kill` the pid only when `isLeftover(pid, serial)`, then disown the entry;
   - disown an entry whose process is gone or isn't a leftover, without killing it.

   Stopping any leftover sets `sweptLeftovers: true`. Check how `take` hands over the dead holder's entries and whether they stay owned until disowned, and say what you found.

## Acceptance

- **The order:** tests pin the exact `adb` arguments, in order: the uid, time and stream starts before `am force-stop` and `am start -W`, and `pidof` after it.
- **Exact uid matching:** a package that is a prefix of another (`com.example.app` beside `com.example.app.debug`) gets the right uid.
- **Modes:** the folder is 0700 and the file 0600. A symlinked or foreign folder is refused. Files older than 3 days are deleted, and newer ones and live files are kept.
- **The holder record:** it lists both `logcat …` entries while the run is live, and neither after `close`.
- **A normal `close` with both streams still running:** the streams are stopped, the lease is released, and the run can pass (release spec item 7).
- **A stream that won't stop:** it keeps the lease and fails `close`.
- **The sweep:** it kills only a pid `isLeftover` confirms, disowns every entry, and sets `sweptLeftovers: true`. A reused pid running something else is left alone.
- **Environment:** the streams get `adbEnvironment()`, so `TYPESAFE_API_KEY` is absent and `ANDROID_ADB_SERVER_PORT` is kept.
- **Log tails:** `logTails.logcat` holds the file's tail.
- **Existing tests keep their assertions.** Phase 4's driver tests may need the new fake stream starter in their setup. Add it as a default in the shared helper rather than editing each test's assertions.
- `npm run check` passes. No device is touched.
