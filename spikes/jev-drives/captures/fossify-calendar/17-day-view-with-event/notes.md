# Day view, 1 October, one event

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 16, tapped the 1 October cell (694,604).

## Next steps a plan might ask here

- Open the dentist appointment.
- Delete the event.
- Go to the next day.

## Traps

- The event row is a button labelled "Dentist appointment" plus a text with the same label (duplicate target).
- The time "06:00 PM" is a separate text, not part of the row label.
