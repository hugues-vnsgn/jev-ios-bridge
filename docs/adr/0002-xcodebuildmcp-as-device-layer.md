# ADR-0002: XcodeBuildMCP is the device layer

Date: 2026-09-21
Status: accepted

## Context

The first charting pass planned a home-grown device driver over `xcrun simctl` and Meta's `idb`. The user asked whether getsentry/XcodeBuildMCP could be used instead. Verified locally with version 2.7.0 via `npx -y xcodebuildmcp@latest tools`: it ships simulator list, boot, install, launch-app, build-and-run, screenshot, a semantic runtime UI snapshot (`snapshot-ui`, format "rs/1") whose elements carry element references, and tap, swipe, long-press, type-text, key-press, gesture, and wait-for-ui addressed by those references. It runs as a stdio MCP server or as a CLI with a background daemon holding the stateful snapshot. It also covers physical devices and macOS. MIT licensed, actively maintained under Sentry.

## Decision

The bridge does not own simulator or UI automation code. XcodeBuildMCP is the device layer. The `DeviceDriver` seam in the bridge is a thin adapter over it. The bridge's own value is the run loop, the Jev judgments, the policy, and the report.

## Consequences

- Ticket "idb on Xcode 26" is replaced by research on XcodeBuildMCP's snapshot format, element reference stability, CLI output, and daemon lifecycle.
- The observation Jev is shown derives from the rs/1 snapshot rather than a raw accessibility dump, so pruning is simpler and element references become candidate ids directly.
- How the bridge talks to XcodeBuildMCP (CLI shell-out, MCP client, or letting the host agent drive it directly with the bridge only supplying Jev judgments) is a live decision, not settled here.
- Physical devices become cheap to add later since XcodeBuildMCP already supports them; they stay out of scope for this effort.
- The bridge takes a dependency on a third-party tool's stability and its UI automation backend (AXe). Version pinning is required.
