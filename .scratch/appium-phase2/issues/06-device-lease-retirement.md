# Retiring DeviceLease as an ownership authority

Type: grilling
Status: resolved
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

## Answer

Owner decision, 2026-10-19 (grilling over two rounds, all recommendations accepted, summary confirmed):

- **Admission is the only owner record.** The `$TMPDIR` lock file stays only as a compatibility marker so older binaries see the device busy. It is written after admission authorizes and removed at release, and nothing reclaims it on process death. A leftover marker admission recorded is replaced once the device is free. An unknown marker refuses `DEVICE_BUSY`, even when its process is dead.
- **Every device command is committed before it is sent,** each tied to its component. That includes read-only adb queries and screenshots.
- **`ownedProcesses` become admission's component inventory.** The per-kind command ledger and `fence(kind)` become admission's commands and per-component stop evidence in fence receipts.
- **`DeviceLease` shrinks to in-process mechanics** (`track`/`settle`/`releaseLate`, the write queue) and is renamed, for example `OperationTracker`. "Device lease" now means only the authority's record.
- **A dead recorded owner is recovered at admission, the same way on iOS and Android.**
  - Liveness is checked by PID plus process start time.
  - Admission commits the recovery and a `native` quarantine, then sweeps exactly that generation's components.
  - The run proceeds only if the authority accepts the receipt. Otherwise it refuses `DEVICE_QUARANTINED`, and a later run may retry the sweep.
  - Android loses reclaim on process death alone. iOS gains this recovery.
- **adb gets stop evidence in Phase 2:** the host adb client has exited and no matching device-side process remains. The outcome stays uncertain. MobileBuildMCP commands get no stop evidence, as today.
- **Glossary:** **Fence** is generalized from the device agent to any native component.
- **No ADR.** ADR-0011 already covers one authority.

Spec change: added "Retiring DeviceLease as an ownership authority" (a responsibility table plus the rules) to [the Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md). The recovery wording now covers recovery at admission, a lease-retirement verification case is added, and the status line is updated.

Facts found: iOS (`src/device/index.ts`) takes admission and then the lock file with `reclaimDeadHolder: false`. Android (`src/device/android/driver.ts`) uses only the lock file, reclaims when the holder's PID is dead, and sweeps that holder's recorded streams and agent processes. An unknown adb outcome is never fenced today (`UI_ACTION_UNCONFIRMED`, lease kept).

Open limits:
- The exact device-side process match for an adb command (command-line form, what to do when several match) needs one live check during implementation. An ambiguous match is not proof.
- Markers left by old binaries, and their dead-PID case, are input to Legacy lease import.
- Appium stop evidence is Phase 3.
- The cost of one durable write per command was estimated, not measured. The 2C/2D briefs should measure it.

