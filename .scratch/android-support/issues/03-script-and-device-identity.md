# How a script names an Android app and device

Type: grilling
Status: open
Blocked by: none

## Question

The shape is settled: an optional top-level `"platform": "android"`, with `app.package`, `device.serial` and optional `app.intentExtras`. What are the exact rules?

- **Validation:** the package-name pattern (Android allows `_`); which fields are required or forbidden per platform; whether `launchArgs` is rejected on Android; the types and limits for `intentExtras`.
- **Device identity:** what a "serial" is for an emulator (`emulator-5554`) versus a phone (`2985e9c`), versus mobilecli's AVD names; whether aliases are refused, as `booted` is on iOS; the dedicated-device rule.
- **Configuration:** the environment variable for a default Android device (beside `JEV_DEVICE_UDID`), and the plugin's user config, which today *requires* a simulator UDID even from someone who only has Android.
- **Launch:** how the app is restarted (force-stop, then launch), which activity starts, and how intent extras are passed.
- **Preconditions the bridge checks** before a run: device authorized, booted, screen awake and unlocked.
