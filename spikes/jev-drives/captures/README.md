# Screen captures for the offline spike (ticket 03)

These are real screens captured from unrelated apps, for writing grounding cases in [ticket 03](../../../.scratch/jev-drives/issues/03-offline-spike-can-jev-ground-a-step.md). They are not labels: nothing here has been owner-reviewed, and no Jev or TypeSafe call was made.

Each screen folder `<app>/<NN-slug>/` holds:

- `snapshot.full.json`: the raw output of the pinned MobileBuildMCP 2.7.1 `ui-automation snapshot-ui --verbose --output json`. These are the same arguments the bridge's `MobileBuildMcpDriver.captureArgs` uses with `capture: 'full'`.
- `jev-screen.txt`: Jev's text for the screen, byte for byte. It is built by the iOS driver's own `parseSnapshot` (`src/device/index.ts`) followed by `renderAssertionState(snapshot, 'ios')` (`src/scripted/observe.ts`), with no newline added.
- `screenshot.jpg`.
- `notes.md`: how the screen was reached from launch, the taps made, 2–4 plain-language next steps a plan might ask for, and the traps on the screen.

## iOS

### Tools

- `../capture-ios.ts`: captures one screen. Run `npx tsx spikes/jev-drives/capture-ios.ts <udid> <out-dir>`. It imports the repo's source directly, so no build is needed. It drops `TYPESAFE_API_KEY` from the device environment, as the bridge does.
- `../mb.sh`: the pinned MobileBuildMCP CLI, used for taps, typing and swipes between captures.
- Some gestures had no element ref: row swipes, the system photo picker, and taps outside a popover. Those used the AXe binary bundled with MobileBuildMCP (`node_modules/mobilebuildmcp/bundled/axe tap|swipe … --udid`). Each `notes.md` names these taps as Claude-only coordinate actions.

### Simulators

- **Public apps:** `jev-drives-eval`, `3FF040D2-48F3-43FC-B287-BC25E3798BDA`, an iPhone 17 (402×874 pt) on iOS 26.4 (26.4.1), created fresh for this. Xcode 26.4.1.
- **the owner's app:** an existing, logged-in simulator on iOS 18.6.

### Builds that worked

All clones and DerivedData are under `~/Codes/eval-apps/`.

ReadMe (Kodeco course, SwiftUI) was copied to `~/Codes/eval-apps/ReadMe-copy`. The original folder was left untouched. Bundle id `com.hugues.ReadMe`:

```sh
cd ~/Codes/eval-apps/ReadMe-copy/ReadMe
xcodebuild -project ReadMe.xcodeproj -scheme ReadMe \
  -destination "platform=iOS Simulator,id=<udid>" \
  -derivedDataPath ~/Codes/eval-apps/dd/ReadMe CODE_SIGNING_ALLOWED=NO build
```

NetNewsWire is a shallow clone at `626f08c` (2026-09-29). The flags come from its CI (`.github/workflows/ci.yml`, job `ios-simulator-tests`). Bundle id `com.ranchero.NetNewsWire.iOS-DEBUG`. It built in a few minutes:

```sh
cd ~/Codes/eval-apps/NetNewsWire
PROJECT_DIR=$PWD ./buildscripts/updateSecrets.sh   # generates SecretKey.swift, as CI does
xcodebuild -project NetNewsWire.xcodeproj -scheme NetNewsWire-iOS \
  -xcconfig .github/ios-ci-no-signing.xcconfig \
  -destination "platform=iOS Simulator,id=<udid>" \
  -derivedDataPath ~/Codes/eval-apps/dd/NetNewsWire \
  OTHER_SWIFT_FLAGS='$(inherited) -DDEBUG -DSKIP_APP_GROUP_ACCESS' build
```

KotlinConf (Compose Multiplatform 1.11.1, Kotlin 2.4.10) is a shallow clone at `248474d` (2026-09-17). Bundle id `com.kotlinconf.iosapp`, version 40.0.5 (73). The first build, including Gradle and Kotlin/Native, took about 9 minutes with JDK 21 (Temurin), well inside the one-hour timebox:

