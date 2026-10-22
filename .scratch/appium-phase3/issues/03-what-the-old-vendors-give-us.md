# What the old vendors give us today

Type: research
Status: resolved
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

## Answer

Research resolution, 2026-10-22: most of the driver is bridge code or plain
adb/simctl, and the vendors supply a narrow set of pieces.

- **MobileBuildMCP 2.7.1 supplies the iOS side:**
  - the whole iOS snapshot: 15 roles, a per-element action list, point frames,
    `visible`/`enabled` state and the vendor `screenHash`
  - element references (`eN`, positional, 60 s lifetime)
  - the semantic tap, `type-text` (US keyboard, no leading hyphen), and the
    swipe and touch gesture presets
  - a settle poll of up to 2.5 s inside every action, and the ≤800 px JPEG
    screenshot
  - one `launch-app` call that terminates and relaunches the app and starts the
    console and OSLog helpers. The PID of that console helper is the only
    `APP_EXITED` signal.
  - observed preparation's simulator list, boot, install and launch, and the
    readiness capture.
- **mobilecli 1.0.14 supplies only the Android agent:** the tree dump with a
  2 s idle wait, input, the screenshot, and the DEX SHA-256. Android prepare,
  restart, wake, logcat, exit watching, the settle loop and all stop evidence
  are adb or bridge code.
- **AXe is never called by the bridge.** The ADR-0007 point tap was never
  built, and iOS `tapAt` is a refusal today.

Seventeen public surfaces carry vendor meaning. The widest are `error.vendorCode`
and the 15-role list. Others include `prepared.logSources`/`agentSha256`, the
step fields `logTails`/`settled`/`snapshotSequence`, `SCREEN_CHANGED` (screen
hash), the screenshot and `tapAt` pixel space, and observed
`actionAcknowledged`. Two more findings:

- Android's check for other automation tools matches `io.appium.uiautomator2`,
  so it would refuse the bridge's own Appium session.
- `truncated` has no live producer today, so Phase 3 has to invent one.

[Sourced report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/old-vendor-inventory/.scratch/appium-phase3/research/old-vendor-inventory.md),
branch `research/old-vendor-inventory` at `6134b7f4e`. No device run, Jev call
or test run.

Map changes from this answer:

- Two new tickets: Native steps outside the helper list, and Settling and
  screen change under Appium.
- Wider scope for four existing tickets:
  - Observation mapping: capture latency, idle settings, a `truncated` producer.
  - Text replacement and shown value: iOS value validation at cutover.
  - Tap, gestures and coordinates: screenshot size and format.
  - Fence evidence for Appium components: detecting other automation tools
    under Appium.
- Wider scope for Vendor report fields and stack provenance: what `vendorCode`
  and `agentSha256` mean.
- Fog cleared: Settling and Observed preparation.
