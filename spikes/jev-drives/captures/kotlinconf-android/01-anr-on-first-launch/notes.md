# System ANR dialog "KotlinConf isn't responding" on first launch

App: kotlinconf-android. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

Installed `androidApp-debug.apk` and launched it. The first capture after 12 s timed out; after 20 s more, the app's main thread was blocked ("Input dispatching timed out ... Waited 5000ms for FocusEvent") with the privacy notice underneath. Screenshot retaken after the capture.

## Next steps a plan might ask here

- Wait for the app.
- Close the app.

## Traps

- **Unexpected system dialog**; the privacy notice under it is not in the text.
- It kept coming back after "Wait" (the app sat at 0% CPU). Force-stop and relaunch cleared it; the second launch was fine.
