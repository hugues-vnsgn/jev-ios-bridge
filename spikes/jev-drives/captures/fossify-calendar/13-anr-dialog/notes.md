# System ANR dialog "Calendar isn't responding"

App: fossify-calendar. Android emulator `Medium_Phone_API_36.1` (Android 16, API 36), 1080x2400. Files: `capture.jsonl` (`jev-ios-bridge capture --avd Medium_Phone_API_36.1`), `capture-jev.txt` (same with `--jev`), `screenshot.png` (`adb exec-out screencap -p`, taken just before the capture). Tap coordinates are device pixels, taken from the frames in `capture-jev.txt`.

## How it was reached

From 12, swiped up (540,1800 > 540,700). The host was heavily loaded (load average 30-110, another agent's Gradle build) and the app missed a 5 s input deadline. Screenshot retaken after the capture so it matches the text; the settings list under the dialog is not in the text.

## Next steps a plan might ask here

- Wait for the app.
- Close the app.

## Traps

- **Unexpected system dialog** not caused by the plan; Jev must not dismiss it (C17). "Close app" kills the app and loses state.
- It reappeared after "Wait"; I chose Close app, force-stopped and relaunched.
