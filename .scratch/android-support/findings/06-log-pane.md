# Findings for "Log pane and app-exit detection on Android"

Measured 2026-09-28 on the emulator `Medium_Phone_API_36.1` (`emulator-5554`, Android 16, API 36) only, through a private adb server on port 5098 started with `--one-device NO_SUCH_USB_DEVICE`. `adb -P 5098 devices` listed only `emulator-5554` every time; the Xiaomi `2985e9c` never appeared. mobilecli 1.0.14 ran from `/tmp/jev-mcli-06` with the guard environment from `docs/research/mobilecli-dependency.md` (wrapper: `06-assets/mcli.sh`, which refuses to run if adb lists any other device).

These are facts and proposals. Nothing here is decided; the owner decides.

## Short answer

- **Source:** `adb logcat --uid=<app uid>`. The app's uid stays the same across restarts, so one stream follows every restart with no re-attach. It also catches native crash dumps, which `--pid` misses. mobilecli's `device logs` can't follow a freshly launched app: it labels every line of a new process `zygote64`.
- **Pane:** the driver writes that stream into an owner-only file, and the pane keeps following files. It only needs a new logcat line parser. Masking stays as it is on iOS.
- **Exit detection:** a second small stream, `logcat -b events` filtered to the `am_*` process events, gives a synchronous "running / crashed / exited / force-stopped / not responding" state within about 5–40 ms. `pidof` alone misses a crash that leaves an "app has stopped" dialog up, and it misses ANRs.
- **Cause after the fact:** `dumpsys activity exit-info <package>` names why each process ended (crash, native crash, signal, force stop, exit, ANR).

## How it was measured

- **Log probe:** a throwaway app, `dev.jevbridge.logprobe` (`06-assets/logprobe/`, built by `build.sh` with the SDK build tools and a throwaway signing key, no Gradle). It writes `Log.v/d/i/w/e`, `System.out.println`, `System.err`, a two-line message, unicode, a script-like secret (`hunter2-SECRET` and its upper-case copy), a handled exception, and a tick every 500 ms carrying its own epoch ms. After 3 s it misbehaves on request: `crash` (main thread), `bgcrash` (background thread), `native` (`Process.sendSignal(myPid(), 11)`), `anr` (main thread sleeps 40 s, then `input tap`), `exit` (`System.exit(0)`), `finish`.
- **Twin app:** `dev.jevbridge.diagnostic`, driven like a bridge run by `06-assets/twin-run.mjs`: `am force-stop`, `am start -W`, then `mobilecli dump ui --format raw` and a tap on `choose.apple`. Next came a disruption (`am crash`, `run-as … kill -SEGV <pid>`, `run-as … kill -9 <pid>`, `am force-stop`, or HOME), then attempts on `choose.bread` and `order.complete`.
- **Streams**, each in its own process with a host arrival stamp (`06-assets/stamp.mjs`):
  - `adb logcat -v threadtime,year,uid --uid=<uid> -T <device time>`
  - `adb logcat -v … --pid=<pid>`
  - `adb logcat -b crash`
  - `adb logcat -b events … am_proc_start:I am_proc_died:I am_crash:I am_anr:I am_kill:I *:S`
  - `mobilecli device logs --filter …`
  - `pidof`, polled every 100 ms (`06-assets/poll-pidof.mjs`)
- **Lag:** host arrival minus the tick's own device timestamp, corrected by the measured clock offset (the device ran 1,915 ms behind the host; `adb shell date +%s%3N` against the host clock, three reads, ±2 ms).
- Captures are in `06-assets/captures/`. Whole-device logs weren't kept, because they name other installed packages.

## 1. The source

| | `adb logcat --uid=<uid>` | `adb logcat --pid=<pid>` | `mobilecli device logs --filter …` |
| --- | --- | --- | --- |
| Follows a restart | **Yes.** One stream showed pid 9784, then pid 10107 after `am force-stop` + `am start -W`, with no gap | No. The stream stays open but goes silent when the pid dies; a new stream is needed for each launch | No, for a freshly launched app (see below). `--filter pid=` needs a new stream for each launch |
| Lag (median / p90 / max) | 6 / 7 / 11 ms (32 ticks) | 6 / 8 ms (the max of 323 ms was replay at attach) | 8 / 13 ms (22 ticks) |
| Native crash dump (`DEBUG` tombstone lines) | **Yes**, 84 lines. `crash_dump64` runs under the app's uid with a different pid | **No**, 0 lines. Only the one `libc: Fatal signal 11` line | Yes when unfiltered |
| Java crash (`AndroidRuntime: FATAL EXCEPTION` + stack) | Yes | Yes | Yes when unfiltered |
| ANR | Only "Wrote stack traces to tombstoned". The ANR itself is logged by `system_server` (uid 1000) | Same | Unfiltered only |
| Other apps' and system lines | None | None | Everything: 3,144 JSON lines in about 22 s, unfiltered |
| Format | `threadtime` text | Same | One JSON object per line: `timestamp, message, level, pid, process, tag`. No uid |

