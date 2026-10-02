# New Event form filled, unsaved

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Relaunched the app after the emulator's system server restarted; FAB (964,2221) > Event (812,2221); typed "Dentist appointment" into Title (`adb shell input text`), tapped Location (482,489) and typed "Main Street Clinic". Nothing saved.

## Next steps a plan might ask here

- Save the event.
- Add a description.
- Discard this event and go back to the calendar.
- Turn off the reminder.

## Traps

- **Unsaved form**: fields are filled but nothing is stored; "done" must not be claimed until the grid/day view shows the event.
- Save is an icon-only checkmark at the top right; Back (top left) triggers 05 instead of leaving.
- Duplicate date/time labels and missing lower rows, as in 03.
- The reminder "10 minutes before" (default) is what later triggers the permission chain 06-10.
