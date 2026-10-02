# "You have unsaved changes. Save before exit?"

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 04, tapped the toolbar Back arrow (72,147).

## Next steps a plan might ask here

- Save the event before leaving.
- Discard the changes.
- Go back to the calendar without saving.

## Traps

- **Unexpected dialog** guarding an **unsaved form**.
- **Destructive choice**: "Discard" throws away the form; "Save" is a write. No Cancel/stay option.
- The step "go back to the calendar" is ambiguous here: both buttons leave the form.
