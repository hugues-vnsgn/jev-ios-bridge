# Evidenced release with immutable outcomes

Type: prototype
Status: resolved
Claimed by: Claude Code (owner session)
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

## Answer

Owner decision, 2026-10-19 (prototype, all four recommendations accepted):

1. **A proven fence frees a device even after an inconclusive run.** The outcome stays inconclusive forever and the allocation capacity stays quarantined. Release touches only the device lease.
2. **Quarantine is an append-only record covered by fence receipts.** A receipt covers a quarantine and never edits or deletes it. Availability is derived: no owner and no uncovered quarantine. The prototype calls these records "holds"; the spec and glossary say **quarantine** because Device lease is already defined as a hold.
3. **Nothing in Phase 2 lifts quarantines that no generation-bound proof can cover.** That covers imported history, declared exclusions and unknown creation without a session ID. A receipt kind is reserved for them and refused; Phase 5 or a separate owner-approved maintenance step defines it. A fresh "nothing is running now" probe never counts.
4. **Late replies are kept as evidence only.** They are appended as observations and change no disposition or outcome.

The authority checks each receipt itself against its own records for one owner generation, using the three release conditions; caller booleans are never accepted. The prototype also fixes the following behavior. Owner process death changes nothing. Explicit recovery turns the lease into a `native` quarantine for that generation. A receipt from another generation refuses `STALE_OWNER`. An identical retry after a lost COMMIT reply returns the committed record with no device effect. A new mutation for an unsettled command refuses.

Prototype: [release-state.prototype.html](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/prototype/release-state/.scratch/appium-phase2/prototypes/release-state.prototype.html) on the throwaway branch `prototype/release-state` at `45af0e76b` (never merged). Seven walkthroughs: happy path, late reply, lost COMMIT reply, abandoned owner, earlier-generation receipt, unknown creation and imported history.

Spec change: added "Release state contract" to [the Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md), replaced the open-decision paragraph, and added the prototype cases to Verification. Glossary: added **Fence receipt** and **Quarantine**.

Added after the owner decision, as a consequence rather than a new choice: each command records the component it was sent through, and fencing an uncertain command requires stop evidence for that component.

Open limits: what counts as stop evidence for each component type (Appium session, XCUITest/WDA runner, UiAutomator2 server, MCP process) is Phase 3 adapter work; Phase 2 fixes only the receipt shape and its checks. Tables, columns, and how v1.4.0 `devices.state='quarantined'` rows become `historical` quarantines belong to Store schema evolution. What happens to `lease.ts`'s in-process fence and ledger belongs to Retiring DeviceLease as an ownership authority.

