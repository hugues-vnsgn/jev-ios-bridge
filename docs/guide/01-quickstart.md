# Quickstart

Your first run, in about 15 minutes. You'll run the bundled diagnostic app, a two-screen SwiftUI shop with a planted bug: its order total is wrong. The run should come back **failed**, and the report should point at the wrong total. The app has an Android twin in Jetpack Compose, with the same screens and the same bug: [Android](#android-the-same-check-on-an-emulator) runs that one.

## What you need

- A Mac with Xcode and an iOS simulator runtime.
- Node 24 or later.
- A TypeSafe API key (for Jev).
- Claude Code, if you want Claude to run the checks for you (step 6).

For Android, you need other tools; the [Android section](#android-the-same-check-on-an-emulator) lists them.

## 1. Install the bridge into your project

jev-ios-bridge ships as a GitHub release, not on npm. Download the tarball and install it:

```sh
cd /path/to/your-project
gh release download v1.2.0 -R hugues-vnsgn/jev-ios-bridge -p 'jev-ios-bridge-1.2.0.tgz'
npm install ./jev-ios-bridge-1.2.0.tgz
npx jev-ios-bridge --version     # 1.2.0
```

This also installs the device layers the bridge uses: `mobilebuildmcp@2.7.1` for iOS, and `mobilecli@1.0.14`, whose device agent the bridge uses on Android.

## 2. Keep your TypeSafe key private

```sh
umask 077
echo 'TYPESAFE_API_KEY=your-key-here' > .env
echo '.env' >> .gitignore
```

Load it by path when you run the bridge (`node --env-file=.env …`). Don't commit it or paste it into scripts.

## 3. Set a simulator aside for the bridge

Use a simulator that nothing else drives while a run is going:

```sh
xcrun simctl create jev-bridge "iPhone 17 Pro"     # prints its UUID
xcrun simctl boot <UUID>
```

Tell the bridge about it, in `.mobilebuildmcp/config.yaml`:

```yaml
schemaVersion: 1
sentryDisabled: true
sessionDefaults:
  simulatorId: <UUID>
```

You can also set `JEV_DEVICE_UDID=<UUID>`, or put `device.udid` in a script. The bridge refuses aliases like `booted`.

## 4. Build and install the diagnostic app

The diagnostic app's source isn't in the package. Get it from the release tag, then build and install it with MobileBuildMCP:

```sh
git clone --depth 1 --branch v1.2.0 https://github.com/hugues-vnsgn/jev-ios-bridge.git jev-ios-bridge-src
npx mobilebuildmcp simulator build-and-run \
  --project-path jev-ios-bridge-src/examples/diagnostic-app/DiagnosticApp.xcodeproj \
  --scheme DiagnosticApp --simulator-id <UUID>
```

The bridge never builds or installs apps. You do that, and the bridge restarts the installed app at the start of each run.

## 5. Run the script

```sh
node --env-file=.env node_modules/jev-ios-bridge/dist/cli.js run \
  jev-ios-bridge-src/examples/diagnostic-app/scenario.json
echo "exit code: $?"
```

What happens:

- A terminal window opens: the **log pane**, showing the app's own output. It stays open because this run fails; close it when you're done.
- The bridge taps Apple, then Bread, then Complete order, and checks the confirmation screen.
- The report prints: `failed`, reason `ASSERTION_FALSE`. The claim that the total is $5 scores near 0, and the observed screen text shows `Total: $3`.
- The exit code is `1`, for failed.

Evidence is in `.jev-runs/<run-id>/`: `report.json`, `run.jsonl`, and a screenshot per step. [Reports and evidence](07-reports-and-evidence.md) explains them.

## 6. Let Claude Code run it

Install the Claude Code plugin. It brings the MCP server and the `/test-ios` skill, so there's nothing to copy or register by hand:

```sh
claude plugin marketplace add hugues-vnsgn/jev-ios-bridge
claude plugin install jev-ios-bridge@jev-ios-bridge
```

Claude Code asks for your TypeSafe key, which it keeps in your system's secure storage, and the simulator's UUID from step 3. It also asks for an Android device, which you can leave empty for now. To change them later, open `/plugin` and manage the plugin.

Start Claude Code in your project, then ask:

```text
/jev-ios-bridge:test-ios run jev-ios-bridge-src/examples/diagnostic-app/scenario.json and tell me what the report says
```

Claude submits the script once, waits for the result, and reports the **failed** verdict with the $3 total as the evidence. The evidence lands in your project's `.jev-runs/`, as in step 5.

Not using the plugin, or using Codex? [Running](06-running.md#without-the-plugin) shows how to register the server and copy the skill by hand.

## Android: the same check on an emulator

The Android twin of the diagnostic app runs through `/test-android`, and should also come back **failed** on its $3 total.

**What you need:**

- A Mac. Android runs have been tried only on Apple silicon.
- Android Studio, for the SDK's `adb`, the emulator, and the JDK it bundles. The build needs JDK 17 or later.
- An emulator with Android 12 (API 31) or later. On Apple silicon, create it from an `arm64-v8a` system image in Android Studio's Device Manager.
- Node 24 or later, a TypeSafe key, and Claude Code.

[Android setup](12-android-setup.md) explains each of these.

**1. Install the bridge and keep your key private,** as in steps 1 and 2. Skip this if you've done it already.

**2. Start the emulator,** from Device Manager or with `emulator -avd <AVD name>`. Then check that `adb` sees it:

```sh
adb devices     # emulator-5554   device
```

If the emulator has a screen lock, set it to None in its Settings: the bridge refuses a locked screen.

**3. Build and install the Android diagnostic app.** Get the source as in step 4, then build it with Gradle and install it with `adb`:

```sh
cd jev-ios-bridge-src/examples/diagnostic-app-android
./gradlew :app:assembleDebug
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
cd -
```

Its package is `dev.jevbridge.diagnostic`. As on iOS, the bridge never builds or installs the app, and restarts it at the start of each run.

**4. Tell the plugin which device to use.** Install the plugin as in step 6, if you haven't. Then open `/plugin`, manage `jev-ios-bridge`, and set **Android device** to the emulator's AVD name. The simulator setting can stay empty.

**5. Run it through `/test-android`.** Start Claude Code in your project, then ask:

```text
/jev-ios-bridge:test-android run jev-ios-bridge-src/examples/diagnostic-app-android/scenario.json and tell me what the report says
```

What happens:

- The log pane opens, showing the app's own `logcat` output.
- The bridge taps Add Apple, then Add Bread, then Complete order, and checks the claim that the confirmation shows `Total: $5`.
- Claude reports the verdict: **failed**, reason `ASSERTION_FALSE`. The claim scores near 0, and the screen text shows `Total: $3`. The evidence lands in `.jev-runs/`, as on iOS.

Without Claude Code, run the same script from the terminal. It exits `1`, for failed:

```sh
JEV_ANDROID_DEVICE=<AVD name> node --env-file=.env node_modules/jev-ios-bridge/dist/cli.js run \
  jev-ios-bridge-src/examples/diagnostic-app-android/scenario.json
```

To see a screen the way the bridge reads it, run `npx jev-ios-bridge capture --avd <AVD name>` while the screen is up. [Run](06-running.md#capture-an-android-screen) explains its output.

## Next

Point it at your own app: [prepare your app](02-prepare-your-app.md), then [make elements selectable](03-identifiers.md). For an Android app, start with [Android setup](12-android-setup.md).
