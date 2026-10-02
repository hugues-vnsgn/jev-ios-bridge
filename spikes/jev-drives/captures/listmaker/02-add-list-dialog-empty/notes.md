# Add list dialog, empty

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 01, tapped the FAB (964,2221).

## Next steps a plan might ask here

- Name the list "Groceries".
- Create the list.
- Close the dialog without creating a list.

## Traps

- **No Cancel button**: the only ways out are Back or tapping outside.
- Field label "Enter name" is the placeholder.
- "Create" appears twice (button and its text).
