# Add list dialog, "Groceries" typed, unsaved

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 02, tapped the field (540,1211) and typed "Groceries". The first `adb shell input text` under host load produced "GGr"; I cleared it with KEYCODE_DEL and retyped.

## Next steps a plan might ask here

- Create the list.
- Rename it to "Weekly groceries" before creating it.
- Cancel creating the list.

## Traps

- **Unsaved form**: the name is typed but no list exists yet.
- The field keeps the label "Enter name"; the typed text is in `value`.
- Creating a list navigates straight into the new list (05), so "done when the list appears on the home screen" needs a Back step.
