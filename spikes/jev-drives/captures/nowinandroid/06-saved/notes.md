# Saved tab with one bookmark

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 05, tapped Bookmark (913,884), then the Saved tab (540,2232).

## Next steps a plan might ask here

- Remove the bookmark.
- Open the For you tab.
- Open the Wear OS topic.

## Traps

- The bookmark toggle is now labelled "Unbookmark" (label flips with state).
- "Saved" appears twice as plain text (title and selected tab); the selected tab loses its button role.
