# Groceries list with four tasks

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 07, tapped Groceries (540,691), then added Milk, Eggs, Bread and Milk powder (FAB > field (540,1222) > type > Create (780,1012) each).

## Next steps a plan might ask here

- Add Butter to the list.
- Mark Milk as done.
- Go back to all lists.

## Traps

- **Similar rows**: "Milk" vs "Milk powder".
- **Buttons that do nothing**: each task is a clickable `button`, but its onClick is empty in the source, so "mark Milk as done" has no action on this screen.
- Order is HashSet order, not insertion order; duplicate task names collapse silently.
