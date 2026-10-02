# New Event form, empty

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 02, tapped "Event" (812,2221). The keyboard opened with Title focused.

## Next steps a plan might ask here

- Name the event "Dentist appointment".
- Make it an all-day event.
- Change the start time.
- Save the event.

## Traps

- **Duplicate labels**: start and end date are both "October 1 (Thu)" and both times "05:00 PM"; only the ids (`event_start_date` / `event_end_date`) tell them apart.
- **Icon-only**: Save is a checkmark (labelled "Save"), Back an arrow, `event_show_on_map` has no label.
- **Visible content missing from the text**: rows below the reminders (No repetition, Confirmed, Local calendar, Event color) are on screen in the screenshot but absent from the capture.
- This capture was taken before the emulator's system server restarted (see README problems); 04 was re-entered afterwards, so its times read 06:00 PM.
