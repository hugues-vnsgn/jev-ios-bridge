# Named-profile selection contract

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: none

## Question

What are the exact profile inputs, where do profiles live, what does a profile contain, and how does selection compose with the legacy device order and conflicts?

## Required investigation or discussion

Owner input 2026-10-14 (moved from the migration map's ticket 04): explicit optional selector plus project default; current scripts and device options stay valid; device/app/platform conflicts refuse before effects; a resumed run keeps its binding. Settle: `--profile`/MCP `profile` spelling; `profiles`/`defaultProfile` in the existing `.jev/config.json` (strict zod, `src/driven/project.ts`) versus a new file; profile fields (platform, device category, device, app, capability whitelist, budgets, prerequisites, reserved signing refs); the legacy order (iOS scenario UUID, `JEV_DEVICE_UDID`, `.mobilebuildmcp/config.yaml` `simulatorId`; Android serial, AVD, `JEV_ANDROID_DEVICE`; capture flags) and how the vendor-file reader survives Phase 3.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.
