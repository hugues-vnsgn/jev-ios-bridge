# Reminder "Disclaimer" dialog on first save

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 05, tapped "Save" (842,1311).

## Next steps a plan might ask here

- Acknowledge the disclaimer.
- Open notification settings.

## Traps

- **Unexpected dialog** after Save: the event is not yet saved; Save is interrupted by a disclaimer about reminders.
- "Settings" leaves to reminder settings; "OK" continues (and leads to the system permission prompt, 07).
