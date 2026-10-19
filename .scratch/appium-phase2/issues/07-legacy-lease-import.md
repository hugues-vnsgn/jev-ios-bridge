# Legacy lease import

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: 06

## Question

How are legacy Android lease files, and any newly declared iOS history, imported into a schema 3 store as quarantines and records, and what does that maintenance step's receipt record?

## Required investigation or discussion

Graduated from the map's fog by [Store schema evolution](05-store-schema-evolution.md), which kept this import out of the 2 to 3 upgrade. The v1 migration classified well-formed non-UUID leases as "outside iOS" (`ignoredNonIosLeases`) without importing them; the legacy format carries no platform tag. Decide which lease and journal roots are scanned and declared, how an AVD-name or serial lease maps to a (category, value) identity when the emulator or phone may be absent (see [Canonical device identity](03-canonical-device-identity.md)), what uncertainty each becomes (`historical` quarantine kinds and causes), source hashing and unchanged sources, idempotent rerun, and interaction with what [Retiring DeviceLease as an ownership authority](06-device-lease-retirement.md) decides about lease files after retirement. An old PID's death never settles native work.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.
