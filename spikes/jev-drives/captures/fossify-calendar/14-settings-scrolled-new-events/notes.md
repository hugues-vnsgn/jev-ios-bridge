# Settings scrolled to Reminders / CalDAV / New events

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Relaunched; Settings (858,147); swiped up twice (540,1800 > 540,900, 600 ms each).

## Next steps a plan might ask here

- Turn off "Use the last event's reminders".
- Change the default start time.
- Turn on CalDAV sync.
- Scroll back to the top.

## Traps

- **Scrolled-off target**: "Use the last event's reminders as the default for new events" and the Default reminder rows are just below the bottom edge of this capture.
- **Risky toggle**: "CalDAV sync" would link a device account (server sync); not a routine change.
- Duplicate holder/text labels as in 12.
