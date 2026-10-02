# Splash while starting, and the prompt arriving

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Installed `app-demo-debug.apk` (fresh) and launched it via the launcher intent; captured after 8 s.

## Next steps a plan might ask here

- Wait for the app to load.
- Open the For you screen.

## Traps

- **Screen Jev can't read**: `capture.jsonl` is empty (0 elements) while the splash logo shows.
- **Screen changed between the two captures**: `capture-jev.txt`, taken seconds later, already shows the notification permission dialog (02). The screenshot shows the splash. Treat the pair as a race example, not one screen.
