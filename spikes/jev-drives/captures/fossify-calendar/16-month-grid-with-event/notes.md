# Month grid with a saved event

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 15, Back key, FAB > Event, typed "Dentist appointment", Save checkmark (1016,146). It saved straight away with no dialog.

## Next steps a plan might ask here

- Open the dentist appointment.
- Check that the event is on 1 October.
- Open the day view for 1 October.

## Traps

- **Canvas-drawn content**: the screenshot shows "Dentist" on 1 October, but the text has no event at all; the 1 October cell is still just `"label":"1 October"`. "Done when the event shows in the calendar" cannot be checked from this text; open the day view (17) or hand the screenshot to Claude.
- Identical to 01 in text.
