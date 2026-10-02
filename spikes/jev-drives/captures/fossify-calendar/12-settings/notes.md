# Settings (top)

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 11, tapped Back (115,147) to the month view, then Settings (858,147).

## Next steps a plan might ask here

- Turn on the 24-hour time format.
- Change the first day of the week to Monday.
- Turn off reminders for new events (scroll needed).
- Go back to the calendar.

## Traps

- **Duplicate targets**: each row has a `*_holder` button and a separate text with the same label ("Customize appearance" twice, etc.).
- Switch rows have an unlabelled holder button plus a labelled `switch`.
- **Scrolled-off targets**: New events / Default reminder settings are well below the fold.
