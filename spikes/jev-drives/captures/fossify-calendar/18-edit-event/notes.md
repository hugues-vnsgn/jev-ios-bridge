# Edit Event

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 17, tapped the event row (540,455).

## Next steps a plan might ask here

- Delete this event.
- Duplicate this event.
- Change the title.
- Go back without changes.

## Traps

- **Destructive icon-only button** "Delete" (trash) next to "Duplicate event" and "Save" in the toolbar.
- This capture lists 40 elements, more rows than the New Event form (03/04), although the screen layout looks the same.
