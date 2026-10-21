# Named-profile selection contract

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
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

## Answer

Owner decision, 2026-10-19 (grilling, all recommendations accepted): profiles live in a new versioned `.jev/profiles.json` (read only when present; `.jev/config.json` untouched so version 1 runs cannot break). Inputs: `--profile` on `run`/`capture`, optional MCP `profile` beside `scenario`; no env var; observed actions and preparation ignore profiles (hook reserved). Slug names; `PROFILE_NOT_FOUND`/`INVALID_PROFILE_FILE` refuse before effects. Profile v1 = platform, deviceCategory, device, optional app guard, optional bounded budgets; later-phase fields reserved and refused; unknown keys refuse. Precedence: explicit, default, then the unchanged legacy order; profiles shadow env and vendor-file defaults; only scenario-stated device/app/platform can conflict (`PROFILE_CONFLICT`, aliases agree). Budgets: profile is default and ceiling, `limits` only tighten. Binding (name + digest) recorded on the run and attempt intent. The `.mobilebuildmcp` `simulatorId` reader survives Phase 3 with a run-log note.

Spec change: rewrote "Profile selection behavior" in [the Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md). Glossary: added **Profile**. Open limit: device identity for `device` follows Canonical device identity.
