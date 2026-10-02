# Search with "compose"

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 09, OK (814,2051), Search (72,147), typed "compose".

## Next steps a plan might ask here

- Follow the Compose topic.
- Clear the search.
- Open the AndroidX releases article.

## Traps

- Topic results are duplicated "Follow interest"/"Unfollow interest" switches again.
- "UI" is a result with the subtitle "not including Compose"; matching on text alone could misread it.
- Ids present here (`searchTextField`, `search:newsResources`).
