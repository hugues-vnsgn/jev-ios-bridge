# Add list dialog over existing lists, "Gift ideas" unsaved

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 04, FAB (964,2221), tapped the field (540,1222) and typed "Gift ideas". (An earlier attempt lost the text because the field wasn't focused yet.)

## Next steps a plan might ask here

- Create the Gift ideas list.
- Cancel and open Groceries instead.

## Traps

- **Unsaved form**; no Cancel button.
- The lists underneath are visible (dimmed) in the screenshot but absent from the text, unlike iOS sheets.
