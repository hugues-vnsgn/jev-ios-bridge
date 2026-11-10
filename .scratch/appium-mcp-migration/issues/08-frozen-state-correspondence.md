# Frozen-state correspondence

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium migration handoff map](../map.md)
Blocked by: 03

## Question

What owner-reviewed setup and correspondence protocol can reproduce every frozen screen/claim when historical build provenance or dynamic app state is missing, while preserving labels and denominators?

## Required discussion

Review the corpus recovery report, original failing/corrective records and cases with unknown build/storage/performance state. Record the exact setup/correspondence the owner accepts or retain a release blocker. Do not infer agreement, replace historical truth, or begin Jev queries.

## Completion criterion

Record the actual owner decision, enforceable constraints, unresolved limits and required phase-spec changes. Keep a source recommendation separate from an accepted method or live result.

## Context

- [Research evidence](../research/corpus-provenance.md)
- [Master handoff](../handoff.md)

## Comments

Charted from research on 2026-10-14. Implementation remains paused.

2026-11-11, decisions recorded. On 2026-11-10 the owner delegated all 38 correspondence calls to the coordinator, with reasons kept for the owner's audit. The result is 35 approve, 3 recapture and 0 block. The blanket calls G1 to G4 all approve, and G4 sends settings-1-main, settings-3-search and cmp-2-home to `Medium_Phone_API_36.1`. The phase specification records each call and its stop rules ([correspondence decisions](../phases/phase-4-acceptance.md#correspondence-decisions-ticket-08-2026-11-10)). This ticket stays open. The recaptures wait on an owner assignment for that AVD, and any recapture that hits its stop rule becomes a release blocker. The judging pass and its results are pending.
