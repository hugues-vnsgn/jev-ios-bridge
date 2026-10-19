# Retiring DeviceLease as an ownership authority

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: 04

## Question

Where does each `DeviceLease` responsibility move once Admission is the only ownership authority?

## Required investigation or discussion

`src/device/lease.ts` today: a `$TMPDIR` lock file per device, dead-holder reclaim (Android reclaims and sweeps `ownedProcesses`; iOS never reclaims), persisted owned processes, and an in-memory per-kind command ledger (`mobilebuildmcp`/`adb`/`agent`, fence, settled). Decide each one's new home, whether any in-process fence remains, and what replaces Android's automatic reclaim given 'an old PID's death never settles native work'.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.
