# Interests: topic list

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 06, tapped Interests (907,2232).

## Next steps a plan might ask here

- Follow Android Studio & Tools.
- Open the Compose topic.
- Unfollow Headlines.

## Traps

- **Duplicate rows**: nine identical `switch` "Follow interest" buttons; which topic each belongs to is known only from position/frames.
- Each topic name is itself a `switch` with value 0 even when followed (Headlines: row 0, "Unfollow interest" 1).
- **Scrolled-off**: UI (followed) and later topics are below the fold.
