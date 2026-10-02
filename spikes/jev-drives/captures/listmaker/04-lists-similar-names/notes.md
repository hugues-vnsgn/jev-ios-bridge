# Home with three lists, similar names

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Created Groceries (Create (780,1012) > Back icon (72,147)), then Weekend chores and Groceries for party the same way. A second "Groceries" can't exist: lists are keyed by name in SharedPreferences, so a duplicate silently overwrites.

## Next steps a plan might ask here

- Open the Groceries list.
- Open the Weekend chores list.
- Create another list.

## Traps

- **Similar rows**: "Groceries" vs "Groceries for party"; a substring match picks the wrong one.
- **Unstable order**: lists come from a HashMap, so the order changes between visits (compare 07).
- Each row is a button plus a text with the same label.
