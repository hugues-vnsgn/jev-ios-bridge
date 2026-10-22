# iOS app output and crash detection without MobileBuildMCP

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 03

## Question

Once MobileBuildMCP's console helper is gone, which bounded, read-only native
helper supplies iOS app prints, platform output and `APP_EXITED` attribution?
And how does it start relative to an Appium launch, so that launch arguments,
app filtering, value masking, late-event attribution, unavailable-versus-empty
status and expected-shutdown suppression keep their meaning?

## Required investigation or discussion

Start from the vendor inventory's account of today's console helper, the log
pane, headless `logs` and step tails. Weigh these options:

- a native launch that also streams the console, alongside Appium-owned
  observation and input
- a `log stream` observer plus an Appium launch and an app-state watch
- another bounded helper

Keep the helper within ADR-0010's native-helper boundary: read-only, owned,
bounded, and never a UI fallback. Compare Android, which keeps logcat and
exit-watch.

## Completion criterion

The owner locks the helper and its lifecycle. Write them into the "Diagnostics
and allowed native helpers" section of the Phase 3 specification, along with
what remains a Phase 4 live claim.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Diagnostics and allowed native helpers"
- `src/device/index.ts:563` (console helper), `src/device/logs.ts`, `src/logpane`
- ADR-0010, [Published spec](../../appium-mcp-migration/spec.md), Decision 16, Testing Decision 12

## Comments

Charted on 2026-10-22.
