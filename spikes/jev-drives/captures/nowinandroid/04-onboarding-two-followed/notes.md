# Topic picker with two topics followed

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 03, tapped the + for Headlines (798,646) and for UI (798,824).

## Next steps a plan might ask here

- Finish onboarding.
- Unfollow UI.
- Bookmark the first article.

## Traps

- "Done" is now enabled; the feed has started loading below (a "Bookmark" switch is already listed), so the screen is partly the next screen.
- Followed state is only `value: "1"` on the duplicated switches.
