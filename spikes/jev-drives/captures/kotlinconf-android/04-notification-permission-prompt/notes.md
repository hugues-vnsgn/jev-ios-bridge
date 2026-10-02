# System prompt "Allow KotlinConf to send you notifications?"

App: kotlinconf-android. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 03, tapped "Let’s get started!" (540,2221). Captured before answering; I chose **Don't allow** (540,1450).

## Next steps a plan might ask here

- Deny notifications.
- Allow notifications.

## Traps

- **Permission prompt**: Jev never answers it (C17).
