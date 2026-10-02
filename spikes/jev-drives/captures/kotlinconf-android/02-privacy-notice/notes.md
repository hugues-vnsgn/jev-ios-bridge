# Privacy notice (consent gate)

App: kotlinconf-android. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

After force-stop and relaunch (`am start -n com.jetbrains.kotlinconf/org.jetbrains.kotlinconf.android.MainActivity`).

## Next steps a plan might ask here

- Reject the privacy notice and continue.
- Read the app privacy notice.
- Accept the privacy notice.

## Traps

- **Unexpected dialog / consent gate** before any browsing.
- **Server-side effect**: Accept enables votes and feedback sent to the server under an anonymous id. I chose **Reject** (179,2221) to stay read-only.
- "Read the app privacy notice" leaves to a document.
