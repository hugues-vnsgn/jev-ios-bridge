# Day view, no events (15 October)

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

After discarding the form from 10 (Back (72,147) > Discard (641,1311)), the next tap at (641,1311) landed on the month grid and opened the day view for 15 October.

## Next steps a plan might ask here

- Go back to the month view.
- Go to today.
- Create an event on this day.
- Go to the next day.

## Traps

- **Empty state with no text**: no "No events" message; the `day_events` list is just empty.
- **Same id, different meaning**: `top_toolbar_search_icon` is now labelled "Back" (it was "Search" on the month view).
- Icon-only "Go to today" and arrows.
