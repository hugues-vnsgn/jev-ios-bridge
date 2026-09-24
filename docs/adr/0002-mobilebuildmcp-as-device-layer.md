---
status: proposed
date: 2026-09-21
revised: 2026-09-24
---

# MobileBuildMCP is the device layer

The bridge needs to boot simulators, install and launch apps, read the screen's accessibility elements, and tap, type, and swipe. The first plan was to write that ourselves over `xcrun simctl` and Meta's `idb`. We use getsentry/MobileBuildMCP instead, renamed from XcodeBuildMCP on 2026-09-23 (MIT). It already ships all of it: simulator management, build and run, a semantic UI snapshot whose elements carry references, and actions addressed by those references, through a bundled automation backend (AXe 1.8.0) that supports Xcode 26 ([research](../research/mobilebuildmcp-simulator-and-device.md)). The bridge's device driver is a thin adapter over it, and the bridge contains no simulator or UI automation code. Its own value is the loop, the Jev judgments, the policy, and the report.

We pin `mobilebuildmcp@2.7.1`. The rename changed the package, binary, config directory (`.mobilebuildmcp/`), and environment variable prefix with no compatibility layer, while `xcodebuildmcp` stays frozen at 2.7.0 under the old names.

## Consequences

- **Element references are short-lived.** A reference is a position in one snapshot. It expires after 60 seconds, is valid only in the process that took the snapshot, and is replaced after every action. If a step takes longer than that, for instance because of a slow Jev call or an escalation, the driver must take a new snapshot and find the chosen element again by its identifier or its role and label. Reports and run logs name elements by those fields, not by reference.
- **How much of the snapshot the bridge gets depends on how it calls MobileBuildMCP.** The compact form (at most 64 targets, about 600 tokens for the Home screen) is available over both the CLI and MCP. Frames and full element state (about 13,200 tokens for the same screen, minified) come only from the CLI with `--output json --verbose`. The ticket "Device driver: CLI or MCP client, and its contract" decides between them, once the ticket "Observation schema: what Jev sees each step" says which fields Jev needs.
- **Actions are not all addressed by reference.** Tap, type, and swipe take a reference. Gestures, hardware buttons, and keys take presets or key codes. Typing supports US-keyboard characters only.
- **Screenshots are small.** MobileBuildMCP returns a JPEG at most 800 pixels on its longest side. A full-resolution image means calling `simctl` directly, which would be the bridge's first device code of its own.
- **Real iPhones need a second device layer.** MobileBuildMCP builds, installs, launches, stops, and runs `xcodebuild test` on a physical device, but has no snapshot, tap, type, screenshot, or log tools for one. Supporting iPhones means a second device layer behind the same device driver. The ticket "Driving a real iPhone: what a second device layer takes" sized that path: WebDriverAgent through Appium, medium effort, most of it per-developer signing ([research](../research/physical-iphone-device-layer.md)).
- **The bridge depends on a third party that just renamed itself.** Any upgrade is deliberate, and an Xcode upgrade can force one. MobileBuildMCP sends error reports to Sentry by default, and the device driver turns that off.
