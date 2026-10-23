# Session startup cost and lifetime

Type: prototype
Status: claimed
Claimed by: root (Claude); evidence built by the Codex worker (brief ~/.codex/reports/jev-ios-bridge/phase3-build/P06-session-cost-brief.md); owner decides
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 04

## Question

How long does one owned Appium session take to start on each platform, and
what happens to it during a long idle pause or when the process that created
it exits?

## Required investigation or discussion

On the private pair, one run per check:

- Time from MCP child spawn to session ready, and to the first page source.
  Measure cold (WDA or UiAutomator2 server not yet running) and warm.
- Leave a session idle for typical driven hand-back pauses, about 1, 5 and
  15 minutes, then act. Record what `newCommandTimeout`, the WDA and
  UiAutomator2 servers, and the device itself do in the meantime.
- What survives when the creating process exits normally (the observed
  prepare, park, then action handover).
- Today's per-run startup on the same devices, for comparison.

Added from Device side effects of an Appium session:

- Idle for longer than 300 s: `newCommandTimeout` looks inert under
  appium-mcp, which never calls `executeCommand`.
- Whether the MCP child exits once stdin ends.
- What `APPIUM_MCP_ON_CLIENT_DISCONNECT=delete_all` does when stdin is closed
  and when the bridge is killed.

Added from iOS app output and crash detection (ticket 12): on iOS, launch the
diagnostic app natively with `simctl launch --console-pty` and launch
arguments, then create the Appium session with `autoLaunch: false` and no
relaunch. Show that the session observes and acts on that same app instance (the
console PID is unchanged, and the console still streams). Show what deleting the
session does to it. If this fails, the owner revisits ticket 12.

Automation timing is not app performance. Label these numbers as session cost.

## Completion criterion

The owner reacts to the numbers. The result is the evidence that Session
lifetime decides from. Link the measurements as an
asset.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Mode compatibility"
- Phase 1 budgets in the [freeze manifest](../../appium-mcp-migration/evidence/phase1-freeze-20261018.json) (`startupMs`, `wdaLaunchMs`)

## Comments

Charted on 2026-10-22.
