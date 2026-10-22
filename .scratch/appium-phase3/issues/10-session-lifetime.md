# Session lifetime

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 06, 17

## Question

When does the bridge start and end its private MCP child and its Appium session
on each of these paths?

- an ordinary run
- a paused driven run waiting for `resolve_step`
- observed preparation, then a parked allocation, then the separate action
  executor
- Android capture and attach

What does the child do when the bridge disconnects or dies? And who owns
WebDriverAgent's process?

## Required investigation or discussion

Start from the session cost and idle-pause measurements and from the locked
allowed-effects list. Keep these constraints fixed:

- Ordinary scenarios keep their installed-app and already-booted
  preconditions.
- Capture and attach never launch, reset or stop the app.
- Observed paths stay key-free.
- Session cleanup never releases retained allocation capacity.

Settle how sessions map to admission attempts, owner generations and recorded
components.

Added from Device side effects of an Appium session (owner choices 5 and 7 of
the [report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/session-device-side-effects/.scratch/appium-phase3/research/session-device-side-effects.md)):

- **Disconnect policy.** appium-mcp defaults to `delete_all`: the child deletes
  sessions when the bridge disconnects, but leaves no receipt. The other option
  is `skip`, where only the bridge's fence cleans up, as in Phase 1.
- **WDA ownership.** Three options:
  - a driver-managed preinstalled runner, reinstalled every session
  - a bridge-managed WDA behind `webDriverAgentUrl`
  - `xcodebuild`, which leaves WDA running after delete
- **Idle timer.** `newCommandTimeout` looks inert under appium-mcp, because it
  never calls `executeCommand`. The idle measurement must confirm this.

## Completion criterion

The owner locks the lifetime rule for each path, the disconnect policy and WDA
ownership. Write them into the "Mode compatibility" and "Operation contract"
sections of the Phase 3 specification.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md)
- [Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md), command and component records
- [Published spec](../../appium-mcp-migration/spec.md), Decisions 5, 17, 23 and 24

## Comments

Charted on 2026-10-22 as "Session lifetime and allowed device effects".
Narrowed on 2026-10-22 after Device side effects of an Appium session: the
effects choices moved to Allowed device effects of a session.
