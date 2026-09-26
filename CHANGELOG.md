# Changelog

jev-ios-bridge follows [semantic versioning](https://semver.org). What 1.x keeps stable: [stability](docs/guide/11-stability.md).

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
