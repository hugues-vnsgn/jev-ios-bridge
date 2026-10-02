# List Maker home, no lists (empty state)

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Installed the debug APK built from the copy and launched `com.kodeco.android/.MainActivity` on a fresh install.

## Next steps a plan might ask here

- Create a new list called Groceries.
- Check that there are no lists yet.

## Traps

- **Empty state** whose wording is wrong for the screen: it says "No tasks yet" although this screen holds lists.
- **Icon-only FAB** labelled "Add a new task icon" even though here it adds a list (label reuse).
- Labels only: no ids anywhere (no `testTagsAsResourceId`).
- The FAB appears twice: a `button` and an `other` with the same label.
