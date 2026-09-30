# Real phone checklist: Xiaomi (release check 8)

v1.2.0 was checked on emulators only. Real Android phones are untested, and the release notes and limits page say so. **This checklist hasn't been run.** Run it when a Xiaomi phone is free for these checks. It's written for the one another agent uses today, `2985e9c`, and must not be run while that agent holds it. File problems found here against 1.2.1.

## Before you start

- **The device's owner agrees** to its use for these checks, and no other agent or tool is using it: no mobile-mcp, mobilecli, Appium or `uiautomator` session.
- **A private adb server** that sees only this phone: `adb -P 5099 start-server`, with `ANDROID_ADB_SERVER_PORT=5099` exported for every command. `adb -P 5099 devices` lists exactly this phone's serial, authorized.
- **Developer options on the phone:**
  - USB debugging;
  - **USB debugging (Security settings)**. Without it, MIUI and HyperOS refuse input events, so taps and typing do nothing.
- **Screen lock** set to None, or unlocked before each run. A locked screen is `DEVICE_LOCKED`.
- **The twin app** built with `./gradlew :app:assembleDebug` and installed with `adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk`.
- **The Jev key** loaded by path: `node --env-file=<checkout>/.env …`.

## Runs

Run each with `JEV_ANDROID_DEVICE=<serial>`, one at a time.

1. **twin-fail** (`examples/diagnostic-app-android/scenario.json`). Expected: **failed**, with `Total: $5` confidently false against the app's $3.
2. **settings-search with Vietnamese.** Copy `spikes/benchmarks/scenarios/android-settings-search-vi.json`, then fix its selectors from `npx jev-ios-bridge capture --serial <serial>`: MIUI's Settings labels differ from the emulator's. Expected: **passed**, with the `leaveSearch` guard showing exactly `Tiếng Việt`.
   - Also record whether the keyboard kept `Tiếng Việt` as a clipboard suggestion (the known limit).
3. **The input setting.** Turn "USB debugging (Security settings)" off and run twin-fail again. Record what happens (expected: the first tap doesn't land, and a guard fails), then turn it back on.

## After every run: the cleanup check

- `adb -s <serial> shell pgrep -f com.mobilenext.mobilecli.DeviceServer` prints nothing.
- `adb -s <serial> forward --list` has no `localabstract:mobilecli-server` line.
- There's no lease file for the serial in `$TMPDIR/jev-ios-bridge-device-locks/`.
- There's no `adb … logcat` process of the run on the Mac (`pgrep -fl 'adb.*logcat'`).
- There's no new mobilecli process on the Mac.

## Record

For each run, record the verdict, reason, durations and the cleanup check, plus MIUI/HyperOS version and the Android version (`getprop ro.build.version.release`, `ro.miui.ui.version.name`). Note anything the emulator runs didn't show, especially logcat `--uid` output and `-b events` access, which MIUI may restrict.
