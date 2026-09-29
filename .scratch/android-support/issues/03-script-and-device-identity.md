# How a script names an Android app and device

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

The shape is settled: an optional top-level `"platform": "android"`, with `app.package`, `device.serial` and optional `app.intentExtras`. What are the exact rules?

- **Validation:** the package-name pattern (Android allows `_`); which fields are required or forbidden per platform; whether `launchArgs` is rejected on Android; the types and limits for `intentExtras`.
- **Device identity:** what a "serial" is for an emulator (`emulator-5554`) versus a phone (`2985e9c`), versus mobilecli's AVD names; whether aliases are refused, as `booted` is on iOS; the dedicated-device rule.
- **Configuration:** the environment variable for a default Android device (beside `JEV_DEVICE_UDID`), and the plugin's user config, which today *requires* a simulator UDID even from someone who only has Android.
- **Launch:** how the app is restarted (force-stop, then launch), which activity starts, and how intent extras are passed.
- **Preconditions the bridge checks** before a run: device authorized, booted, screen awake and unlocked.

## Comments

- 2026-09-29, from the domain-model session ([`domain-model.md`](../domain-model.md), [ADR-0006](../../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md), decision G): "mobilecli ID" is gone. The device lease is keyed by the **device identity**: the AVD name for an emulator, the serial for a phone. Another tool's UI-automation agent on the device is refused with `DEVICE_BUSY`.

## Answer

Resolved 2026-09-28 with the owner; every recommendation accepted.

- **Fields per platform.** No `platform`, or `"platform": "ios"`: the script is unchanged, and Android fields are rejected. `"platform": "android"`: `app.package` is required; `app.bundleId`, `app.launchArgs` and `device.udid` are rejected. The `launchArgs` message points to `app.intentExtras`.
- **Package names** follow Android's rule: two or more dot-separated parts, each starting with a letter, then letters, digits or `_` (`com.hugues.test_cmp` is valid).
- **`app.activity`** (optional) starts a specific activity, such as a debug entry point, instead of the launcher activity. It is relative (`.DebugGalleryActivity`) or fully qualified.
- **`app.intentExtras`** (optional) is a map of string keys to string values, passed with `am start --es`: at most 20 entries, printable ASCII values of at most 200 characters (the `launchArgs` limits). Typed extras can be added later without breaking a script.
- **Device.** A script names at most one of `device.serial` (the adb serial exactly as `adb devices` prints it) and `device.avd` (an emulator's AVD name, stable across start order). For an AVD name, the bridge finds the running emulator and refuses when none, or more than one, runs that AVD. There's no "any device" shortcut.
- **Default device:** the script's device, then `JEV_ANDROID_DEVICE` (a serial or an AVD name), then `NO_DEVICE`. There's no config file. The plugin's "Simulator UDID" becomes optional, and an optional "Android device" setting is added. A run fails only when its own platform's device is missing.
- **Restart:** `am force-stop <package>`, then `adb shell am start -W` of `app.activity` or the launcher activity, with the extras. mobilecli's `apps launch` is not used, because it neither waits nor passes extras. App data is never cleared.
- **Checks before a run.** Refuse when the device isn't connected, is unauthorized, hasn't finished booting, doesn't have the app installed, or has its screen locked. Wake a screen that is only off. Never change device settings (animations, permissions, stay-awake); the guide covers them. New reason codes, named in the spec: for example `DEVICE_UNAUTHORIZED`, `DEVICE_LOCKED`, `APP_NOT_INSTALLED`.
