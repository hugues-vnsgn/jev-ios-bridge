# Log pane and app-exit detection on Android

Type: task
Status: resolved
Claimed by: subagent (owner session, 2026-09-28)
Blocked by: 01

## Question

How does the live log pane follow an Android app's output, and how does the bridge notice that the app exited or crashed?

- Choose the source: `mobilecli device logs --filter …` or `adb logcat --pid`. The PID changes on every restart.
- Decide how the pane's file-following design (`src/logpane/stream.ts`) takes a streaming process source, and what it masks.
- `appRunning()` on Android (`pidof`), and how a crash shows up as `APP_EXITED`.
- Try it on the emulator with the Android twin app: a normal run, and a forced crash or `am force-stop` mid-run.

## Answer

Resolved 2026-09-29 with the owner; every recommendation accepted. Measured by a subagent on `Medium_Phone_API_36.1` (Android 16) with the twin app and a throwaway log-probe app. Evidence: [`findings/06-log-pane.md`](../findings/06-log-pane.md) and [`findings/06-assets/`](../findings/06-assets/).

1. **Source:** one `adb logcat --uid=<app uid> -T <device time>` stream per run.
   - It follows restarts by itself, because the uid survives them. Lines arrive in about 6 ms.
   - It shows `Log.*`, `System.out` and `System.err`, Java crash stacks, and native crash dumps.
   - The uid comes from an exact match in `pm list packages -U`.
   - `-T` is needed, because a count tail returns nothing with `--uid`.
   - `--uid` exists on Android 12: checked on 2026-09-29 on `jev-actions-api31` (API 31), whose logcat lists it and accepts it.
   - Not used: `--pid`, which goes silent on restart and drops native dumps, and mobilecli `device logs`, which labels a freshly launched app `zygote64`.
2. **Into the pane:** the driver writes the stream to an owner-only file in a private temp folder, and deletes files older than 3 days. The pane keeps following files and gains a logcat line parser, so the pane, the per-step log tails and the `logs` command all work from one stream. In the same change, the pane's "app stopped" check moves onto the driver's `appRunning`, instead of reading MobileBuildMCP's log file names.
3. **Lines shown:** every line from the app's uid.
   - `System.out` and `System.err` show as `[app]`.
   - Other tags show as `[os] [Tag]`.
   - Errors are red and debug lines are dim, mirroring iOS.
   - About 31 lines per twin-app launch.
4. **Masking:** the iOS rule, unchanged. The system never prints intent extras, and the uid filter keeps other apps' and the keyboard's lines out. The iOS limit carries over: an upper-case copy of a value isn't masked.
5. **Is the app running:** a second small stream of process events (`logcat -b events`: `am_crash`, `am_anr`, `am_kill`, `am_proc_died`) keeps a running/crashed state, so `appRunning()` stays synchronous. `pidof` runs once, after `am start -W`, to learn the pid. The events caught every case within 4–405 ms, including a background-thread crash that left the process alive behind the "app has stopped" dialog. A prototype sorted all 12 captured runs correctly.
6. **Reason codes:**
   - Java and native crashes (even with the dialog still up), kills, exits, and force-stops the bridge didn't send are `APP_EXITED`.
   - A frozen app gets a new reason code, `APP_NOT_RESPONDING`: it hasn't exited, and 1.x may add codes.
   - Going to HOME isn't detected (as on iOS).
   - The pane note names the cause. The Android troubleshooting entry points to `adb logcat -b crash -d` and `dumpsys activity exit-info <package>`.

**Seen once and not chased:** after `kill -SEGV`, the next capture took 5.1 s instead of 0.6–0.9 s.
