# Phase 5: the logcat streams in the Android driver

Status: closed
Closed: Merged into agent/android-v1.2-phase5 at c38fcef
Claimed by: claude-issue-19
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

## Comments

### 2026-09-30, claude-issue-19: built, ready for the coordinator

**What I built** (commits `8896364`, `7b75c25`):
- `src/device/android/logcat.ts`:
  - `logcatStarter()`, the production stream starter:
    - `start` spawns `adb` directly, with no shell and with `adbEnvironment()` (the Jev key is stripped again).
    - A file stream's stdout is a descriptor on a file opened `O_CREAT|O_EXCL|O_NOFOLLOW`, mode 0600. A line stream goes through readline.
    - `stop` sends SIGTERM, then SIGKILL after 1 s, and rejects if the stream is still alive 2 s after that.
    - `isLeftover` reads the command line from `ps -o command=`.
    - `kill` uses the same escalation for any pid.
  - `privateLogFolder()`: creates the folder 0700, or refuses it.
  - `deleteOldLogs()`: deletes files older than 3 days.
- `src/device/android/driver.ts`:
  - new options `logcat`, `logFolder`, `runId` and `createExitWatch`;
  - `AppExitWatch` typed structurally with Issue 18's shape;
  - in `prepare`, after the device checks: clean the folder, read the uid, read the time, start both streams; then the restart; then `pidof`;
  - each stream is `lease.own`'d as soon as it has a pid;
  - `appRunning()`, `logSources()`, and `logTails.logcat` in `observe`;
  - `close` step 4, with `expectStop()` before the force-stop;
  - the takeover sweep of the streams.
- `src/contracts/index.ts`: `logcat?: string` added to `logSources()`'s return type.

**Choices the Issue left open, and deviations:**
1. **Run ID.** The driver has none, so I added a `runId` option. Without it, the driver uses `randomUUID()`. Issue 20 should pass the service's run ID in. Today the service calls `createDriver` before it makes the run ID (`src/service.ts:54-57`), so that order needs changing.
2. **What `take` does with the dead holder's entries.** `take` unlinks the dead holder's file and returns its record only in memory; the new lease starts with `owned = []`. So nothing is handed over, and nothing stays owned.
   - The sweep therefore owns each `logcat …` entry again in the new record before it acts, then disowns it. A crash mid-sweep then leaves the entry for the next run.
   - There is still a small gap between `take`'s unlink and that re-own. It belongs to phase 2's `take` design.
3. **When the sweep runs.** The stream sweep runs before the agent check, not after. It touches only the Mac, so crashed streams are stopped even when a foreign agent then refuses the run. It is still "step 4" and still before the device checks.
   - It uses each entry's own serial for `isLeftover`.
   - A leftover that won't die fails `prepare` with `DEVICE_ERROR`/`adb` and keeps the lease.
4. **A deviation in the shared test helper.** Phase 4's first driver test (`tests/android-driver.test.ts`, "prepares an emulator named by serial…") pins every `adb` call of `prepare` exactly. So the uid, time and `pidof` reads can't run in the shared helper without editing that assertion.
   - I added `logFolder?: string | false`. `false` behaves like a refused folder: no stream, and no uid, time or `pidof` read.
   - The helper defaults to `logFolder: false` plus a default fake stream starter. Phase 5's tests name a folder.
   - No pre-phase-5 assertion changed.
5. **The streams are independent.**
   - A refused folder, or a device time that can't be read, skips both streams.
   - A missing uid skips only the app log. The events stream needs no uid.
   - A stream that fails to start skips only itself.
   - `pidof` runs only when the events stream started, because its only reader is the watcher. With no events stream, nothing is watched and `appRunning()` is `undefined`.
6. **`pidof`:** anything but exactly one pid is `launched(undefined)`.
7. **The uid:** `^package:<name> uid:<n>$`, matched exactly on the whole name. A line with several uids (multi-user) counts as no uid.
8. **An existing folder:** one that belongs to this user but has a wider mode is changed to 0700.
9. **Error for a stream that won't stop:** it fails `close` with `DEVICE_ERROR`/`adb`, which the run records as `CLEANUP_FAILED`, as for the other cleanup steps.
10. **The events stream when no watcher is given:** without `createExitWatch`, which is the case until Issue 20 wires it, the events stream still starts and its lines are dropped.

**Tests added:**
- `tests/android-logcat.test.ts`, 19 tests:
  - spawn arguments and environment;
  - the file's 0600 mode and the descriptor output;
  - `O_EXCL` and symlink refusal;
  - lines delivered, including split chunks;
  - the SIGTERM→SIGKILL escalation, an already-exited stream, and a stream that never dies;
  - a spawn failure (no orphan file) and a cancelled start;
  - `isLeftover` cases, including a reused pid, another serial, and an adb path with a space;
  - `kill` escalation;
  - folder mode and refusal (symlink, file, another user's);
  - the 3-day clean-up.
- `tests/android-driver.test.ts`, 19 new tests:
  - the exact order;
  - a negative UTC offset;
  - the prefix-package uid;
  - missing uid, missing time, and failed starts;
  - a refused folder;
  - the clean-up at `prepare`;
  - `appRunning`, and `streamEnded` only when the stream ends by itself;
  - `logTails.logcat`;
  - `close` order and tolerance, a stream that won't stop, and `close` after a failed restart;
  - the sweep, a sweep with nothing left, and a leftover that won't die;
  - a `runScriptedScenario` run that passes, with `prepared.logSources.logcat` and a redacted step tail.

**Gate:** `npm run check` passed, 453 of 453 tests, at `7b75c25`. No device was touched.

### 2026-09-30, coordinator: accepted

Accepted, including the `logFolder: false` test option (phase 4's exact `adb` call list stays unchanged) and the sweep order (a crashed run's streams go before the foreign-agent check). For Issue 20: the driver takes a `runId` option, and `BridgeService` creates the driver before it makes the run ID, so that order must change to pass the real one. The events stream runs with its lines dropped until Issue 20 wires in the watcher.
