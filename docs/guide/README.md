# jev-ios-bridge guide

jev-ios-bridge checks an iOS or Android app the way a person would read its screen. You write a script: taps, typing, swipes, waits, and checkpoints that make claims such as "The order total reads $5". The bridge runs it on an iOS simulator through [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP), or on an Android emulator or phone through `adb` and its own copy of [mobilecli](https://github.com/mobile-next/mobilecli)'s device agent. At each checkpoint, TypeSafe's Jev model judges your claims against the text on screen. You get one verdict (passed, failed, or inconclusive), with screenshots and a log behind it.

## What it's for

**Repeatable checks.** Keep scripts in your app's repository and re-run them after changes, like UI tests that read the screen instead of poking at view internals. Writing a good script takes some effort, and it pays back every time you run it again. Claude Code can write and run the scripts for you through the bundled `/test-ios` and `/test-android` skills.

It isn't for:
- **exploring an app without a script.** The bridge chooses no actions on its own, except in [driven steps](13-driven-steps.md), an experimental mode you turn on, where it acts toward an outcome your script names.
- **real iPhones or CI.** The bridge drives iOS simulators and Android devices from a Mac, run by a person or their agent. Real Android phones are supported but untested.
- **speed.** Letting Claude drive the device directly can be faster. What the bridge gives you instead is a low cost per run, recorded evidence, and verdicts that mean the same thing every time. See [limits](10-limits.md).

## Reading order

New here? Read these in order:

1. [Quickstart](01-quickstart.md): install, then your first run, on the bundled diagnostic app (iOS, then Android).
2. [Prepare your app](02-prepare-your-app.md): the device, test data, and launch state. For Android, also [set up Android](12-android-setup.md).
3. [Make elements selectable](03-identifiers.md): SwiftUI, UIKit, Compose Multiplatform, Jetpack Compose, and Android Views.
4. [Write scripts](04-writing-scripts.md): steps, selectors, guards, waits, values.
5. [Write claims](05-writing-claims.md): claims Jev can judge with confidence.
6. [Run](06-running.md): the CLI and `capture`, MCP, `/test-ios` and `/test-android`, the watch page, and the log pane.
7. [Reports and evidence](07-reports-and-evidence.md): what a verdict means and what's recorded.

Look these up when you need them:

- [Android setup](12-android-setup.md): `adb`, naming the device, `testTagsAsResourceId`, and device settings
- [Troubleshooting](08-troubleshooting.md), by reason code
- [Data handling](09-data-handling.md): what leaves your Mac and what stays
- [Limits](10-limits.md)
- [Stability](11-stability.md): what 1.x promises, what 1.2 added, and upgrading from 0.1.0
- [Driven steps (experimental)](13-driven-steps.md): `do` steps that Jev performs, and hand-backs to Claude
- Worked examples: [SwiftUI (Weather)](examples/swiftui-weather.md) and [Compose Multiplatform (a design-system gallery)](examples/compose-gallery.md)
- Reference: [script format](reference/script-format.md), [reason codes](reference/reason-codes.md), [`report.json`](reference/report-json.md)

**Before you start:** use test data, in an app you control. Screen text at each checkpoint is sent to TypeSafe, and text that someone else wrote on the screen can try to steer Jev's judgment. [Data handling](09-data-handling.md) has the details.
