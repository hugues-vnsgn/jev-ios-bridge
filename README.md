# jev-ios-bridge

Check an iOS app the way a person reads its screen. You write a script: taps, typing, swipes, waits, and checkpoints with claims like "The order total reads $5". The bridge runs it on a simulator through [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP), TypeSafe's Jev model judges each claim against the screen's text, and you get one verdict (passed, failed, or inconclusive), with screenshots and a log behind it.

It's built for **repeatable checks**: scripts you keep in your app's repository and re-run after changes, for SwiftUI, UIKit, and Compose Multiplatform apps. Claude Code can write and run them through the bundled `/test-ios` skill and MCP server.

```text
script ─► bridge ─► MobileBuildMCP ─► simulator
            │  at each checkpoint: screen text + claims ─► Jev ─► probabilities
            └─► verdict · report.json · screenshots · run.jsonl · live log pane
```

## Install

jev-ios-bridge ships as a GitHub release, not on npm. You need a Mac with Xcode, Node 24 or later, and a TypeSafe API key.

```sh
gh release download v1.0.0 -R hugues-vnsgn/jev-ios-bridge -p 'jev-ios-bridge-1.0.0.tgz'
npm install ./jev-ios-bridge-1.0.0.tgz
npx jev-ios-bridge --version
```

Then follow the [quickstart](docs/guide/01-quickstart.md). It takes you from here to a first run on a bundled example app in about 15 minutes.

## Guide

The [guide](docs/guide/README.md) covers:
- preparing your app;
- making SwiftUI, UIKit, and Compose elements selectable;
- writing scripts and claims;
- running from the terminal or Claude Code;
- reading reports;
- troubleshooting;
- data handling;
- limits;
- what 1.x keeps stable.

It's in the package too: `node_modules/jev-ios-bridge/docs/guide/`.

## Status

v1.0.0 is the first stable release. The script format, CLI and MCP tools, verdict rules, and report and evidence layout stay compatible for all of 1.x ([stability](docs/guide/11-stability.md)).

Before you use it, know that:
- it drives simulators, not real iPhones;
- its judgment covers English screens;
- it can be slower than letting Claude drive the simulator directly.

See [limits](docs/guide/10-limits.md), and read [data handling](docs/guide/09-data-handling.md) before pointing it at an app. Screen text goes to TypeSafe at each checkpoint.

## Project

- **Design:** [architecture](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.0.0/docs/architecture.md) and [decision records](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.0.0/docs/adr). The key ones are [ADR-0004, verdict rules](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.0.0/docs/adr/0004-fixed-assertion-bounds-single-judgment.md), and [ADR-0005, the 1.0 contract](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.0.0/docs/adr/0005-the-1-0-stability-contract.md).
- **Evidence:** [benchmarks and experiments](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.0.0/spikes/benchmarks), and the [release notes](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.0.0/docs/releases/v1.0.0.md) with measured results.
- **Changes:** [CHANGELOG](CHANGELOG.md).
- **Development:** `npm ci && npm run check` in a source checkout.
- **License:** [MIT](LICENSE).
