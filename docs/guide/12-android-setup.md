# Set up Android

Since 1.2, the bridge also drives Android emulators and phones. A script opts in with `"platform": "android"`, and the rest of the guide applies to both platforms unless a page says otherwise. This page covers what's different: the tools, naming the device, and the app and device settings a run depends on.

## What you need

- **A Mac with Apple silicon,** and Node 24 or later. The bridge refuses to run on any other host; see [limits](10-limits.md).
- **The Android SDK's `adb`** (the platform tools). The bridge looks for it in `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then your `PATH`, then Android Studio's default, `~/Library/Android/sdk/platform-tools/adb`. If it isn't found, runs stop with `ANDROID_TOOLS_UNAVAILABLE`. If you use an adb server on another port, export `ANDROID_ADB_SERVER_PORT` and the bridge's `adb` commands use it too.
- **Android 12 (API 31) or later** on the device. An older one is refused with `DEVICE_UNSUPPORTED`.
- **On Apple silicon, an arm64 emulator image.** In Android Studio's Device Manager, create the virtual device from an `arm64-v8a` system image.
- **Nothing else to install.** The bridge ships its own frozen Appium stack, with the UiAutomator2 driver and its server APKs, pinned by SHA-256. The first run on a device installs the two UiAutomator2 server APKs if they're missing, and they stay installed. It never installs Appium's Settings helper app.

The bridge doesn't build or install apps on Android either. Install yours with `adb -s <serial> install -r app-debug.apk`; [prepare your app](02-prepare-your-app.md) has the rest.

## Name the device

- **In the script:** `device.avd` for an emulator (its AVD name, as `emulator -list-avds` prints it), or `device.serial` for a phone (as `adb devices` prints it). Prefer the AVD name for emulators: serials like `emulator-5554` change with the order emulators start in.
- **Outside the script:** `JEV_ANDROID_DEVICE`, holding a serial or an AVD name. A value that `adb devices` lists as a serial is a serial; anything else is an AVD name. The Claude Code plugin's **Android device** setting sets it for the MCP server. A script's own `device` wins over both.
- **For `capture`:** `--serial` or `--avd`, then `JEV_ANDROID_DEVICE`. See [run](06-running.md#capture-an-android-screen).

A script without a device, with nothing in `JEV_ANDROID_DEVICE`, stops with `NO_DEVICE`. Two running emulators with the same AVD name are refused with `DEVICE_AMBIGUOUS`: name one of them by serial.

One run at a time uses a device. The bridge's device lease is keyed by the device's identity: the AVD name for an emulator, the serial for a phone. A script that names `emulator-5554` and one that names that emulator's AVD wait for the same lease.

## Give Compose elements identifiers: `testTagsAsResourceId`

**Without it, a Compose app has no identifiers at all on Android.** `Modifier.testTag` stays inside Compose, and the accessibility tree that the bridge reads never sees it. Set `testTagsAsResourceId` once, on the root composable. In a Compose Multiplatform app, that's in `androidMain`, in `MainActivity.onCreate`:

```kotlin
// androidMain, MainActivity.onCreate
// import androidx.compose.ui.semantics.semantics
// import androidx.compose.ui.semantics.testTagsAsResourceId
// Older Compose versions also need @OptIn(ExperimentalComposeUiApi::class).
setContent {
    Box(Modifier.semantics { testTagsAsResourceId = true }) {
        App()
    }
}
```

Every `testTag` below that root then shows up as the element's `identifier`, exactly as written (`checkout.complete`). The bundled diagnostic app sets it this way. Until you add it, select elements by `role` plus `label`.

Classic Views need nothing extra: an `android:id` shows up as its full resource ID, such as `com.example.app:id/title`. [Make elements selectable](03-identifiers.md) has the rules for every framework.

## Custom tabs and toggles must expose their state

The bridge reads a tab's selected state and a toggle's checked state from accessibility: a checkable control is a `switch` whose `value` is `1` or `0`, and a selected element carries `selected` in its state. Material's `Tab`, `Switch`, `Checkbox` and `RadioButton` expose this by themselves.

A custom tab or toggle drawn with `Modifier.clickable` doesn't. It captures as a plain `button`, and no guard or claim can tell whether it's on. Give it the state:

- **a tab or a segment:** `Modifier.selectable(selected = isSelected, onClick = …)`;
- **a toggle or a checkbox:** `Modifier.toggleable(value = isOn, onValueChange = …)`.

Without it, a claim about which tab is selected comes back uncertain. Claim the tab's printed text instead, if it shows its state that way.

## Animations: off is optional

Turning off the three animation scales makes runs faster, because most screens are final at the first capture. It's optional. In Developer options, set Window animation scale, Transition animation scale and Animator duration scale to off, or:

```sh
adb -s <serial> shell settings put global window_animation_scale 0
adb -s <serial> shell settings put global transition_animation_scale 0
adb -s <serial> shell settings put global animator_duration_scale 0
```

**The bridge never changes device settings.** It doesn't turn animations off, grant permissions, or keep the screen awake: those are yours to decide. Either way, every capture waits for the screen to settle: two identical captures 250 ms apart. After 3 seconds no new capture starts, and a screen still moving is used as the last capture showed it, and its step is marked "screen still changing" in the report.

## Permission dialogs: grant ahead with `pm grant`

A permission dialog is a system window that covers your app, so the next guard fails. Grant the permission before the run:

```sh
adb -s <serial> shell pm grant com.example.app android.permission.POST_NOTIFICATIONS
```

This works for runtime permissions (notifications, location, camera, and the like). Or skip the request in a debug entry point, as [prepare your app](02-prepare-your-app.md#give-runs-a-stable-starting-point-debug-entry-points) describes.

## Xiaomi phones: allow input

On a Xiaomi phone, turn on **"USB debugging (Security settings)"** in Developer options, beside USB debugging. Without it, the phone ignores taps and typing sent over `adb`. Real phones are supported but haven't been tested; see [limits](10-limits.md).

## Screen lock: set it to None

The bridge wakes a screen that's only off. If the lock screen shows, even a swipe-only one, the run stops with `DEVICE_LOCKED` before the screen is woken: dismissing it would change the device. On a test device, set Screen lock to None, in Settings under Security (the path varies by Android version).

## One UI tool at a time

The bridge drives the device through its own Appium server and the UiAutomator2 server it starts on the device. Only one UI-automation agent can hold a device at a time. When another tool holds it (another Appium session, mobile-mcp, mobilecli, or `uiautomator`), the run stops with `DEVICE_BUSY` before it touches the app. **Close that tool first,** then run again.

The bridge leaves another tool's UI-automation agent (a foreign agent) running, and stops only its own. It tells them apart by the process identities it recorded when it started its own, not by name. At the end of every run it stops its UiAutomator2 server, puts back the device settings the session changed (`accessibility_enabled` and three hidden-API policy keys), and removes the `adb forward` it made. After a crash, the next run stops what the crashed run recorded before it uses the device; [troubleshooting](08-troubleshooting.md#a-leftover-from-a-crashed-run) has the details.
