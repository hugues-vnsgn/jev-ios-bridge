# Month view (first launch)

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Installed `calendar-22-foss-release.apk` (v1.11.0) and launched it. No permission prompt or intro appeared at launch; the app opened straight on the October month grid.

## Next steps a plan might ask here

- Create a new event.
- Open today's day view (1 October).
- Go to next month.
- Open Settings.

## Traps

- **Canvas-drawn grid**: each day cell is exposed as a `button` labelled "1 October" etc. (all sharing the id `month_view_background`), but whatever is drawn inside the cell (event titles, the today marker) is not in the text. See 16 for the same grid with an event.
- **Icon-only toolbar**: Change view, Settings and More options are icons; they do carry labels.
- **Icon-only FAB** "New Event" opens a speed-dial menu, not the form (see 02).
- Today (1 October) is not marked in the text; only the screenshot shows the highlight.
- Days from September and November are in the grid and indistinguishable from October except by label.
