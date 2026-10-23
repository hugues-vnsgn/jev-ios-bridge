# Phase 3 build plan

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 09, 10, 11, 12, 13, 15, 16, 17, 19

## Question

How is Phase 3 split into PRs, in what order, with which worker briefs, caps
and verification bar, so the build runs without another decision?

## Required investigation or discussion

Cover:

- Work packages 3A–3E from the [roadmap](../../appium-mcp-migration/roadmap.md),
  re-cut by file ownership the way the Phase 2 plan was.
- The "Phase 2 leftovers" PR and the early flake fixes from the map's carry list.
- The fake MCP provider and its recorded wire.
- The last PR, which switches composition to Appium.

Apply the PLAN-B bar, caps from actual Phase 2 spend, the Codex worker on
GPT-6.1-Sol, and owner merges. Include the Phase 2 lessons: the durable store
makes unit tests slow, and speed gates against a zero-latency fake mean
nothing.

## Completion criterion

A build plan at `.scratch/appium-phase3/plan.md` that the owner approves, with
one brief per PR and an exit checklist matching the Phase 3 specification's
"Verification and exit". The map then closes.

## Context

- [Phase 2 build plan](../../appium-phase2/plan.md) and [exit note](../../appium-phase2/phase-2-exit.md)
- `~/.codex/reports/jev-ios-bridge/phase2-build/PLAN-B.md`

## Comments

Charted on 2026-10-22.
