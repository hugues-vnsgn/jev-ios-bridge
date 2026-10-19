# Retiring DeviceLease as an ownership authority

Type: grilling
Status: claimed
Claimed by: Claude Code (owner session)
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: 04

## Question

Where does each `DeviceLease` responsibility move once Admission is the only ownership authority?

## Required investigation or discussion

`src/device/lease.ts` today: a `$TMPDIR` lock file per device, dead-holder reclaim (Android reclaims and sweeps `ownedProcesses`; iOS never reclaims), persisted owned processes, and an in-memory per-kind command ledger (`mobilebuildmcp`/`adb`/`agent`, fence, settled). Decide each one's new home, whether any in-process fence remains, and what replaces Android's automatic reclaim given 'an old PID's death never settles native work'.

Input from [Evidenced release with immutable outcomes](04-evidenced-release-state.md): the authority's commands (each tied to a component), component inventory and fence receipts are the release record; process death settles nothing; explicit recovery turns an abandoned lease into a `native` quarantine that only a receipt for that generation covers. Decide what is left for `lease.ts`'s per-kind command ledger and in-process fence, and how Android's automatic reclaim maps onto explicit recovery.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.
