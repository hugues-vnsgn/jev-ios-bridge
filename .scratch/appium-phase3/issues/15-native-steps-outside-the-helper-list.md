# Native steps outside the helper list

Type: grilling
Status: resolved
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
(table G and finding 4) and the
[side-effect report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/session-device-side-effects/.scratch/appium-phase3/research/session-device-side-effects.md).
That report shows the driver attempts its own unlock where today's bridge
refuses a locked screen. For each step, choose
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
Resolved on 2026-10-23 by the owner in a grilling session with the root.

## Answer

The owner locked a home for each step:

| Step | Home |
| --- | --- |
| iOS boot (observed preparation) | native, bounded, owned `simctl boot` |
| iOS install (observed preparation) | native `simctl install` |
| iOS launch | native `simctl launch --console-pty` (ticket 12) |
| iOS availability and `Booted` polling | existing simctl probe |
| Android force-stop and `am start` | Appium `mobile: startActivity` with stop and wait, through the extension |
| Android wake | native adb `KEYCODE_WAKEUP` |
| Android launcher, foreground and keyguard probes | native, read-only |
| Locked screen | `skipUnlock` on every session; still `DEVICE_LOCKED` |

Ordinary runs keep their preconditions. Recorded in
[ADR-0014](../../../docs/adr/0014-native-launch-and-preparation-steps-beside-appium.md),
which amends ADR-0010's helper list, and under "Locked native steps" in the
Phase 3 specification.
