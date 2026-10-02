# System prompt: "Allow Calendar to send you notifications?"

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 06, tapped "OK" (842,1479). This is the first-run permission prompt; it appears only when an event with a reminder is saved, not at launch.

## Next steps a plan might ask here

- Deny notifications.
- Allow notifications.

## Traps

- **Permission prompt** (system window, `com.android.permissioncontroller`): Jev must never answer it (C17). Captured before answering; I chose **Don't allow**.
- The app content is absent from the text; only the dialog is listed.
- Apostrophe in "Don’t allow" is a typographic U+2019.
