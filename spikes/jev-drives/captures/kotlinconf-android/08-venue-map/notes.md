# Map, ground floor

App: kotlinconf-android. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 07, tapped the Map tab (755,2274).

## Next steps a plan might ask here

- Show the first floor.
- Zoom in.
- Find Room 2 on the map.
- Open directions to the venue.

## Traps

- **Canvas-drawn content**: room names (Room 2, Lounge, Expo, Auditorium...) are only in the screenshot; the text has none of them. "Find Room 2" is a hand-to-Claude case.
- "How to find the venue" leaves the app (↗).
- Bottom tabs are icon-only in the screenshot but labelled in the text.