```sh
cd ~/Codes/eval-apps/kotlinconf-app/app/iosApp
xcodebuild -project KotlinConf.xcodeproj -scheme KotlinConfAppScheme -configuration Debug \
  -destination "platform=iOS Simulator,id=<udid>" \
  -derivedDataPath ~/Codes/eval-apps/dd/KotlinConf CODE_SIGNING_ALLOWED=NO build
```

Install each app with `xcrun simctl install <udid> <.app>` and start it with `xcrun simctl launch <udid> <bundle id>`.

### Screens

| App | # | Screen | Traps |
|---|---|---|---|
| ReadMe | 01 | Book list | Scrolled-off "Finished!" section; row button plus separate title/author/image targets |
| ReadMe | 02 | Book detail, no image | Icon-only bookmark (read state only as `bookmark.fill`); unlabeled review field |
| ReadMe | 03 | System photo picker | System UI out of process: the picker is entirely missing from the text, which still shows the detail screen. Claude must read the screenshot |
| ReadMe | 04 | Detail with image | Destructive Delete Image beside Update Image…; the new image is unlabeled |
| ReadMe | 05 | Delete Image confirmation | Destructive-only popover (no Cancel); occluded controls still `visible: true` |
| ReadMe | 06 | Add New Book sheet, empty | Occluded list exposed; placeholders read as values; no Cancel button; disabled Add with an enabled twin |
| ReadMe | 07 | Add form filled, unsaved | Unsaved form; autocorrect changed "Le" to "Lê" |
| ReadMe | 08 | Swipe: Delete revealed | Destructive, icon-only trash |
| ReadMe | 09 | Swipe: Finished revealed | Icon-only, meaning flips per book |
| ReadMe | 10 | Edit mode | 4 identical "Reorder Remove" buttons and 4 minus icons; icon-only Done |
| ReadMe | 11 | Edit mode, row Delete armed | Destructive; duplicate rows |
| ReadMe | 12 | List scrolled to Finished! | Add New Book scrolled off the top (wrong scroll direction); stale `checkmark` identifier |
| NetNewsWire | 01 | Notification permission alert | Unexpected system dialog; app content absent from the text; "Return to ReadMe" breadcrumb |
| NetNewsWire | 02 | Feed list | Smart feeds have no `tap` action; icon-only toolbar |
| NetNewsWire | 03 | Daring Fireball article list | Long fused row labels; icon-only bulk Mark All as Read |
| NetNewsWire | 04 | Article (WKWebView) | Web content missing from the text entirely; article was auto-marked read |
| NetNewsWire | 05 | Article starred | Star state only as a "Selected - " label prefix |
| NetNewsWire | 06 | Row swipe: More, Star | Which row Star applies to is known only from frames |
| NetNewsWire | 07 | Settings sheet | Occluded feed list exposed; table rows lack `tap`; ~20 KB of 24 KB budget |
| NetNewsWire | 08 | Add menu | No Cancel; list underneath exposed |
| NetNewsWire | 09 | Paste permission alert | Unexpected system dialog, only when the clipboard has content |
| NetNewsWire | 10 | Add Feed form, empty | Placeholders as values; occluded list exposed |
| NetNewsWire | 11 | Add Feed form filled, unsaved | Unsaved form; two "Add" buttons (sheet and occluded toolbar) |
| NetNewsWire | 12 | Mark All as Read confirmation | Two "Mark All as Read" buttons; bulk change; no Cancel |
| KotlinConf | 01 | Privacy notice prompt | Consent gate; Accept is a server write. Rejected to browse |
| KotlinConf | 02 | Notifications onboarding | Switch state missing from the text; leads to a system alert |
| KotlinConf | 03 | Schedule | Two "Coffee Break" rows; vote buttons hidden under the tab bar but `visible: true`; an unlabeled button |
| KotlinConf | 04 | Session detail | Icon-only vote faces (server writes) |
| KotlinConf | 05 | Search with a query | System "Paste" callout with hidden Back/Forward; two "Back" buttons; 4th result scrolled off |
| KotlinConf | 06 | Speakers list | Long alphabetical list (scrolled-off targets); search box exposed as a button |
| KotlinConf | 07 | Venue map | Canvas: no room names in the text |
| KotlinConf | 08 | Info tab | Tiles that leave the app (Twitter, Slack, Bluesky) |
| KotlinConf | 09 | About the app | Production backend shown only by a *missing* "Staging" label |
| KotlinConf | 10 | Settings | Theme and switch states missing from the text |

