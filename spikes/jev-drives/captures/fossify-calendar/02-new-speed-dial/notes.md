# New Event speed-dial menu

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 01, tapped the FAB "New Event" (964,2221).

## Next steps a plan might ask here

- Create a new event.
- Create a new task.
- Close the menu without creating anything.

## Traps

- **Icon-only control**: `fab_task_icon` has no label; only `fab_task_label` ("Task") names it.
- **Occluded content**: the whole month grid underneath stays in the text, `visible: true`, behind a full-screen unlabelled overlay button (`fab_extended_overlay`).
- "New Event" FAB is still listed with its old label but now toggles the menu; the real event entry is "Event" (`fab_event_label`).
