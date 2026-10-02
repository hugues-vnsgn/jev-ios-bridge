# System prompt "Allow Now in Android to send you notifications?"

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Appeared on its own a few seconds after launch (01). Captured before answering; I chose **Don't allow** (540,1450).

## Next steps a plan might ask here

- Deny notifications.
- Allow notifications.

## Traps

- **Permission prompt** on first launch: Jev never answers it (C17).
- App content absent from the text.
