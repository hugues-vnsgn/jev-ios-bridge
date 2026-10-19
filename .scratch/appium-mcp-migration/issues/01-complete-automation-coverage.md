# Complete owned-automation coverage

Type: research
Status: resolved
Claimed by: /root/coverage_research
Labels: wayfinder:research
Mode: AFK
Parent: [Appium migration handoff map](../map.md)
Blocked by: none

## Question

Which bounded ownership/ancestry mechanism can account for children, escaped grandchildren, reparented processes, and device-native automation in the frozen stack, while preserving shared ADB/CoreSimulator services?

## Required investigation or discussion

Read the current receipts, verifier draft and primary OS/Appium lifecycle sources. Separate observable proof from assumptions and document unsupported cases. Produce a recommended evidence contract and host-test scenarios; do not run native experiments or claim GO.

## Completion criterion

Record a sourced answer or actual owner decision, unresolved limits, and the changes required in the linked phase specification. Keep planning resolution separate from implementation and native acceptance.

## Context

- [Current roadmap](../roadmap.md)
- [Published acceptance spec](../spec.md)
- [Phase specification](../phases/phase-1-feasibility.md)

## Comments

Charted on 2026-10-14. Implementation remains paused.

## Answer

Research resolution, 2026-10-14: Direct-child records and final scans cannot establish historical completeness after unobserved fork/escape/reparenting. Require incarnation-bound ancestry/coverage evidence plus native fencing and a bounded final inventory; unavailable identity is unknown. Method choice and native qualification remain open in Complete-coverage mechanism.

[Sourced report](../research/component-coverage.md). Research branch commit: `2b5fb052dcacc36cefff784142af1855a02464c3`.
No device experiment, test suite, Jev query, migration or native GO was performed.
