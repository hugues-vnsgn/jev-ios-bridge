# Fence evidence for Appium components

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 10

## Question

What stop evidence must the admission authority record for each Appium-era
native component before a fence receipt can release the device lease? The
components are the private MCP child and its descendants, the driver
processes, WDA, `xcodebuild` and XCTest on the simulator, the UiAutomator2
server and instrumentation, and adb forwards. And how do Phase 1's research
mechanisms become production TypeScript under Phase 2's command and component
records? Those mechanisms are process-group stop, descendant verification and
the on-device fence.

## Required investigation or discussion

Start from Phase 1's reviewed mechanisms: `stop-group.py`, `fence-owned.py`,
`verify-native-descendants.py`, and the device-root coverage review. Also read
Phase 2's stop evidence rules ("Appium session and driver evidence is Phase 3
adapter work"). Settle these:

- Component identity capture before stop.
- Deadlines.
- What counts as a native stop receipt versus a vendor cleanup reply.
- Refusal when evidence is incomplete.
- How Phase 2's recovery sweep handles Appium components left by a dead owner.

## Completion criterion

The owner locks the evidence rule per component and the recovery behavior.
Write them into the Phase 3 specification (a new fencing section, or the
"Operation contract" Close row), and check them against ADR-0011.

## Context

- [Phase 1 feasibility](../../appium-mcp-migration/phases/phase-1-feasibility.md), [device-root review](../../appium-mcp-migration/evidence/phase1-device-root-review-20261018.md)
- [Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md), "Stop evidence in Phase 2"
- ADR-0011

## Comments

Charted on 2026-10-22.
