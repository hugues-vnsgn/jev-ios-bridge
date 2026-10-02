# App dialog "Permission Required" after denying

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 07, tapped "Don't allow" (540,1450).

## Next steps a plan might ask here

- Cancel and continue without notifications.
- Grant the permission.

## Traps

- **Unexpected app dialog** chained after the system prompt.
- "Grant Permission" leads to granting a permission: hand back to Claude.
- Cancel does not finish the save (see 09).
