# Phase 3 fixture apps

Throwaway SwiftUI and Jetpack Compose apps for prototypes 07, 08, and 19. Both use `dev.jevbridge.fixture`. These projects are separate from the frozen diagnostic apps.

## Build

Run from this directory. XcodeGen and Xcode 27 build the arm64 iOS simulator app. Swift uses language mode 6, complete concurrency checking, and an iOS 17 deployment target. No default actor isolation or upcoming features are enabled. UI state belongs to the main actor.

```sh
xcodegen generate --spec ios/project.yml
xcodebuild -project ios/FixtureApp.xcodeproj -scheme FixtureApp \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/pfx-ios \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO build
```

The result is `/tmp/pfx-ios/Build/Products/Debug-iphonesimulator/FixtureApp.app`. The checked-in Xcode project can also build without regeneration.

Android uses Gradle 9.1.0, AGP 9.0.1 with built-in Kotlin, Compose compiler plugin 2.4.10, Java 11 bytecode, and Android SDK 36. Compose dependencies match the diagnostic project's setup. There is one Android application module and no shared source set or network permission.

```sh
cd android
ANDROID_HOME="$HOME/Library/Android/sdk" \
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
./gradlew :app:assembleDebug --console=plain --max-workers=2 --no-daemon
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`. Under hStack, submit these same argument vectors to `adapters/native_exec.py` as build requests. PFX's requests and raw build logs are in the external evidence directory below.

## Controls

The opening menu exposes `menu.fields`, `menu.scroll`, `menu.navigation`, `menu.duplicates`, `menu.alias`, `menu.tree`, `menu.changing`, `menu.recorder`, and `menu.hold`. A screen's Back button is `back.<screen>`. Android system BACK also pops Detail to Navigation and other screens to the menu.

- Fields expose `field.plain`, `field.secure`, `field.formatted`, `field.unicode`, `field.empty`, and `field.prefilled`. Each edit updates a read-only `committed.<name>` label. The phone example inserts a hyphen after each group of three digits. Empty starts with a hint. Prefilled starts with `Already filled`. Secure uses the platform password field. The committed label intentionally reveals fixture text; enter synthetic data only.
- Scroll exposes `scroll.vertical`, 60 `row.<n>` buttons, a nested `scroll.horizontal`, and 12 `horizontal.<n>` buttons. Rows start at zero. The non-lazy list keeps all fixture rows in the view hierarchy.
- Navigation exposes `navigation.push` and `detail.title`. iOS adds `detail.back`.
- Duplicates has two independent `Duplicate` buttons at different heights. Neither has an identifier. Their events distinguish `duplicate.top` and `duplicate.bottom`.
- Alias uses one native wrapper and one native button, both labeled `Alias`, with matching bounds and no identifiers. Either native hit routes to `alias.inner`. Prototype 19 must establish their actual exposure and dispatch behavior under the selected automation settings.
- Tree nests 73 explicitly accessible containers, `tree.depth.0` through `tree.depth.72`, around `tree.leaf`. Automation's configured depth limit can omit the leaf. The source hierarchy and the automation snapshot are separate observations.
- Changing exposes `changing.continuous`, updated about every 200 ms, `changing.delayed`, and `changing.trigger`. A tap changes the delayed value once after two seconds. A new tap replaces a pending change. Leaving the screen cancels its timers.
- Recorder has `recorder.alpha`, `recorder.beta`, `recorder.gamma`, and `recorder.log`. Log rows have `event.<control>.<kind>.<count>` identifiers.
- Hold exposes `hold.control` and `hold.duration`. Releasing a press records its duration in milliseconds.

## Recorder output

The in-memory recorder appends one JSON object per observed callback. `control` names the target, `kind` names the callback, `count` increases per control and kind, and `t` is Unix time in seconds. Hold events add `durationMs`. iOS prints each object to stdout with a flush. Android writes it with the `Fixture` logcat tag.

```text
FIXTURE_EVENT {"control":"recorder.alpha","kind":"tap","count":1,"t":1792728000}
```

`tap` counts activation callbacks. `focus` records a field pointer interaction, `change` records an editing callback, `submit` records a keyboard submission, and `swipe` records a completed drag. A nested swipe can appear for both containing scroll areas. Android back records `kind=back`. These are app observations, not an inferred count of OS events or SDK calls. Reopening the app resets the log and counters. Field contents are not included in event objects.

## PFX evidence

Local artifacts, build requests, native helper logs, live scripts, XML, screenshots, console bytes, native settings, and shutdown receipts are retained at `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/PFX-evidence/`. Binaries are not committed. The smoke run uses only the Phase 1 private pair, one device at a time. It launches iOS natively and creates an Appium session with `autoLaunch=false`, `noReset=true`, and `skipLogCapture=true`. Both platforms always set `skipLogCapture=true`.

The fixtures establish no adapter, normalizer, alias, completeness, replacement-text, or gesture acceptance decision. Those remain with prototypes 07, 08, and 19 and the owner.

## PFX limits

The final iOS alias snapshot exposes two `Alias` buttons with the same bounds. The native 73-container Tree caused `getPageSource` to exceed the 240-second request deadline. PFX stopped after that fix-and-retry; final Tree capture and rendering remain unproved. The earlier SwiftUI Tree rendered but flattened to one accessible container. The root owns the next step for prototype 19.

Native WDA `/appium/settings` returned `waitForIdleTimeout=10` and `animationCoolOffTimeout=2`. It exposes no `waitForQuiescence` getter. PFX reports that missing readback rather than substituting a driver-local value.
