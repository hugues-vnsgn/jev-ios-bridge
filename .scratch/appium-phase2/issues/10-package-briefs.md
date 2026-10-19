# Phase 2 package briefs

Type: grilling
Status: claimed
Claimed by: Claude Code (owner session)
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: none

## Question

How is Phase 2 split into bounded implementer briefs for 2A through 2D, with token caps, stop rules, order and verification lists?

## Required investigation or discussion

Graduated from the map's fog; this is the map's destination. Use the [roadmap](../../appium-mcp-migration/roadmap.md) packages (2A configuration and preflight, 2B canonical identity and offline migration, 2C authoritative lifecycle, 2D exclusion and recovery tests) and the Phase 2 specification's sections. Decide: package boundaries against the decided sections (profiles, identity, store schema evolution, legacy lease import, release state, lease retirement), dependency order, a token cap and stop rule per brief (as in Phase 1), the race tests H01 to H03, H11, P3 and P4 owned by 2C/2D, the per-command write-cost measurement, and the one live check for adb device-side process matching.

Input from [Activation runbook for the real store](09-activation-runbook.md): package 2B also builds the read-only `admission-maintenance preflight`, makes `upgrade` and `import` repeat its checks, and writes the runbook text and the public guide update. It does not apply them to the real store.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.
