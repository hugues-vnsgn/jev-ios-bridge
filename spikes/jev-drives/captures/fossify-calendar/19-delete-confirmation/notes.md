# Delete confirmation

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 18, tapped Delete (784,146). I then tapped **No** (653,1284); the event still exists on the emulator.

## Next steps a plan might ask here

- Confirm deleting the event.
- Keep the event.

## Traps

- **Destructive confirmation**: "Yes" deletes. Always Claude's call (C21).
- Generic labels "Yes"/"No" with no title; the meaning is only in the message text.
