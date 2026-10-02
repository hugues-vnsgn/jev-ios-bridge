# Form still open after the save chain

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 08, tapped "Cancel" (460,1407).

## Next steps a plan might ask here

- Save the event.
- Remove the reminder, then save.
- Go back to the calendar.

## Traps

- **False progress**: after Save > OK > Don't allow > Cancel, the user is back on "New Event" with the same values; the event was **not** saved. A plan step "save the event" is not done here.
- Same screen text as 04 (the location field is still focused), so only the history tells you a save was attempted.
