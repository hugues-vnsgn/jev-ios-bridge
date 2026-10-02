# For you: topic picker (onboarding)

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

After denying 02. The first capture attempts failed (device agent didn't answer within 5 s) while a loading spinner animated and the app used ~40% CPU; I set the three animation scales to 0 on the emulator (restored at the end) and it captured.

## Next steps a plan might ask here

- Follow the Headlines topic.
- Follow UI and Compose, then finish.
- Open Settings.
- Search for "compose".

## Traps

- **Duplicate controls**: each topic is a `switch` twice (the chip and its + icon), both labelled "Headlines", etc.
- **Scrolled-off / unlabelled**: a second column of topics is cut off at the right edge; its three switches have no label at all.
- **Disabled button**: "Done" is `enabled: false` until a topic is followed (its text twin says enabled: true).
- Few ids despite `testTagsAsResourceId`: only `forYou:topicSelection` here.
- Selected tab "For you" is a plain text, not a button, and carries no `selected` state.
