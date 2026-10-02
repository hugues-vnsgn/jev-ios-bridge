# jev-ios-bridge

Check an iOS or Android app the way a person reads its screen. You write a script of taps, typing, swipes and waits, with checkpoints such as "The order total reads $5". The bridge runs it on an iOS simulator through [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP), or on an Android emulator or phone through `adb` and its own copy of [mobilecli](https://github.com/mobile-next/mobilecli)'s device agent. At each checkpoint, TypeSafe's Jev model reads the screen's text and judges the claims. You get one verdict, passed, failed or inconclusive, with screenshots and a log behind it.

Jev is the point. It costs $0.042 per million input tokens, so judging a screen costs about a hundredth of a cent, and a saved script of taps reruns from the terminal with no Claude in the loop. Scripts live in your app's repository and work for SwiftUI, UIKit, Compose Multiplatform, Jetpack Compose and Android Views apps. Claude Code writes and runs them through the plugin's `/jev-ios-bridge:test-ios` and `/jev-ios-bridge:test-android` skills.

```text
script ─► bridge ─► MobileBuildMCP ─► iOS simulator
            ├─► adb + device agent ─► Android emulator or phone
            │  at each checkpoint: screen text + claims ─► Jev ─► probabilities
            │  in a do step (experimental): screen text + step ─► Jev ─► next action
            └─► verdict · report.json · screenshots · run.jsonl · live log pane
```

## What a check costs

A run can use two models: Jev, which reads screens, and Claude, which writes the script and steps in when Jev can't decide. Jev's share is small:

| What Jev reads | Input tokens | Jev cost |
| --- | ---: | ---: |
| One checkpoint: the screen's text and its claims | 1,500 to 4,000 | under $0.0002 |
| One driven decision: the screen, the step and the actions it offers | 1,500 to 6,000 | up to $0.00025 |
| A whole driven run of 13 decisions and 2 checkpoints | 54,000 to 58,000 | about $0.002 |

TypeSafe charges $0.042 per million input tokens for `jev-1.13.0`, and output is free ([models page](https://docs.typesafe.ai/models.md), checked on 2026-10-02; [pricing record](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/spikes/benchmarks/jev-pricing.json)).

Claude's share depends on how much Claude does. Two measurements, one run per task:

**A saved script takes work away from Claude.** On 2026-09-25, Claude Opus 4.7 either drove the iOS simulator through MobileBuildMCP itself, or submitted a saved script to the original bridge:

| Task | Claude input, driving | Claude input, saved script | Claude output, driving | Claude output, saved script | Jev input |
| --- | ---: | ---: | ---: | ---: | ---: |
| Weather (app already installed) | 707,752 | 171,799 (75.7% less) | 2,644 | 4,310 | 18,227 |
| Contacts | 1,057,569 | 118,897 (88.8% less) | 2,143 | 2,691 | 5,456 |

Claude input counts every token Claude processed over the session, cache reads included, so it is not a dollar figure. Writing the scripts went unmeasured, cache histories and permission settings differed, and the bridge runs took longer, so these runs don't prove a saving in dollars. The [full measurements](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/docs/research/scripted-benchmarks.md) list every token category and the failed attempts.

**Driven mode doesn't save money yet.** On 2026-10-02, Claude Opus 5.5 checked two short read-only flows in a real app on the iOS simulator: once driving the simulator itself, and once guiding Jev in driven mode. Costs are Claude Code's estimates at API prices:

| Flow | Claude driving | Driven mode, Claude | Driven mode, Jev |
| --- | ---: | ---: | ---: |
| Search a list and check the filtered result (7 actions) | $0.63 | $1.66 | $0.002 |
| Open a record and check its header and totals (6 actions) | $0.59 | $1.10 | $0.002 |

Jev made 10 of the 13 actions, with no wrong taps and no false pass, and the driven runs still cost 1.9 to 2.6 times as much. The whole difference is Claude's: it read the guides, studied the app's source for a script that didn't need it, and spent a full turn on every status check and every step Jev handed back. On flows this short, Jev doesn't take over enough taps to pay for that. [Cutting Claude's share](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/.scratch/driven-live-fixes/issues/05-driven-cost-on-short-flows.md) is the next piece of work.

To keep Claude's share down now:

- **Rerun saved scripts.** Writing a script is most of a first run's cost. A rerun skips it, and a version 1 script reruns [from the terminal](docs/guide/06-running.md) with no Claude at all.
- **Write `do` steps from what the app should do.** They take no selectors, so Claude doesn't need to read the source or capture screens first.
- **Write claims Jev can decide** ([writing claims](docs/guide/05-writing-claims.md)). An uncertain claim ends the run inconclusive, and running it again doubles the bill.

## Requirements

For **v1.3.1**, you need a Mac, Node 24 or later, a TypeSafe API key, and Claude Code for the plugin setup below.

- **iOS:** Xcode and an iOS simulator runtime.
- **Android:** Android Studio, the SDK's `adb` and emulator on your `PATH`, and a device on Android 12 (API 31) or later. See [Android setup](docs/guide/12-android-setup.md).

Pick [an existing project](#install-in-an-existing-project) or [a brand-new one](#start-a-brand-new-project). For the terminal only, follow the [CLI quickstart](docs/guide/01-quickstart.md#1-install-the-bridge-into-your-project); the package ships as a GitHub release tarball.

## Install in an existing project

### 1. Install and configure the Claude Code plugin

From your app's project directory, install the plugin. It holds the bridge, its MCP server and both test skills.

```sh
claude plugin marketplace add hugues-vnsgn/jev-ios-bridge
claude plugin install jev-ios-bridge@jev-ios-bridge
```

Start Claude Code in that directory. Open `/plugin` → **Installed** → **jev-ios-bridge** → **Configure**, then enter:

- your **TypeSafe API key**, which goes to the system's secure storage;
- your **iOS simulator UDID** (from `xcrun simctl list devices available`), or your **Android AVD name or device serial** (from `adb devices`). Leave the other platform's setting empty.

Run `/mcp` and check that `jev-ios-bridge` is connected. The server won't start without the key.

### 2. Prepare your app

Build and install your app on that simulator or emulator with Xcode, Android Studio or your usual build commands, and set up the test accounts and data the check needs. Don't use the device for anything else while a run is active.

Give controls stable identifiers: SwiftUI's `.accessibilityIdentifier("checkout.complete")`, UIKit's `accessibilityIdentifier`, or Compose's `Modifier.testTag("checkout.complete")`. On Android Compose, turn on `testTagsAsResourceId` at the root. See [identifiers for every framework](docs/guide/03-identifiers.md).

Each run restarts the installed app and keeps its stored data. For a predictable first screen, see [debug entry points](docs/guide/02-prepare-your-app.md#give-runs-a-stable-starting-point-debug-entry-points).

### 3. Run a first check

In Claude Code, describe a small flow and the result you expect to see. Use your own app ID and flow:

```text
/jev-ios-bridge:test-ios Check com.example.shop on the configured simulator: add one $2 apple and one $3 bread, complete the order, and verify that the confirmation shows Total: $5. Save the script as checks/checkout-ios.json and run it.
```

For Android:

```text
/jev-ios-bridge:test-android Check com.example.shop on the configured Android device: add one $2 apple and one $3 bread, complete the order, and verify that the confirmation shows Total: $5. Save the script as checks/checkout-android.json and run it.
```

Claude inspects the app, writes the script, runs it, and reports **passed**, **failed** or **inconclusive**. The evidence goes to `.jev-runs/<run-id>/`. Keep the script in your repository and rerun it after changes:

```text
/jev-ios-bridge:test-ios run checks/checkout-ios.json and tell me what the report says
```

## Start a brand-new project

### iOS with SwiftUI

1. In Xcode, choose **File → New → Project**, pick **iOS App**, and use **SwiftUI** and **Swift**. Save it in your project directory. Apple's [project tutorial](https://developer.apple.com/tutorials/develop-in-swift/create-a-project) walks through the dialog.
2. Give the first screen a visible result and a stable identifier, for example in `ContentView`'s body:

   ```swift
   Text("Ready")
       .accessibilityIdentifier("home.status")
   ```

3. Pick an iOS simulator in Xcode and **Run** the app to build and install it. Note the bundle identifier in the target's settings.
4. [Install and configure the plugin](#1-install-and-configure-the-claude-code-plugin) from this project's directory, choosing that simulator. Then, with your bundle ID:

   ```text
   /jev-ios-bridge:test-ios Check com.example.myapp: verify that the launch screen shows Ready. Save the script as checks/home-ios.json and run it.
   ```

### Android with Jetpack Compose

1. In Android Studio, create a project from **Empty Activity**, the Compose template. See the [Compose quickstart](https://developer.android.com/develop/ui/compose/setup).
2. Turn on `testTagsAsResourceId` on the root composable, as in the [Android identifier setup](docs/guide/12-android-setup.md#give-compose-elements-identifiers-testtagsasresourceid). Add `Text("Ready", modifier = Modifier.testTag("home.status"))` to the launch screen, importing `androidx.compose.ui.platform.testTag`.
3. Create and start an emulator on Android 12 or later in Device Manager, then **Run** the app to build and install it. Note its `applicationId` in the app module's Gradle file.
4. [Install and configure the plugin](#1-install-and-configure-the-claude-code-plugin), choosing that emulator. Then, with your application ID:

   ```text
   /jev-ios-bridge:test-android Check com.example.myapp: verify that the launch screen shows Ready. Save the script as checks/home-android.json and run it.
   ```

For an existing Compose Multiplatform project, follow the [existing-project steps](#install-in-an-existing-project) once per platform. To try the bridge on a ready-made app, use the [bundled diagnostic quickstart](docs/guide/01-quickstart.md): its planted wrong-total bug should give a **failed** verdict.

## Driven steps (experimental)

Since v1.3.0, a script can name what a step should achieve instead of each tap. A `do` step gives an intent, such as "Open the book Bosch", and the text that shows once it's done. Jev picks each action from the screen's text. When Jev isn't sure, the action looks risky, the step is destructive, or a system dialog is showing, the run pauses and Claude answers with one action through the MCP tool `resolve_step`. Checkpoints still decide the verdict.

Driven mode is off until you turn it on in two places: `{ "drivenMode": true }` in the project's `.jev/config.json`, and the plugin's **Experimental driven mode** setting (or `JEV_EXPERIMENTAL_DRIVEN=1`). Jev made 4 of 15 actions in v1.3.0's release checks and 10 of 13 in the first live trial on a real app, so expect Claude to answer some steps. It may change in any 1.x release. See [driven steps](docs/guide/13-driven-steps.md), and [what a check costs](#what-a-check-costs) before you count on it to save money.

## Configuration and running

Change the key or the device under `/plugin` → **Installed** → **jev-ios-bridge** → **Configure**. A device named in a script overrides the plugin's. [Running](docs/guide/06-running.md) covers terminal commands, the MCP tools, live logs and cancelling a run.

To set up the MCP server by hand, see [running without the plugin](docs/guide/06-running.md#without-the-plugin). Codex can use the MCP server and the skills today, on a best-effort basis.

## Status and limits

Since v1.0.0, the script format, the CLI and MCP tools, the verdict rules, and the report and evidence layout stay compatible across 1.x ([stability](docs/guide/11-stability.md)).

Before you use it, know that:

- on iOS it drives simulators, not real iPhones;
- on Android, real phones are supported but untested;
- Jev's judgment covers English screens;
- a run can be slower than letting Claude drive the device directly.

See [limits](docs/guide/10-limits.md). Read [data handling](docs/guide/09-data-handling.md) before you point it at an app: screen text goes to TypeSafe at each checkpoint, and in driven steps at each of Jev's decisions too.

## Guide

The [guide](docs/guide/README.md) covers preparing your app and setting up Android, making SwiftUI, UIKit, Compose and Android View elements selectable, writing scripts and claims, running from the terminal or Claude Code, reading reports, troubleshooting, data handling, limits, and what 1.x keeps stable. It ships in the package too, at `node_modules/jev-ios-bridge/docs/guide/`.

## Roadmap

- [ ] First-class, tested Codex support.
- [ ] Pi.dev support.

## Project

- **Design:** [architecture](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/docs/architecture.md) and [decision records](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.3.1/docs/adr). The key ones are [ADR-0004, verdict rules](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/docs/adr/0004-fixed-assertion-bounds-single-judgment.md), [ADR-0005, the 1.0 contract](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/docs/adr/0005-the-1-0-stability-contract.md), [ADR-0006, the Android device layer](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md), and [ADR-0007, the iOS exceptions for driven steps](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/docs/adr/0007-simulator-presentation-and-a-bounded-ios-point-tap-exception.md).
- **Evidence:** [benchmarks and experiments](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.3.1/spikes/benchmarks), and the [release notes](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.3.1/docs/releases/v1.3.1.md) with this release's measured results.
- **Changes:** [CHANGELOG](CHANGELOG.md).
- **Development:** `npm ci && npm run check` in a source checkout.
- **License:** [MIT](LICENSE).
