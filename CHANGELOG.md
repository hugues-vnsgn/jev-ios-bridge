# Changelog

jev-ios-bridge follows [semantic versioning](https://semver.org). What 1.x keeps stable: [stability](docs/guide/11-stability.md).

## 1.2.0

Android support. iOS scripts, messages and reports work as in 1.1.

### Added

- **Android apps.** A script with `"platform": "android"` names its app by `app.package`, and can add `app.activity` and `app.intentExtras` to open a known screen. It names the device with `device.avd` for an emulator or `device.serial`, or leaves that to `JEV_ANDROID_DEVICE`. You need the Android SDK's `adb` and Android 12 (API 31) or later. The guide's [Android setup](docs/guide/12-android-setup.md) page covers it.
- **Typed values on Android** may start with a hyphen and may be non-English text. Non-English text goes through the device clipboard, and the keyboard may keep it, so it shouldn't be a real secret. ASCII text never touches the clipboard.
- **The device agent.** The bridge reads and drives an Android screen through its own copy of mobilecli's device agent, taken from the pinned `mobilecli` 1.0.14 package and checked against its SHA-256. It never runs mobilecli itself ([ADR-0006](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.2.0/docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md)).
- **One device lease for both platforms.** iOS and Android runs hold a device through the same lease, keyed by the device's identity. It lives in the same folder 1.1 used, so bridges of any 1.x version keep out of each other's way. When a bridge crashed mid-run, the next run takes over its lease and first clears what it left behind: the device agent, the `adb` forward and the log streams.
- **Another UI tool on the device** (mobile-mcp, mobilecli, Appium, `uiautomator`) makes an Android run refuse with `DEVICE_BUSY` before it touches the app. The bridge leaves that tool's agent running.
- **Jev's view of an Android screen** is the iOS field set under its own header, recorded as the rule `android-full-text-v1`. An empty field shows its hint as `placeholder`, and a password field shows dots.
- **The log pane on Android** shows the app's logcat, filtered to the app's uid. The `logs` command and the per-step log tails read the same file. A crash, kill or quit ends the run with `APP_EXITED`, a freeze with `APP_NOT_RESPONDING`, and the pane names the cause.
- **`jev-ios-bridge capture`** prints the current Android screen as a run sees it: one JSON line per element, or Jev's text with `--jev`. It picks the device by `--serial`, then `--avd`, then `JEV_ANDROID_DEVICE`. It never launches or restarts the app, and needs no TypeSafe key. It exits 0 when it printed and 3 when it couldn't. Its flags, exit codes and named fields are stable; each element line may gain fields.
- **`/test-android`,** a skill that writes and runs an Android script the way `/test-ios` does, looking at screens with `capture`. The plugin ships it as `/jev-ios-bridge:test-android`.
- **An "Android device" plugin setting,** a serial or an AVD name, passed to the server as `JEV_ANDROID_DEVICE`. It's optional, and empty counts as unset.
- **Reason codes:** `DEVICE_NOT_CONNECTED`, `DEVICE_AMBIGUOUS` (two running emulators share the AVD name), `DEVICE_UNAUTHORIZED`, `DEVICE_NOT_BOOTED`, `DEVICE_LOCKED`, `APP_NOT_INSTALLED`, `APP_NOT_RESPONDING`, `DEVICE_UNSUPPORTED` and `ANDROID_TOOLS_UNAVAILABLE`. See the [reason codes](docs/guide/reference/reason-codes.md). An iOS device-layer `APP_NOT_INSTALLED` still reports `DEVICE_ERROR` with that `vendorCode`, as in 1.1.
- **Run log and report fields, on Android runs only:**
  - `started` and `report.json`: `platform`, `package`, `activity` and `intentExtras`. `bundleId` is `null`.
  - `prepared`: `deviceIdentity`, `serial`, `agentSha256`, `logSources.logcat`, and `sweptLeftovers: true` after a takeover that cleared leftovers.
  - A replace-text `action` event: `shownValue`, what the field shows after typing. `report.json` lists them as `typedFields`.
  - A `step` event: `settled: false` when the screen was still changing.

### Changed

- **`NO_DEVICE`, `INVALID_DEVICE` and `DEVICE_BUSY` are described for both platforms.** What each means is the same, and the iOS messages, `DEVICE_BUSY`'s "is locked by" included, are unchanged.
- **`start_scenario`'s description and the CLI help name Android:** "an explicit iOS or Android action script", `JEV_ANDROID_DEVICE`, and `capture`.
- **The plugin's "Simulator UDID" setting is optional,** so a plugin set up only for Android starts. The package and plugin descriptions say iOS and Android. The name stays `jev-ios-bridge` through 1.x.

### Upgrading from 1.1

Nothing to change for iOS scripts: they run and report as in 1.1. In the plugin, leave "Android device" empty if you only check iOS apps.

## 1.1.0

### Added

- **A Claude Code plugin build.** `npm run build:plugin` packs the bridge, the `/test-ios` skill, and the MCP server into one zip for a GitHub release, with a `marketplace.json` that points at it. On install, Claude Code asks for the TypeSafe key, which it keeps in secure storage, and the simulator's UDID. See `plugin/README.md`.
- **`JEV_PROJECT_DIR`,** which stands in for the working directory: where `.jev-runs/`, `.mobilebuildmcp/config.yaml`, and relative script paths are found. The plugin sets it to your project, because Claude Code starts plugin servers in the plugin's own folder. Unset, nothing changes.

### Changed

- **The quickstart and README install the plugin** for Claude Code. Registering the server and copying the skill by hand moved to [running](docs/guide/06-running.md#without-the-plugin), for npm installs and Codex.

## 1.0.0

The first stable release. The script format, CLI and MCP tools, verdict rules, and report and evidence layout are now frozen for 1.x.

### Added

- **`report.json`,** the versioned report, written beside `run.jsonl`, and printed by `run --json` and `report --json`.
- **Script `"version": 1`,** required.
- **`app.launchArgs`,** to launch the app with arguments, such as a debug-only entry point.
- **The live log pane:** a terminal window with the app's own output during a run, with script values masked. `jev-ios-bridge logs RUN_ID` follows it from any terminal, `start_scenario` returns `logsCommand`, and it's turned off by `--no-log-pane` or `JEV_LOG_PANE=off`.
- **Vocabularies owned by the bridge:** a fixed list of reason codes, and of selector roles. Unknown MobileBuildMCP codes become `DEVICE_ERROR`, keeping `vendorCode`.
- **`APP_EXITED`:** a run that fails because the app died says so.
- **Exit code 3** for "couldn't start". Schema errors are printed with their paths.
- **The Jev model and bridge version** are shown in the report header and recorded in `report.json`.
- **The guide:** `docs/guide/`, with a quickstart, SwiftUI and Compose Multiplatform examples, troubleshooting, data handling, limits, and reference pages.
- **Golden-file contract tests** for every frozen surface.
- **MIT license.**

### Changed

- **A confidently false claim now fails its checkpoint even beside uncertain claims** (ADR-0004). It used to be inconclusive.
- **The screen text sent to Jev** keeps scroll-bar lines (`visible-full-text-v2`), adopted after a pre-registered corpus test.
- **MobileBuildMCP 2.7.1 is installed as a dependency** and run directly, not through `npx`. The screenshot is taken at the same time as each capture.
- **`report RUN_ID` exits** with the run's verdict code, not 0.
- **Device locks recover:**
  - cleanup waits past a device command's own deadline;
  - a late acknowledgement releases the lock;
  - a lock left by an exited process is cleared;
  - `DEVICE_BUSY` names the holder and the lock file.
- **Each run gets its own watch-page token.**
- **Device-layer processes no longer receive `TYPESAFE_API_KEY`.**
- **The evidence folder gets a `.gitignore`** containing `*`.

### Removed

- **The retired autonomous-navigation code** is out of the package: the `goal` runner, legacy scenario forms, and the legacy report. The package exposes only its CLI (`exports`), without type declarations.
- **`docs/usage.md`,** replaced by the guide.

### Fixed

- **`value: ""` selectors,** which never matched a real empty field, are now rejected with an explanation.
- **Stopping an app that had already exited** no longer turns the run into `CLEANUP_FAILED`.

### Upgrading from 0.1.0

1. Add `"version": 1` to every script.
2. Remove `value: ""` from selectors.
3. Use a selector `role` from the documented list.
4. Treat exit code 3 as "couldn't start", and expect `report` to return the run's code.
5. Expect a false claim beside an uncertain one to fail, not come back inconclusive.

## 0.1.0

Experimental prerelease: scripted runs with Jev-judged checkpoints. [Notes](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.0.0/docs/releases/v0.1.0.md).
