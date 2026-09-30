# Prepare your app

## The bridge runs an app you've already installed

The bridge doesn't build, install, seed, or reset apps. Before a run:

- **Build and install** the app on the bridge's simulator, for example with `npx mobilebuildmcp simulator build-and-run`. On Android, build it (`./gradlew :app:assembleDebug`, or your app module's name) and install it on the one device with `adb -s <serial> install -r <apk>`. First [set up Android](12-android-setup.md).
- **Arrange its data.** Sign in a test account, seed records, clear state: whatever your script expects. You can describe this in the script's `preconditions` so readers know, but the bridge doesn't execute them.

At the start of each run the bridge **restarts the app**. The app's stored data stays, and whatever screen it opens on after launch is where your script begins. Write the first step's guard to match that screen.

## Use test data in an app you control

- **Checkpoint screen text goes to TypeSafe,** including anything your script typed. Use synthetic accounts and data, not real users'. See [data handling](09-data-handling.md).
- **Text someone else wrote can steer Jev.** A message or profile name on screen could read like an instruction. Test on data you wrote.

## Give runs a stable starting point: debug entry points

Runs repeat best when the app starts in the same place with the same data every time. Login screens, network calls, splash animations, and permission prompts all get in the way. A debug-only launch argument solves most of this:

```json
"app": { "bundleId": "com.example.app", "launchArgs": ["-evidence-screen"] }
```

The bridge passes `launchArgs` to the app process when it launches it. In a Debug build, the app can read the argument and go straight to a known screen, with no login and no network:

- **SwiftUI or UIKit:** check `ProcessInfo.processInfo.arguments.contains("-evidence-screen")` in your `App` or scene setup.
- **Compose Multiplatform:** read `NSProcessInfo.processInfo.arguments` in `iosMain` and choose the root composable in `MainViewController`.

On Android, the same job is done by `app.activity` and `app.intentExtras`:

```json
"app": { "package": "com.example.app", "activity": ".DebugGalleryActivity", "intentExtras": { "screen": "gallery" } }
```

The bridge starts that activity (the launcher activity when `activity` is left out) with each extra as a string, like `am start --es screen gallery`. In a debug build, read it in `androidMain`'s `MainActivity.onCreate` with `intent.getStringExtra("screen")`, and choose the root composable from it. A debug-only activity in `src/debug/AndroidManifest.xml` keeps the shortcut out of release builds.

Keep the shortcut out of Release builds. One real example is a freight app that added `-of-evidence-gallery`. In Debug builds only, it opens the design-system gallery and skips the splash-screen server check, login, the notification request, and push registration. The app then makes no network calls at all, so its checks repeat exactly and never touch the production server.

## Popups, splash screens, and animations

- **Permission prompts** (notifications, location) are system alerts that cover your app. Skip the request in your debug path, or grant the permission ahead of time. On Android, grant it with [`pm grant`](12-android-setup.md#permission-dialogs-grant-ahead-with-pm-grant).
- **Splash screens and launch animations:** start the script with a `wait` step until an element of the first real screen is present (up to 60 s).
- **Animated transitions** finish on their own. Each step captures the screen fresh before its guard is checked. On Android, each capture also waits for the screen to settle, and turning animations off [makes runs faster](12-android-setup.md#animations-off-is-optional).

## A simulator of its own

One bridge run at a time uses a simulator, and the bridge enforces this with a lock file. Don't point Xcode, other agents, or other test runs at the same simulator while a run is going. Pick it with `JEV_DEVICE_UDID`, `device.udid` in the script, or `sessionDefaults.simulatorId` in `.mobilebuildmcp/config.yaml`. The script's value wins, then the environment variable, then the config file.

An Android device is the same: one run at a time, and no other UI tool on it while a run is going. Pick it with `device.avd` or `device.serial` in the script, or `JEV_ANDROID_DEVICE`. See [Android setup](12-android-setup.md#name-the-device).
