# Settings dialog

App: nowinandroid. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 08, Back (64,127), then the Settings gear (1007,148).

## Next steps a plan might ask here

- Switch to dark mode.
- Turn on dynamic color.
- Open the privacy policy.
- Close settings.

## Traps

- **Unlabelled radios**: several `switch` elements without labels sit next to labelled ones.
- **Ambiguous labels**: "Yes"/"No" (only the preceding "Use Dynamic Color" text gives the meaning).
- Privacy policy, Licenses, Brand Guidelines, Feedback leave the app.
- A dialog with only OK: changes apply immediately, there is no Cancel.
