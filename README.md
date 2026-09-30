# jev-ios-bridge

Check an iOS or Android app the way a person reads its screen. You write a script: taps, typing, swipes, waits, and checkpoints with claims like "The order total reads $5". The bridge runs it on an iOS simulator through [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP), or on an Android emulator or phone through `adb` and its own copy of [mobilecli](https://github.com/mobile-next/mobilecli)'s device agent. TypeSafe's Jev model judges each claim against the screen's text, and you get one verdict (passed, failed, or inconclusive), with screenshots and a log behind it.

It's built for **repeatable checks**: scripts you keep in your app's repository and re-run after changes, for SwiftUI, UIKit, Compose Multiplatform, Jetpack Compose, and Android Views apps. Claude Code can write and run them through its plugin: the `/test-ios` and `/test-android` skills and an MCP server.

```text
script ─► bridge ─► MobileBuildMCP ─► iOS simulator
            ├─► adb + device agent ─► Android emulator or phone
            │  at each checkpoint: screen text + claims ─► Jev ─► probabilities
            └─► verdict · report.json · screenshots · run.jsonl · live log pane
```

## Install

You need a Mac, Node 24 or later, and a TypeSafe API key. For iOS you also need Xcode; for Android, the Android SDK's `adb` and a device with Android 12 or later ([Android setup](docs/guide/12-android-setup.md)).

**With Claude Code,** install the plugin. It brings the MCP server and the `/jev-ios-bridge:test-ios` and `/jev-ios-bridge:test-android` skills, and asks for your TypeSafe key, your simulator, and your Android device (leave empty the one you don't use):

```sh
claude plugin marketplace add hugues-vnsgn/jev-ios-bridge
claude plugin install jev-ios-bridge@jev-ios-bridge
```

**For the command line** (or Codex, or CI), install the package from the GitHub release. It isn't on npm.

```sh
gh release download v1.2.0 -R hugues-vnsgn/jev-ios-bridge -p 'jev-ios-bridge-1.2.0.tgz'
npm install ./jev-ios-bridge-1.2.0.tgz
npx jev-ios-bridge --version
```

Then follow the [quickstart](docs/guide/01-quickstart.md). It takes you from here to a first run on a bundled example app in about 15 minutes, on iOS or Android.

## Guide

The [guide](docs/guide/README.md) covers:
- preparing your app, and setting up Android;
- making SwiftUI, UIKit, Compose, and Android View elements selectable;
- writing scripts and claims;
- running from the terminal or Claude Code;
- reading reports;
- troubleshooting;
- data handling;
- limits;
- what 1.x keeps stable.

It's in the package too: `node_modules/jev-ios-bridge/docs/guide/`.

## Status

Since v1.0.0, the script format, CLI and MCP tools, verdict rules, and report and evidence layout stay compatible for all of 1.x ([stability](docs/guide/11-stability.md)).

Before you use it, know that:
- on iOS it drives simulators, not real iPhones;
- on Android, real phones are supported but untested;
- its judgment covers English screens;
- it can be slower than letting Claude drive the device directly.

See [limits](docs/guide/10-limits.md), and read [data handling](docs/guide/09-data-handling.md) before pointing it at an app. Screen text goes to TypeSafe at each checkpoint.

## Project

- **Design:** [architecture](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.2.0/docs/architecture.md) and [decision records](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.2.0/docs/adr). The key ones are [ADR-0004, verdict rules](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.2.0/docs/adr/0004-fixed-assertion-bounds-single-judgment.md), [ADR-0005, the 1.0 contract](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.2.0/docs/adr/0005-the-1-0-stability-contract.md), and [ADR-0006, the Android device layer](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.2.0/docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md).
- **Evidence:** [benchmarks and experiments](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.2.0/spikes/benchmarks), and the [release notes](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.2.0/docs/releases/v1.2.0.md), with this release's measured results.
- **Changes:** [CHANGELOG](CHANGELOG.md).
- **Development:** `npm ci && npm run check` in a source checkout.
- **License:** [MIT](LICENSE).