**mobilecli can't follow the app.**
- It names a process when it first sees that pid. A new app process logs its first line while it is still the zygote child, so every line of every process started after the stream began came out as `"process":"zygote64"` (twin run: pid 13784 had 38 JevProbe, 16 AndroidRuntime and 1 System.out line, all labelled `zygote64`).
- Only a process that was already running before the stream started (pid 13416) was labelled `dev.jevbridge.logprobe`.
- So `--filter process=dev.jevbridge.logprobe` returned 0 lines for a crash run and only 6 late ticks for a native run (`captures/mobilecli-device-logs-probe-lines.jsonl`).
- It also has no uid field, so there's nothing stable to filter on.

**What the uid stream shows** (probe, `captures/probe-*/uid.log`):
- `Log.v/d/i/w/e`: tag `JevProbe`, levels `V D I W E`.
- `println` / `System.out`: tag `System.out`, level `I`. `System.err`: tag `System.err`, level `W`.
- A two-line message becomes two lines, each with the full header.
- Unicode (`café ✓ Tiếng Việt`) arrives intact.
- A handled exception passed to `Log.e(tag, msg, t)` arrives as one line per stack frame.
- A Java crash starts with `AndroidRuntime: FATAL EXCEPTION: <thread>`, then `Process: <pkg>, PID: <pid>` and the stack, then `Process: Sending signal. PID: … SIG: 9`.
- A native crash starts with `libc: Fatal signal 11 (SIGSEGV)…`, then about 84 `F DEBUG` lines: build, registers, backtrace, and `Cmdline: <pkg>`.
- `System.exit(0)` ends with `System.exit called, status: 0` and `AndroidRuntime: VM exiting with result code 0`.
- The framework also logs from inside the app's process: `GraphicsEnvironment`, `HWUI`, `nativeloader`, `Choreographer`, `ImeTracker`, and so on.
  - The twin app prints nothing itself, so all of its 31 lines per launch are this kind.
  - The probe gave 153 uid lines in 17 s, against 1,371 lines in the whole log.

**Format quirks:**
- `-v threadtime,year,uid` gives `2026-09-28 23:16:14.927 10226  9784  9784 D JevProbe: debug line`.
- A single regex parsed every one of the 1,583 uid lines captured, with 0 failures (`06-assets/logcat-line.mjs`).
- `--uid` with a *count* tail (`-t 5`, `-T 5`) returns **0 lines** even when the app has 535 matching lines, while `--pid … -t 5` works. So the stream must start from a *time*: `-T <device epoch seconds.ms>`, read with `adb shell date +%s.%3N`.
- `logcat --uid` wants a number. Get it exactly with `adb shell cmd package list packages -U` and an exact match on the package. `pm list packages -U <name>` matches substrings.
- Killing the host `adb logcat` with SIGTERM also ends the logcat on the device (checked with `ps -A`).

**The API 31 question (not settled here):**
- The Android 11 logcat source (AOSP `system/core` `android11-release`, `logcat/logcat.cpp`, fetched from the GitHub mirror) has `--pid` and no `--uid`.
- The API 36 emulator has `--uid`.
- I couldn't fetch the Android 12 source (googlesource returned 503), and the API 31 AVD belongs to another agent. One command settles it there: `adb shell logcat --help | grep -- --uid`.

## 2. How the pane takes a streaming source, and what it masks

**Today (iOS).**
- `startLogStream` (`src/logpane/stream.ts`) polls two files that MobileBuildMCP writes (runtime console, os log) every 200 ms. It parses them with `appLine`/`osLine`, masks script values as `[value:<key>]`, and serves the lines over an owner-only Unix socket.
- It also parses MobileBuildMCP's `_helperpid<N>_` out of the runtime file name to notice the app dying. That duplicates `MobileBuildMcpDriver.appRunning()` (`src/device/index.ts:375`).
- Separately, the driver reads the last 4 KB of each file into every capture's `logTails`, which go into `run.jsonl` redacted.
- The `logs` command prints the file paths when the run is over.

