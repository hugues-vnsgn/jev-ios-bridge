# Private pair ready for prototypes

Type: task
Status: resolved
Claimed by: root (Claude) via the Codex worker, brief ~/.codex/reports/jev-ios-bridge/phase3-build/T04-private-pair-brief.md
Labels: wayfinder:task
Mode: AFK
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: none

## Question

Is the Phase 1 private pair, with its candidate stack, still usable for the
prototype tickets, and what are its current facts?

## Required investigation or discussion

The owner authorized this on 2026-10-22, within the map's device rules: one
case at a time, no Jev calls, no writes to the real admission store, and no
other simulator, AVD or phone. Leave shared CoreSimulator and adb services
running.

- Confirm the private simulator set and private AVD home under the
  `feat/appium-mcp-migration` worktree's
  `.scratch/appium-mcp-migration/runtime/` still hold the frozen devices named
  in the [freeze manifest](../../appium-mcp-migration/evidence/phase1-freeze-20261018.json)
  and the [master handoff](../../appium-mcp-migration/handoff.md).
- Check that the candidate stack install matches its lockfile and the
  manifest's hashes (WDA tree, UiAutomator2 server APKs, diagnostic apps,
  emulator binary).
- Pass the Phase 1 preflight: host load below 8, and a private `simctl list`
  within 15 s.
- Boot each device, run one Phase 1 normal smoke on it, and shut it down
  cleanly.

## Completion criterion

Record the paths, the simulator UDID, the AVD name, the timings and any drift
from the manifest, so the prototypes start without rediscovery. A drift that
needs a rebuild or a new device is a blocker to report, not something to fix
silently.

## Context

- [Phase 1 result](../../appium-mcp-migration/phase-1-result-20261018.md)
- [Phase 1 live protocol](../../appium-mcp-migration/phase-1-live.md)

## Comments

Charted on 2026-10-22.

## Answer

Task resolution, 2026-10-22, done by the Codex worker under the root's brief:
the private pair is ready, with no drift.

- **Devices.**
  - iOS simulator `15013501-2535-42EB-A67F-45B015DF18F4` (`jev-appium-phase1-20261018`)
    in the private set `.worktrees/feat/appium-mcp-migration/.scratch/appium-mcp-migration/runtime/devices/simulators`.
  - AVD `jev_appium_phase1_20261018` (serial `emulator-5570`) in the private AVD
    home `runtime/devices/avd`, run by the pinned emulator `runtime/emulator-37.2.12`.
- **Frozen inputs unchanged.**
  - All eight artifact and lock hashes match: WDA tree, diagnostic apps,
    UiAutomator2 APKs, emulator binary and candidate lockfile.
  - The ten selected packages and 23 runner-source hashes also match.
- **One Phase 1 normal case per platform, 14 of 14 checks each.**
  - iOS: session ready 43.1 s after case start, 67.1 s in total.
  - Android: emulator boot 24.1 s, session ready 54.1 s, 75.7 s in total.
  - Both devices were independently verified shut down with their owned ports
    closed.
- **Load guard.** Host load spiked to 71.6 after the iOS shutdown. The load
  guard refused the Android run before any device work, and it ran later at
  7.7. Prototypes should keep the "load below 8" guard.
- **Not touched.** No Jev call, no real admission store, no other device, no
  shared-service restart, no source change and no rebuild. Tracked files in
  both worktrees are unchanged.

Evidence: `~/.codex/reports/jev-ios-bridge/phase3-build/T04-evidence/` (case
receipts, timing controllers, preflight, shutdown receipts, before/after
status) and `T04-report.md`. The Phase 1 runner docs `phase-1-live.md` and
`experiments/README.md` are deleted in that worktree's checkout. Read them from
Git HEAD.

