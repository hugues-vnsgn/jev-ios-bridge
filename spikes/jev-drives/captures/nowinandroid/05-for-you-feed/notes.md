# For you feed

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 04, tapped Done (540,1224).

## Next steps a plan might ask here

- Bookmark the Pixel Watch article.
- Follow the Wear OS topic.
- Open the Saved tab.

## Traps

- **Icon-only toggle**: "Bookmark" is an icon `switch`.
- **Leaves the app**: tapping the article card opens it in a browser (Custom Tab).
- Topic chips read "Wear OS is not followed": the state is folded into the label.
- **Partly off-screen**: the second card (`newsResourceCard:7`) has no label in this capture.
