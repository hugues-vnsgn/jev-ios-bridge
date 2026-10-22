# Private pair ready for prototypes

Type: task
Status: open
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
