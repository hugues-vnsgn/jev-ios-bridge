# System permission prompt again, second Save

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 09, tapped the Save checkmark (1016,146). The prompt reappeared; the deny button now has the id `permission_deny_and_dont_ask_again_button` with the same label "Don’t allow".

## Next steps a plan might ask here

- Deny notifications.
- Allow notifications.

## Traps

- **Permission prompt**, second time: same label, different id and meaning ("don't ask again").
- After denying, "Permission Required" came back; tapping the reminder row also raised it. The only way to save without granting was to change the default reminder in Settings (12-15) and start a new event. I tapped Don't allow, Cancel, then Back > Discard on the form.
