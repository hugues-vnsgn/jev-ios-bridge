# Settling and screen change under Appium

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 05, 06

## Question

Should the bridge's Android settle loop (250 ms gap, 3 s cap, two matching
hashes) run on both platforms under Appium, with a hash the bridge computes
over the normalized snapshot? Do its constants still hold at Appium's
page-source latency? And does iOS gain the "screen still changing" mark it has
never shown?

## Required investigation or discussion

Start from the [vendor inventory](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/old-vendor-inventory/.scratch/appium-phase3/research/old-vendor-inventory.md)
(section 4) and the capture latencies and idle settings that Observation
mapping and Session startup cost and lifetime measure. What we know:

- iOS today has no loop and no mark. MobileBuildMCP settles inside each action.
- Android's agent adds its own 2 s idle wait.
- `SCREEN_CHANGED` and driven search use the vendor `screenHash` on iOS.

Settle these:

- The hash rule (which nodes it excludes).
- Whether the screenshot is taken after settling or alongside it.
- Whether to drop capture reuse and the screenshot-agreement measurement.
- Whether `settled:false` on iOS counts as an additive contract change under
  ADR-0005.

## Completion criterion

The owner locks the loop, the constants, the hash and the iOS mark. Write them
into the "Observation contract" and "Operation contract" (Observe/settle row)
sections of the Phase 3 specification.

## Context

- `src/device/android/settle.ts`, `src/device/android/driver.ts` (`settledSnapshot`, `DUMP_IDLE_MS`), `report.ts` still-changing prose
- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Observation contract"
- `docs/guide/11-stability.md`

## Comments

Graduated on 2026-10-22 from the map's "Settling under Appium" fog, after What the old vendors give us today.
