# Named-profile selection contract

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium migration handoff map](../map.md)
Blocked by: none

## Question

Should named profiles be selected explicitly through additive CLI/MCP inputs as well as a project default, and what conflicts must fail before device work?

## Required investigation or discussion

Recommended proposal: explicit optional selector plus project default; existing inputs stay valid; device/app/platform disagreement refuses before effects; a resumed run retains its original profile binding. The owner was asked this question asynchronously. Record actual owner answers before resolution; never treat the recommendation as an answer.

## Completion criterion

Record a sourced answer or actual owner decision, unresolved limits, and the changes required in the linked phase specification. Keep planning resolution separate from implementation and native acceptance.

## Context

- [Current roadmap](../roadmap.md)
- [Published acceptance spec](../spec.md)
- [Phase specification](../phases/phase-2-ownership.md)

## Comments

Charted on 2026-10-14. Implementation remains paused.

Owner answer, 2026-10-14: "Explicit selector plus project default (Recommended)". Preserve current scripts and device options; reject conflicting device/app/platform input before effects. This input is recorded for the later decision-resolution session; charting has not closed the ticket.
