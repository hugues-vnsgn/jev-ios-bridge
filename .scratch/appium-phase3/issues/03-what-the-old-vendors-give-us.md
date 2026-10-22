# What the old vendors give us today

Type: research
Status: open
Labels: wayfinder:research
Mode: AFK
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: none

## Question

Which behaviors of today's drivers come from MobileBuildMCP, mobilecli or AXe
rather than from bridge code? Phase 3 must replace each one, drop it, or
refuse it explicitly. And which public report, reply or golden fields carry a
vendor-specific meaning?

## Required investigation or discussion

Read `src/device/index.ts`, `src/device/android/*`, `src/capture.ts`,
`src/observed/*`, `src/contracts/index.ts`, `src/logpane`, `src/watch` and the
contract goldens under `tests/`. Cover at least:

- The iOS console helper behind app output and `APP_EXITED`
  (`src/device/index.ts:563`), Android logcat and exit watching.
- Simulator presentation and the AXe point tap (ADR-0007).
- The tap-alias rule `mobilebuildmcp-2.7.1` and reference expiry metrics
  (`referenceExpiries`, `nearTtlRefreshes`, `src/contracts/index.ts:136-189`).
- Role vocabulary and element fields per platform, who issues element
  references, observation limits and overflow, the screenshot source.
- The settle loop and its limits, launch/restart/attach, and observed
  allocation's boot, install and readiness steps.
- Stop evidence per component.

For each item, give the current source with file:line, what the pinned Appium
stack offers (from the public compatibility research), and whether a public
contract field depends on it.

Reading only: no device run, no test run needed.

## Completion criterion

An inventory table, plus a list of public fields with vendor meaning. It feeds
Observation mapping, Tap, gestures and coordinates, iOS app output and crash
detection without MobileBuildMCP, and Vendor report fields and stack
provenance, and should clear the map's settling and observed-preparation fog.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md)
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md)
- ADR-0007, ADR-0009, ADR-0010

## Comments

Charted on 2026-10-22.
