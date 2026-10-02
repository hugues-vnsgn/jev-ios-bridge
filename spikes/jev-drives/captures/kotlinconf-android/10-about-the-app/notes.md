# About the app

App: kotlinconf-android. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 09, tapped "About the app" (540,935).

## Next steps a plan might ask here

- Check which backend the app uses.
- Open the licenses.
- Go back to Info.

## Traps

- **Preflight by absence**: the production backend is indicated only by a *missing* "Staging"/"Local" label (`AboutAppScreen.kt`).
- "Rate the app" and "GitHub repository" leave the app; the version "40.0.5 (73)" is a button.
