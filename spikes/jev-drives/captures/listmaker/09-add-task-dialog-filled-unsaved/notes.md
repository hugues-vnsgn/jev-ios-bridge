# Add task dialog, "Butter" typed, unsaved

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 08, FAB (964,2221), field (540,1222), typed "Butter" (first attempt again lost the text; retyped). Afterwards I pressed Back twice; Butter was not added.

## Next steps a plan might ask here

- Add the task.
- Cancel adding the task.

## Traps

- **Unsaved form**, no Cancel; dialog title is the only hint that this is a task, not a list (same "Enter name" field).
