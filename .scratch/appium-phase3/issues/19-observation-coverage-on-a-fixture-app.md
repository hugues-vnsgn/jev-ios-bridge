# Observation coverage on a fixture app

Type: prototype
Status: resolved
Claimed by: root (Claude); evidence by Codex worker A (brief ~/.codex/reports/jev-ios-bridge/phase3-build/P19-fixture-coverage-brief.md)
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 05

## Question

Does the locked observation mapping hold for the features that the frozen
diagnostic app cannot show? And do two same-label, same-frame, no-identifier
elements dispatch to the same physical target under Appium?

## Required investigation or discussion

Build a separate throwaway fixture app for each platform. Never touch or
rebuild the frozen diagnostic app. Each app needs one screen per feature:

- a password field
- an empty field with a hint
- a scrollable list longer than the screen
- a large tree near the depth limit
- two independent controls with the same label
- a same-frame wrapper and control with the same label and no identifier
- a continuously changing value

On the private pair, capture Appium XML through the pinned settings, run it
through the normalizer, and compare it with what today's driver gives, where it
can run without the real admission store. For the alias, tap each duplicate
reference and show that both reach the same control: the app records which
control received the tap. Show a node at depth 70 triggering the completeness
refusal.

Added from Text replacement (07): Android `mobile: replaceElementValue` on the
pre-filled and secure fields, with the native-input count and the fresh shown
value. P07 stopped at its retry limit before proving these.

## Completion criterion

The owner confirms, or changes, the mapping rows for each feature and the tap-alias
rule in "Locked observation choices" of the Phase 3 specification. A failed
unique-target proof reopens the alias choice.

## Context

- [Observation mapping](05-observation-mapping.md) and its prototype branch
- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Observation contract"

## Comments

Graduated on 2026-10-23 from Observation mapping: owner choice "P05b with a fixture app".
Resolved on 2026-10-23 by the root under the owner's grant to decide.

## Answer

Prototype `prototype/observation-mapping` at `ed4a17729`. Evidence is in
`~/.codex/reports/jev-ios-bridge/phase3-build/P19-evidence/`.

- Android mapping matches on 51 of 51 rows.
- The iOS alias passed its unique-target proof.
- Android `replaceElementValue` passed on both the pre-filled and the secure
  field.
- The depth refusals passed.

Two new rules came from the run. A page-source timeout ends the session, and
the settle cap is a return deadline. The text is in "Locked from fixture
coverage" in the Phase 3 specification.
