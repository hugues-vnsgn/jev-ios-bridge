# "Default reminder 1" picker

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 14, swiped once more, turned off "Use the last event's reminders" (970,1988), then tapped "Default reminder 1" (300,2165).

## Next steps a plan might ask here

- Choose "No reminder".
- Choose "30 minutes before".
- Close without changing.

## Traps

- Radio buttons are exposed as `switch` with `value` 0/1 (selected one is "10 minutes before").
- No title or Cancel in the text; the dialog's purpose is only implied.
- I chose "No reminder" (540,794), so new events need no notification permission.