**Android has one stream and no file.** Three ways to connect it:

- **a. The driver writes the uid stream to a file.**
  - The driver spawns `adb logcat --uid` in `prepare` (before `am start -W`, from the device time, so startup lines are included) and appends every line to an owner-only file. It kills the stream in `close`.
  - It returns `{ logcat: <path> }` from `logSources()`.
  - The pane module stays a file follower; it only gains a `logcatLine` parser for that source.
  - `logTails` reuse `readLogTail` unchanged, the `logs` fallback still points at a file after the run, and the pane's 200 ms poll adds at most 200 ms of lag.
  - The file is the seam, and it already has two adapters (MobileBuildMCP's files, the Android driver's file), so the seam is real.
  - Cost: unmasked app logs on disk. That's what MobileBuildMCP already does on iOS (it deletes them after about 3 days, as `09-data-handling.md` says).
- **b. The pane gets a process adapter** beside the file follower and spawns its own `adb logcat`.
  - The pane would need the serial, the uid and the adb environment, so device knowledge leaks into the pane.
  - A second logcat duplicates the driver's.
  - After the run there's nothing to point `logs` at.
- **c. The driver exposes an in-memory feed** (a new `DeviceDriver` method like `subscribeLogs(listener)`); the pane gets a push adapter, and the driver keeps a ring buffer for `logTails`.
  - Nothing touches disk.
  - The cost is a new interface method, a second pane adapter, and no post-run file.

With (a), `startLogStream` stays a deep module: the same small interface, and one more parser behind it. Whichever option wins, the `_helperpid` parsing should leave `stream.ts`. The pane should take the driver's `appRunning` (or its successor) as an option instead, so it knows nothing about how any device layer names its files.

**Pane lines** (prototype `06-assets/logcat-line.mjs`):
- `System.out`/`System.err` become `[app]`, the console, like `print` on iOS.
- Every other tag becomes `[os] [Tag] message`, like `[category] message` for os_log on iOS.
- Levels `E F A` are red, `V D` are dim, and `I W` are normal.
- The line's own time is shown.

**Masking.** Same rule as iOS, nothing extra:
- Script values become `[value:<key>]` in the pane; `run.jsonl` (with `logTails`) says `[REDACTED]`.
- What was checked for Android specifically:
  - `am start --es` extras weren't printed by the system: `hunter2-SECRET` appeared only in the probe's own lines. The system logs `(has extras)`.
  - Text typed with `mobilecli io text` into Settings search appeared in no log buffer (`logcat -b all`).
  - The uid filter also keeps other apps' and the keyboard's lines out.
- The known limit carries over: the upper-case copy `HUNTER2-SECRET` would not be masked. Apps that log tokens leak them to the file, exactly as on iOS.

## 3. `appRunning()` and `APP_EXITED`

On iOS, `appRunning()` is synchronous: `process.kill(helperPid, 0)` on a local process. `run.ts:341` calls it only when a step has already failed. If it returns `false`, the run's reason becomes `APP_EXITED` instead of the symptom.

**What each disruption looks like** (host ms after the cause; `pidof` polled every 100 ms, so its figures carry up to 100 ms of granularity):

