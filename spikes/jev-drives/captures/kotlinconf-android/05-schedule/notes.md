# Schedule, May 20

App: kotlinconf-android. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 04, after Don't allow.

## Next steps a plan might ask here

- Open the Koog workshop.
- Bookmark the Koog workshop.
- Show May 21.
- Show only bookmarked sessions.

## Traps

- **Duplicate rows**: two "Coffee Break" entries, told apart only by their times.
- **Risky write on a list screen**: "Vote negative/neutral/positive" icon switches and "How was the workshop?" (feedback) sit right under the session; votes are server writes. Read-only run: never tap them.
- **Icon-only** bookmark switch, labelled "Bookmark <title>".
- Selected date "May 20" is plain text; other dates are buttons. Selected tab "Schedule" is `other` with `selected: true`.
- Content is the conference schedule and will drift.