the owner's app has 8 more screens. They are private and kept out of the repo, and its cases were dropped from the spike.

### Not captured

- **KotlinConf's iOS notification permission alert** was handled (Don't Allow) but not captured, because it is the same system alert as NetNewsWire 01.
- The jev-drives-eval simulator now holds local edits: Bosch has a cover photo, one NetNewsWire article is starred and read, and notifications and paste were denied for both apps.

## Android

(Captured separately.)

The Android folders use a different file layout from the iOS ones. Each `<app>/<NN-slug>/` holds:

- `capture.jsonl`: `jev-ios-bridge capture --avd Medium_Phone_API_36.1`, one JSON line per element, as a script's selectors read it.
- `capture-jev.txt`: the same with `--jev`. This is Jev's text for the screen, byte for byte, frames included.
- `screenshot.png`: `adb exec-out screencap -p`, taken just before the two captures.
- `notes.md`: as for iOS. Tap coordinates are device pixels taken from the frames in `capture-jev.txt`.

KotlinConf's Android screens are in `kotlinconf-android/`, so they stay apart from the iOS ones in `kotlinconf/`.

### Device and tools

- **Emulator:** AVD `Medium_Phone_API_36.1`, Android 16 (API 36), 1080x2400, arm64. It was cold-booted with `emulator -avd Medium_Phone_API_36.1 -no-snapshot -no-boot-anim`, so the quickboot snapshot was neither loaded nor saved. It was shut down at the end.
- **Private adb server:** `ANDROID_ADB_SERVER_PORT=5099 ADB_USB=0 adb start-server`. With `ADB_USB=0`, the server doesn't scan USB, so the owner's phone (`<serial>`) never appeared in `adb devices` on port 5099. The phone still showed on the default server, port 5037, which wasn't touched. Every adb call and every `capture` ran with the same two variables, and the helper checked before each capture that `emulator-5554` was the only device. The server was stopped at the end.
- **Bridge:** `node dist/cli.js capture` from this repo at v1.2.0 (`dist/` was current, so no rebuild). `TYPESAFE_API_KEY` was unset. No Jev or TypeSafe calls were made.
- **Helpers** (not in the repo): `~/Codes/eval-apps/tools/cap.sh <app> <slug>` wakes the screen, takes the screenshot, then runs both captures, retrying up to 3 times. `tap.sh` refuses to run if the phone is visible.
- **Emulator settings changed during the run:** `svc power stayon true`, and the three animation scales set to 0, from Now in Android onward. Without them, captures timed out while NiA's loading spinner animated. Both were restored at the end: stayon false; window and transition scales 1.0; the animator scale deleted, which is how it started.

### Builds that worked

All under `~/Codes/eval-apps/`.

ListMaker (Kodeco course, Jetpack Compose) was copied from `~/Codes/native/video-yskaa-materials-versions-3.0/final` to `listmaker/`; the original wasn't touched. It needs JDK 17 for Gradle 8.0 / AGP 8.0. **I downloaded a portable Temurin 17.0.20.1** (`OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.20.1_1.tar.gz`, SHA-256 checked against the Adoptium API) into `tools/jdk-17.0.20.1+1`. The Gradle wrapper was not changed. The build took 1 min 55 s:

```sh
cd ~/Codes/eval-apps/listmaker
JAVA_HOME=~/Codes/eval-apps/tools/jdk-17.0.20.1+1/Contents/Home ./gradlew --no-daemon :app:assembleDebug
# app/build/outputs/apk/debug/app-debug.apk, package com.kodeco.android
```

Now in Android: a shallow clone at `a49ed25`, built with JDK 21 in 4 min 51 s:

```sh
cd ~/Codes/eval-apps/nowinandroid && ./gradlew --no-daemon :app:assembleDemoDebug
# app/build/outputs/apk/demo/debug/app-demo-debug.apk, package com.google.samples.apps.nowinandroid.demo.debug
```

