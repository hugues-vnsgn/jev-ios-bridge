# jev-ios-bridge

Check an iOS or Android app the way a person reads its screen. You write a script: taps, typing, swipes, waits, and checkpoints with claims like "The order total reads $5". The bridge runs it on an iOS simulator through [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP), or on an Android emulator or phone through `adb` and its own copy of [mobilecli](https://github.com/mobile-next/mobilecli)'s device agent. TypeSafe's Jev model judges each claim against the screen's text, and you get one verdict (passed, failed, or inconclusive), with screenshots and a log behind it.

It's built for **repeatable checks**: scripts you keep in your app's repository and re-run after changes, for SwiftUI, UIKit, Compose Multiplatform, Jetpack Compose, and Android Views apps. Claude Code can write and run them through its plugin: the `/jev-ios-bridge:test-ios` and `/jev-ios-bridge:test-android` skills and an MCP server.

```text
script ─► bridge ─► MobileBuildMCP ─► iOS simulator
            ├─► adb + device agent ─► Android emulator or phone
            │  at each checkpoint: screen text + claims ─► Jev ─► probabilities
            └─► verdict · report.json · screenshots · run.jsonl · live log pane
```

## Prerequisites

For **v1.2.0**, you need a Mac, Node 24 or later, a TypeSafe API key, and Claude Code for the plugin setup below.

- **iOS:** Xcode and an iOS simulator runtime.
- **Android:** Android Studio, the SDK's `adb` and emulator on your `PATH`, and an Android 12 (API 31) or later device. See [Android setup](docs/guide/12-android-setup.md).

Choose [an existing project](#install-in-an-existing-project) or [a brand-new project](#start-a-brand-new-project). For terminal use, follow the [standalone CLI quickstart](docs/guide/01-quickstart.md#1-install-the-bridge-into-your-project); the package ships as a GitHub release tarball.

## Install in an existing project

### 1. Install and configure the Claude Code plugin

From your app's project directory, install the plugin. It includes the bridge runtime, MCP server, and both test skills.

```sh
claude plugin marketplace add hugues-vnsgn/jev-ios-bridge
claude plugin install jev-ios-bridge@jev-ios-bridge
```

Start Claude Code in that directory. Open `/plugin` → **Installed** → **jev-ios-bridge** → **Configure**, then enter:

- your **TypeSafe API key**, stored in the system's secure storage;
- your **iOS simulator UDID** (find it with `xcrun simctl list devices available`), or your **Android AVD name or device serial** (find connected serials with `adb devices`). Leave the unused platform's setting empty.

Run `/mcp` and check that `jev-ios-bridge` is connected. The server needs the key before it can start.

### 2. Prepare your app

Build and install your app on the selected simulator or emulator using Xcode, Android Studio, or your existing build commands. Set up any test accounts and synthetic data the check needs. Reserve that device for the bridge while a run is active.

Give controls stable identifiers: SwiftUI's `.accessibilityIdentifier("checkout.complete")`, UIKit's `accessibilityIdentifier`, or Compose's `Modifier.testTag("checkout.complete")`. On Android Compose, enable `testTagsAsResourceId` at the root. See [identifiers for every supported framework](docs/guide/03-identifiers.md).

Each run restarts the installed app and preserves its stored data. For a predictable launch screen, see [debug entry points](docs/guide/02-prepare-your-app.md#give-runs-a-stable-starting-point-debug-entry-points).

### 3. Run a first check

In Claude Code, describe a small flow and the visible result you expect. Replace the example app ID and checkout flow with your own:

```text
/jev-ios-bridge:test-ios Check com.example.shop on the configured simulator: add one $2 apple and one $3 bread, complete the order, and verify that the confirmation shows Total: $5. Save the script as checks/checkout-ios.json and run it.
```

For Android:

```text
/jev-ios-bridge:test-android Check com.example.shop on the configured Android device: add one $2 apple and one $3 bread, complete the order, and verify that the confirmation shows Total: $5. Save the script as checks/checkout-android.json and run it.
```

Claude inspects the app, writes the script, runs it, and reports **passed**, **failed**, or **inconclusive**. Evidence lands in `.jev-runs/<run-id>/`. Keep the script in your repository and re-run it after changes:

```text
/jev-ios-bridge:test-ios run checks/checkout-ios.json and tell me what the report says
```

## Start a brand-new project

### iOS with SwiftUI

1. In Xcode, choose **File → New → Project**, select an **iOS App**, and use **SwiftUI** and **Swift**. Save it in your project directory. Apple's [project tutorial](https://developer.apple.com/tutorials/develop-in-swift/create-a-project) walks through the dialog.
2. Give the first screen a visible result and a stable identifier. For example, use this in `ContentView`'s body:

   ```swift
   Text("Ready")
       .accessibilityIdentifier("home.status")
   ```

3. Select an iOS simulator in Xcode and **Run** the app to build and install it. Note the app's bundle identifier in the target's settings.
4. [Install and configure the plugin](#1-install-and-configure-the-claude-code-plugin) from this project's directory, choosing that simulator. Then replace the example bundle ID and ask:

   ```text
   /jev-ios-bridge:test-ios Check com.example.myapp: verify that the launch screen shows Ready. Save the script as checks/home-ios.json and run it.
   ```

### Android with Jetpack Compose

1. In Android Studio, create a project using **Empty Activity**, the Compose template. See the official [Compose quickstart](https://developer.android.com/develop/ui/compose/setup).
2. Enable `testTagsAsResourceId` on the root composable using the [Android identifier setup](docs/guide/12-android-setup.md#give-compose-elements-identifiers-testtagsasresourceid). Add `Text("Ready", modifier = Modifier.testTag("home.status"))` to the launch screen, importing `androidx.compose.ui.platform.testTag`.
3. Create and start an Android 12 or later emulator in Device Manager, then **Run** the app to build and install it. Note its `applicationId` in the app module's Gradle file.
4. [Install and configure the plugin](#1-install-and-configure-the-claude-code-plugin), choosing that emulator. Replace the example application ID and ask:

   ```text
   /jev-ios-bridge:test-android Check com.example.myapp: verify that the launch screen shows Ready. Save the script as checks/home-android.json and run it.
   ```

For an existing Compose Multiplatform project, follow the [existing-project steps](#install-in-an-existing-project) for each platform. To try the bridge with a ready-made app, use the [bundled diagnostic quickstart](docs/guide/01-quickstart.md); its planted wrong-total bug should produce a **failed** verdict.

## Token usage comparison

These **historical iOS measurements from September 25, 2026** compare Claude Opus 4.7 driving MobileBuildMCP directly with Claude submitting a saved script to the original bridge. Both tasks had independently verified successful outcomes. They are single runs, not a benchmark of v1.2.0 or Android.

| Task | Direct Claude input | Claude input via bridge | Input reduction | Additional Jev input |
| --- | ---: | ---: | ---: | ---: |
| Weather (app already installed) | 707,752 | 171,799 | 75.7% | 18,227 |
| Contacts | 1,057,569 | 118,897 | 88.8% | 5,456 |

Here, **Claude input** is processed input across the whole session: uncached input + cache creation + cache reads. Repeated cached context counts each time; this is not a count of unique context tokens or a cost calculation. Jev input is separate because the bridge sends screen text to Jev at checkpoints.

Claude output increased in these runs:

| Task | Direct Claude output | Claude output via bridge |
| --- | ---: | ---: |
| Weather | 2,644 | 4,310 |
| Contacts | 2,143 | 2,691 |

Cache histories and permission configurations differed, initial script-authoring tokens were unmetered, and bridge runs took longer. These figures do not establish total-cost savings or a break-even point. See the [full measurements and methodology](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.2.0/docs/research/scripted-benchmarks.md) for token categories, failed attempts, and evidence.

## Configuration and running

Change the plugin's key or device under `/plugin` → **Installed** → **jev-ios-bridge** → **Configure**. A script's device selection overrides the plugin setting. See [running](docs/guide/06-running.md) for terminal commands, MCP tools, live logs, and cancellation.

For manual MCP setup, follow [running without the plugin](docs/guide/06-running.md#without-the-plugin). Codex can use the MCP server and skills today with best-effort support.

## Roadmap

- [ ] First-class, tested Codex support.
- [ ] Pi.dev support.

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
