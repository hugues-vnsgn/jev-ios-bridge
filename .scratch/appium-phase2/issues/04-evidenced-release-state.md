# Evidenced release with immutable outcomes

Type: prototype
Status: open
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: none

## Question

What authoritative records and transitions let a newly proven native fence release a device while an attempt's inconclusive outcome, historical quarantine, retained allocation capacity and old exclusions stay unchanged?

## Required investigation or discussion

Moved from the migration map's ticket 05. Prototype a logical state model (device lease, attempt outcome, command disposition, fence receipt, quarantine, capacity) as a rough artifact to react to. Stress late replies, lost COMMIT replies, prior-generation proof, abandoned owners and historical native uncertainty. Constraints: ADR-0008/0011, the three-condition release predicate, existing `devices`/`attempts`/`commands`/`transitions` tables. Do not migrate or clear real records.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.
