# Notifications onboarding

App: kotlinconf-android. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 02, tapped Reject.

## Next steps a plan might ask here

- Turn off schedule updates.
- Get started.

## Traps

- Both switches are on by default (value 1); "Let’s get started!" triggers the system permission prompt (04), a surprise for a step that only says "continue".
- Typographic apostrophe in "Let’s".