| Disruption | `pidof` | Log stream (uid) | `-b events` | `exit-info` reason |
| --- | --- | --- | --- | --- |
| `am crash` (twin) | empty at +26 ms | `FATAL EXCEPTION: main … CrashedByAdbException: shell-induced crash` at +3 ms | `am_crash` +4 ms, `am_proc_died` +42 ms | `4 APP CRASH(EXCEPTION)` |
| `kill -SEGV` via `run-as` (twin) | **two pids** (`15403 15488`, crash_dump's fork) at +97 ms, empty at +418 ms | `libc: Fatal signal 11` +1 ms, tombstone +342 ms | `am_crash … Native crash` +359 ms, `am_proc_died` +405 ms | `5 APP CRASH(NATIVE)`, status 11 |
| `kill -9` via `run-as` (twin) | empty at once | nothing | `am_proc_died` at once | `2 SIGNALED`, status 9 |
| `am force-stop` (twin) | empty at once | nothing | `am_kill … stop dev.jevbridge.diagnostic due to from pid …` | `10 USER REQUESTED / 21 FORCE STOP` |
| HOME (twin) | **still running** | nothing | nothing | none. `topResumedActivity` is the launcher |
| Main-thread crash (probe) | empty ~+100 ms | `FATAL EXCEPTION` | `am_crash`, `am_proc_died` | `4` |
| **Background-thread crash** (probe) | **still running for 9 s+**, until the next force-stop | `FATAL EXCEPTION: bg` | `am_crash` at once; "Showing crash dialog"; no `am_proc_died` | `4`, then `10` when force-stopped |
| `System.exit(0)` (probe) | empty at once | `System.exit called, status: 0` | `am_proc_died` | `1 EXIT_SELF` |
| ANR (probe) | **still running** | "Wrote stack traces" only | `am_anr` 5 s after the input; "Application Not Responding" window on screen | `6 ANR` (once killed) |
| `finish()` (probe) | still running (cached process) | nothing | nothing | none |

- **What the bridge would see:** after every crash, kill and force-stop, the next `dump ui` showed the launcher (35–70 nodes, no app IDs), so the step would fail. With a `pidof` check, those cases become `APP_EXITED`. The background-thread crash and the ANR would instead be reported as the step's own failure, because the process is alive.
- **After `kill -SEGV`, the next `mobilecli dump ui` took 5.1 s** (other dumps: 0.6–0.9 s). This was seen once and not investigated.
- **`pidof` costs** a median of 20–23 ms over adb (max 106 ms). It can't be synchronous.
- **`pidof` blinks during a cold start.** In a tight on-device loop (`am force-stop; am start &; pidof` every 10 ms), it found the new pid, lost it for about 2 polls, then kept it; seen once in 3 launches (`5 NONE, 1 16747, 2 NONE, 292 16747`). The host poller caught the same blink once mid-launch. After `am start -W` returns, it was stable in every run. So read the pid only after `am start -W`.
- **The events-stream watcher works.** Prototype `06-assets/exit-watch.mjs` folds `am_crash`/`am_anr`/`am_kill`/`am_proc_died` for the package and the launched pid into `{running, cause}`. Over every captured run it gave:
  - twin: normal running; `am crash` → crash; SEGV → native-crash; kill -9 → exited; force-stop → force-stopped; HOME running;
  - probe: crash, bgcrash → crash; native → native-crash; exit → exited; finish running; anr → running with cause `anr`.
- **Watcher caveats:**
  - A native crash's `am_crash` carries `system_server`'s pid (680), not the app's, so it's matched on package name plus `Native crash`.
  - `kill -9` and `System.exit` look the same in events. `exit-info` tells them apart (`SIGNALED` vs `EXIT_SELF`).
  - The bridge's own force-stops, at restart and in `close`, must be expected, as `expectStop()` does on iOS. Tracking the launched pid handles restarts.

## 4. The twin-app runs

- **Normal run:** launch (`TotalTime` 670–1,084 ms), then Add Apple, Add Bread and Complete order gave `Total: $3`.
  - The uid stream had 31 framework lines and nothing from the app, which logs nothing.
  - The events stream showed only `am_proc_start`, and `pidof` stayed on one pid.
  - Files: `captures/twin-normal/`.
- **`am crash` mid-run:** described in the table above (`captures/twin-amcrash/`). The crash stack reached the uid stream and `-b crash` at the same moment.
- **`am force-stop` mid-run:** no log line from the app at all; only `am_kill` in events and `FORCE STOP` in `exit-info` (`captures/twin-forcestop/`). A pane following logs alone can't say why the app vanished. The events stream can.
- **SEGV and kill -9:** `captures/twin-segv/`, `captures/twin-kill9/`.
- **HOME:** `captures/twin-home/`.

## Proposed decisions

❓ **Q1 - Where the pane's Android lines come from**: (a) `adb logcat --uid=<uid> -T <device time>`, one stream per run; (b) `adb logcat --pid`, re-attached after each launch; (c) `mobilecli device logs --filter …`.
➡️ **(a).** It follows restarts by itself, keeps native crash dumps (which `--pid` drops), shows only the app's own process, and arrived in 6 ms. (c) labels every freshly launched process `zygote64`, so it can't find the app. (b) loses tombstones and needs re-attach logic. Before the spec is final, run `adb shell logcat --help | grep -- --uid` on the API 31 AVD. If API 31 lacks `--uid`, use (b) on API 31–32 only.

❓ **Q2 - How the pane takes that stream**: (a) the driver writes it to an owner-only file and the pane keeps following files, adding a logcat parser; (b) the pane spawns its own `adb logcat` through a process adapter; (c) the driver exposes an in-memory feed and the pane gets a push adapter.
➡️ **(a).** The pane, `logTails`, and the `logs` fallback all keep working unchanged, one logcat process serves all three, and the file is a seam that already has two producers. Put the file in a private temp folder (for example `$TMPDIR/jev-android-logs/`, folder 0700, file 0600) and delete files older than 3 days at the next run. That matches what MobileBuildMCP does with iOS logs, so the data-handling page can say "same as iOS". In the same change, move the "app stopped" check in `stream.ts` off MobileBuildMCP's `_helperpid` file name and onto the driver's own `appRunning`.

❓ **Q3 - How Android lines look in the pane**: (a) show every line from the app's uid, with `System.out`/`System.err` as `[app]`, other tags as `[os] [Tag] …`, `E/F/A` red and `V/D` dim; (b) show only `I` and above; (c) show only `[app]` console lines.
➡️ **(a).** It mirrors iOS (console = `[app]`, structured logs = `[os]` with a category), and the crash lines (`AndroidRuntime`, `libc`, `DEBUG`) are exactly what the pane is for. Volume is small: 31 lines per launch for the twin app, and about 9 lines/s for the chatty probe. Dimming handles the framework noise.

❓ **Q4 - Masking on Android**: (a) exactly the iOS rule (script values as `[value:<key>]` in the pane, `[REDACTED]` in `run.jsonl`); (b) also mask intent extras.
➡️ **(a).** On iOS, launch arguments aren't masked, and on Android the system doesn't print extras (`(has extras)` only). Typed text didn't appear in any log buffer. The uid filter already keeps other apps' and the keyboard's lines out.

❓ **Q5 - How the Android driver knows the app is running**: (a) a second small stream, `logcat -b events` for `am_proc_died/am_crash/am_anr/am_kill`, folded into a synchronous state for the launched pid; (b) make `appRunning()` async and run `adb shell pidof` when a step fails; (c) poll `pidof` in the background.
➡️ **(a).** It keeps the synchronous `appRunning()` that `run.ts` and the pane use, reacts in 4–405 ms with no polling, and sees the two cases `pidof` misses: a crash that leaves an "app has stopped" dialog with the process alive, and an ANR. It also knows the cause. Use `pidof` once, after `am start -W`, to learn the pid. It blinks during a cold start, so never read it earlier.

❓ **Q6 - What counts as `APP_EXITED` on Android**: crash (Java or native, even when the process lingers behind the crash dialog), kill, exit, and a force-stop the bridge didn't send are all `APP_EXITED`. Backgrounding (HOME) isn't detected, as on iOS. For an ANR: (a) `APP_EXITED`; (b) a new reason code `APP_NOT_RESPONDING`; (c) no special reason, only a pane note, and the step keeps its own failure reason.
➡️ **(b) for ANR, with the rest as listed.** An ANR hasn't exited, so folding it into `APP_EXITED` would stretch a frozen meaning. ADR-0005 allows adding reason codes in 1.x, and ticket 03 is already adding Android codes. The pane note names the cause ("crashed: FATAL EXCEPTION on main", "native crash: SIGSEGV", "force-stopped by another process", "exited"). The Android troubleshooting entry points to the pane, `adb logcat -b crash -d`, and `adb shell dumpsys activity exit-info <package>`.

## Not verified

- Whether API 31/32 logcat has `--uid` (see Q1).
- A real phone. The Xiaomi was off limits: MIUI's logcat and `-b events` access are untested.
- Logcat's per-message size limit (about 4 KB) and the "chatty"/dropped-line behaviour under load weren't exercised.
- Why the background-thread crash kept its process behind a dialog while the main-thread crash didn't. Both were observed, but the cause wasn't traced.
- The 5.1 s dump after a native crash (seen once).

## Assets

`06-assets/`:
- `logprobe/` (source and `build.sh`)
- `stamp.mjs`, `poll-pidof.mjs`, `lag.mjs`
- `run-probe.sh`, `twin-run.mjs` (they write raw output to `/tmp/jev-06`, deleted after this work)
- `mcli.sh` (the guarded mobilecli wrapper)
- `logcat-line.mjs` (pane parser prototype), `exit-watch.mjs` (exit watcher prototype)
- `captures/`: app-only logs, events, `pidof` timelines, `exit-info` and step timings per run

Cleanup done: mobilecli daemon stopped, `DeviceServer` killed, `adb forward` removed, the probe uninstalled, the emulator shut down (`emu kill`, no emulator process left), the private adb server on 5098 killed, and `/tmp/jev-mcli-06`, `/tmp/jev-logprobe` and `/tmp/jev-06` deleted. The default adb server on 5037 belongs to another agent and was never touched.

EMULATOR RELEASED