KotlinConf: a separate shallow clone at `248474d` in `kotlinconf-app-android/`, so this build couldn't clash with the iOS build in `kotlinconf-app/`. Built with JDK 21 in 1 min 50 s:

```sh
cd ~/Codes/eval-apps/kotlinconf-app-android && ./gradlew --no-daemon :app:androidApp:assembleDebug
# app/androidApp/build/outputs/apk/debug/androidApp-debug.apk, package com.jetbrains.kotlinconf, 40.0.5 (73)
```

Fossify Calendar: the official release APK, not built:

```sh
gh release download 1.11.0 -R FossifyOrg/Calendar -p calendar-22-foss-release.apk
shasum -a 256 calendar-22-foss-release.apk
# 4b946bee820b516ef9e4893a7f92ba2aa187201b15915e159c6f04567648f93e, matching the asset digest GitHub reports
apksigner verify --print-certs calendar-22-foss-release.apk
# signer CN=Naveen Singh, O=Fossify; certificate SHA-256 affdb124…f292
```

Install each APK with `adb -s emulator-5554 install -r <apk>`.

### Screens

| App | # | Screen | Traps |
|---|---|---|---|
| ListMaker | 01 | Lists, empty state | "No tasks yet" on the lists screen; icon-only FAB labelled "Add a new task icon"; no ids anywhere |
| ListMaker | 02 | Add list dialog, empty | No Cancel; placeholder as label |
| ListMaker | 03 | Add list dialog filled, unsaved | Unsaved form; Create jumps into the new list, not back to the home screen |
| ListMaker | 04 | Three lists | Similar rows (Groceries / Groceries for party); exact duplicates are impossible (a duplicate name overwrites silently) |
| ListMaker | 05 | List's tasks, empty state | "No todos for this task yet" (wording swapped); icon-only Back |
| ListMaker | 06 | Add list dialog over lists, unsaved | Unsaved form; the lists underneath are missing from the text |
| ListMaker | 07 | Four lists | Order changed from 04 (HashMap order) |
| ListMaker | 08 | List's tasks | Milk / Milk powder; task rows are buttons with an empty onClick |
| ListMaker | 09 | Add task dialog filled, unsaved | Unsaved form; no Cancel |
| Now in Android | 01 | Splash | Empty capture (0 elements); the two captures disagree (the `--jev` one caught the permission prompt) |
| Now in Android | 02 | Notification permission prompt | Permission prompt on first launch (denied) |
| Now in Android | 03 | For you topic picker | Every topic switch doubled; a cut-off column of unlabelled switches; Done disabled |
| Now in Android | 04 | Picker with two topics followed | The next screen (feed) already loading underneath |
| Now in Android | 05 | For you feed | Icon-only Bookmark; card opens a browser; "X is not followed" chips; unlabelled card half off-screen |
| Now in Android | 06 | Saved | The toggle's label flips to "Unbookmark"; the selected tab loses its button role |
| Now in Android | 07 | Interests | Nine identical "Follow interest" switches; followed topics scrolled off |
| Now in Android | 08 | Topic detail (Compose) | Follow state as a "NOT FOLLOWING" label |
| Now in Android | 09 | Settings dialog | Unlabelled radios; bare "Yes"/"No"; OK only, no Cancel; links leave the app |
| Now in Android | 10 | Search "compose" | Duplicate follow switches; ids present only here |
| Fossify Calendar | 01 | Month grid | Canvas grid: day cells are buttons, but events and today's marker are not in the text |
| Fossify Calendar | 02 | New speed-dial | Icon-only Task icon; whole grid listed behind an overlay |
| Fossify Calendar | 03 | New Event form, empty | Duplicate date/time labels (start = end); lower rows visible but missing from the text |
| Fossify Calendar | 04 | New Event filled, unsaved | Unsaved form; icon-only Save |
| Fossify Calendar | 05 | "Unsaved changes. Save before exit?" | Unexpected dialog; Discard is destructive; no Cancel |
| Fossify Calendar | 06 | Reminder Disclaimer on Save | Unexpected dialog interrupts Save |
| Fossify Calendar | 07 | Notification permission prompt | The first-run prompt, raised by saving a reminder, not by launch (denied) |
| Fossify Calendar | 08 | "Permission Required" after deny | App dialog chained after the system prompt; Grant Permission |
| Fossify Calendar | 09 | Form still open after the dialogs | False progress: Save looked done but nothing was saved |
| Fossify Calendar | 10 | Permission prompt again | Same "Don’t allow" label, different id ("don't ask again") |
| Fossify Calendar | 11 | Day view, empty | Empty state with no text; same id is "Search" on one screen and "Back" on another |
| Fossify Calendar | 12 | Settings (top) | Holder button plus a text for each row; targets scrolled off |
| Fossify Calendar | 13 | System ANR "Calendar isn't responding" | Unexpected system dialog; Close app loses state |
| Fossify Calendar | 14 | Settings scrolled | Target just below the fold; CalDAV sync is a risky toggle |
| Fossify Calendar | 15 | Default reminder picker | Radios exposed as switches; no title or Cancel |
| Fossify Calendar | 16 | Month grid with a saved event | Canvas: "Dentist" drawn, absent from the text |
| Fossify Calendar | 17 | Day view with the event | Row button and text duplicate |
| Fossify Calendar | 18 | Edit Event | Destructive icon-only Delete beside Duplicate and Save |
| Fossify Calendar | 19 | Delete confirmation | Destructive Yes/No, no title (answered No) |
| KotlinConf | 01 | System ANR on first launch | Unexpected system dialog over the privacy notice; kept coming back until a relaunch |
| KotlinConf | 02 | Privacy notice | Consent gate; Accept enables server writes (Rejected) |
| KotlinConf | 03 | Notifications onboarding | "Get started" triggers a system prompt |
| KotlinConf | 04 | Notification permission prompt | Permission prompt (denied) |
| KotlinConf | 05 | Schedule | Two "Coffee Break" rows; vote and feedback controls (server writes) on the list |
| KotlinConf | 06 | Session detail | Icon-only votes; description scrolled off |
| KotlinConf | 07 | Speakers | Long list; targets scrolled off; search exposed as a button |
| KotlinConf | 08 | Venue map | Canvas: no room names in the text |
| KotlinConf | 09 | Info | Tiles that leave the app (Twitter, Slack, Bluesky) |
| KotlinConf | 10 | About the app | Production backend shown only by the missing "Staging" label |

