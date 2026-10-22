# Native steps outside the helper list

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 02

## Question

Which device steps that are neither UI observation nor UI input does the
bridge keep running as native commands, and which move to Appium?

- iOS: simulator boot and app install in observed preparation, which
  MobileBuildMCP does today.
- Android: force-stop, `am start`, wake, launcher lookup, and the foreground
  and keyguard probes, which plain adb does today.

ADR-0010 and the Phase 3 specification's helper list name only logs and
health, owned fencing, presentation and bounded simulator creation.

## Required investigation or discussion

Start from the [vendor inventory](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/old-vendor-inventory/.scratch/appium-phase3/research/old-vendor-inventory.md)
(table G and finding 4) and the side-effect table. For each step, choose
between three homes:

- an Appium capability or extension operation
- an explicit bounded native helper, which needs a spec or ADR change
- a refusal

Keep in mind:

- ordinary preconditions (installed app, already-booted device) stay intact
- observed allocation keeps its authorized boot and install
- ADR-0009 bounds creation
- ADR-0010 says no helper may read the UI or inject input

## Completion criterion

The owner locks the home for each step. Write the decision into the "Diagnostics
and allowed native helpers" section of the Phase 3 specification. If the helper
boundary itself widens, record the ADR-0010 amendment.

## Context

- [Vendor inventory](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/old-vendor-inventory/.scratch/appium-phase3/research/old-vendor-inventory.md), sections 1G and 5
- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Diagnostics and allowed native helpers"
- ADR-0009, ADR-0010, [published spec](../../appium-mcp-migration/spec.md) Decisions 9, 24 and 25

## Comments

Graduated on 2026-10-22 from What the old vendors give us today (finding 4 and the observed-preparation fog).
