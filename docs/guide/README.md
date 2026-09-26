# jev-ios-bridge guide

jev-ios-bridge checks an iOS app the way a person would read its screen. You write a script: taps, typing, swipes, waits, and checkpoints that make claims such as "The order total reads $5". The bridge runs it on a simulator through [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP). At each checkpoint, TypeSafe's Jev model judges your claims against the text on screen. You get one verdict (passed, failed, or inconclusive), with screenshots and a log behind it.

## What it's for

**Repeatable checks.** Keep scripts in your app's repository and re-run them after changes, like UI tests that read the screen instead of poking at view internals. Writing a good script takes some effort, and it pays back every time you run it again. Claude Code can write and run the scripts for you through the bundled `/test-ios` skill.

It isn't for:
- **exploring an app without a script.** The bridge never chooses actions on its own.
- **real iPhones or CI.** 1.0 drives simulators on a Mac, run by a person or their agent.
- **speed.** Letting Claude drive the simulator directly can be faster. What the bridge gives you instead is a low cost per run, recorded evidence, and verdicts that mean the same thing every time. See [limits](10-limits.md).

## Reading order

New here? Read these in order:

1. [Quickstart](01-quickstart.md): install, then your first run, on the bundled diagnostic app.
2. [Prepare your app](02-prepare-your-app.md): the simulator, test data, and launch state.
3. [Make elements selectable](03-identifiers.md): SwiftUI, UIKit, and Compose Multiplatform.
4. [Write scripts](04-writing-scripts.md): steps, selectors, guards, waits, values.
5. [Write claims](05-writing-claims.md): claims Jev can judge with confidence.
6. [Run](06-running.md): the CLI, MCP and `/test-ios`, the watch page, and the log pane.
7. [Reports and evidence](07-reports-and-evidence.md): what a verdict means and what's recorded.

Look these up when you need them:

- [Troubleshooting](08-troubleshooting.md), by reason code
- [Data handling](09-data-handling.md): what leaves your Mac and what stays
- [Limits](10-limits.md)
- [Stability](11-stability.md): what 1.x promises, and upgrading from 0.1.0
- Worked examples: [SwiftUI (Weather)](examples/swiftui-weather.md) and [Compose Multiplatform (a design-system gallery)](examples/compose-gallery.md)
- Reference: [script format](reference/script-format.md), [reason codes](reference/reason-codes.md), [`report.json`](reference/report-json.md)

**Before you start:** use test data, in an app you control. Screen text at each checkpoint is sent to TypeSafe, and text that someone else wrote on the screen can try to steer Jev's judgment. [Data handling](09-data-handling.md) has the details.