### Problems met

- **Host load.** Another agent's Gradle build pushed the Mac's load average to 30–110. During that time the emulator's system server restarted once ("DeadSystemException"), losing an unsaved Fossify form. The form was redone for 04. Fossify (Settings) and KotlinConf (first launch) also each raised an ANR dialog, captured as Fossify 13 and KotlinConf 01.
- **Bridge capture failures under load:** `DEVICE_ERROR: The device agent didn't answer with the pinned SHA-256 within 5 s`, and once `The device agent request timed out` followed by `CLEANUP_FAILED … device lease kept`. A plain retry worked, and the next run cleared the leftovers, as documented. The helper retries up to 3 times. Now in Android only captured reliably once the animation scales were 0.
- **`adb shell input text` is unreliable in Compose fields under load.** It typed "GGr" for "Groceries", and twice it typed into an unfocused field and lost the text. Each case was checked and retyped.
- **Fossify only saves a reminder event once the notification permission is granted.** Denying the permission loops through "Permission Required". To save an event without granting, I turned off "Use the last event's reminders" and set Default reminder 1 to "No reminder" in Settings.

### Left on the emulator

These stay in the AVD's user data, because snapshots were not saved but the data partition was. Fossify holds the "Dentist appointment" event on 1 October, with the reminder settings changed and notifications denied. ListMaker holds four lists, and Groceries has 4 tasks. Now in Android follows Headlines and UI and has one bookmark, with notifications denied. KotlinConf has the privacy notice rejected and notifications denied. The bridge's device agent dex is probably still in `/data/local/tmp` (not checked).

### Not captured

- ListMaker has no delete, edit or settings screens, so it has 9 screens of 4 kinds.
- No KotlinConf vote, feedback or privacy Accept was attempted (read-only), and neither was KotlinConf's Settings screen.
