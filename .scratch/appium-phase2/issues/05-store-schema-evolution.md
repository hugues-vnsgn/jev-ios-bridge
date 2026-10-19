# Store schema evolution

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: 03, 04

## Question

How does the per-user admission store evolve across schema versions without losing history or allowing a second authority?

## Required investigation or discussion

Today `admission-sqlite.ts` requires `schema_version === 2` exactly and has no upgrade path. Decide: forward-only versioned upgrades, offline-only with an exclusive writer window, receipts per upgrade, behaviour of older binaries against a newer store, interrupted-upgrade recovery, backup, and how new device categories and record types land without rewrites.

Input from [Canonical device identity](03-canonical-device-identity.md): identity is the pair (category, value), unique as a pair. The existing `devices.platform` column becomes the category (widened from `ios-simulator` only); existing iOS values and checksummed allocation records are not rewritten. Today `devices.device` is the sole primary key and `attempts`/`imported_actions` reference it, so decide how references carry the category. Emulator provenance attributes (AVD name, AVD id, device and inode, emulator version) belong on the device; serial, pid and start time belong on the attempt.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.
