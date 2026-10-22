# Session lifetime and allowed device effects

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 02, 06

## Question

When does the bridge start and end its private MCP child and its Appium session
in each of these paths?

- an ordinary run
- a paused driven run waiting for `resolve_step`
- observed preparation, then a parked allocation, then the separate action executor
- Android capture and attach

And which device-side effects of session creation are acceptable on each path?

## Required investigation or discussion

Start from the session cost and idle-pause measurements and the side-effect
table. Keep these fixed constraints:

- Ordinary scenarios keep their installed-app and already-booted preconditions.
- Capture and attach never launch, reset or stop the app.
- Observed paths stay key-free.
- Session cleanup never releases retained allocation capacity.

Settle how sessions map to admission attempts, owner generations and recorded
components.

## Completion criterion

The owner locks the lifetime rule for each path and the allowed-effects list.
Write them into the "Mode compatibility" and "Operation contract" sections of
the Phase 3 specification.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md)
- [Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md), command and component records
- [Published spec](../../appium-mcp-migration/spec.md), Decisions 5, 17, 23 and 24

## Comments

Charted on 2026-10-22.
