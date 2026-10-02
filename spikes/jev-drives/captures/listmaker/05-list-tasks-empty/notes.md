# Groceries list, no tasks (empty state)

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 03, tapped Create (780,1012); the app opened the new Groceries list.

## Next steps a plan might ask here

- Add "Milk" to the list.
- Go back to all lists.

## Traps

- **Empty state** "No todos for this task yet" (task/list wording swapped).
- **Icon-only Back** ("Back icon") and FAB "Add a new task icon", each doubled as button + other.
