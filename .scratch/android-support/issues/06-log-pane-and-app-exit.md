# Log pane and app-exit detection on Android

Type: task
Status: claimed
Claimed by: subagent (owner session, 2026-09-28)
Blocked by: 01

## Question

How does the live log pane follow an Android app's output, and how does the bridge notice that the app exited or crashed?

- Choose the source: `mobilecli device logs --filter …` or `adb logcat --pid`. The PID changes on every restart.
- Decide how the pane's file-following design (`src/logpane/stream.ts`) takes a streaming process source, and what it masks.
- `appRunning()` on Android (`pidof`), and how a crash shows up as `APP_EXITED`.
- Try it on the emulator with the Android twin app: a normal run, and a forced crash or `am force-stop` mid-run.
