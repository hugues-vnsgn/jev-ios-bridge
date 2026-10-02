# Home with four lists, reordered

App: listmaker. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 06, Create (780,1012), then Back icon (72,147).

## Next steps a plan might ask here

- Open Groceries.
- Open Gift ideas.
- Add a list called Gym.

## Traps

- **Order changed** from 04 (Gift ideas first, Groceries third): position-based selection is unreliable.
- Similar names "Groceries" / "Groceries for party".
