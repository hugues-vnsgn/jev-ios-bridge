# Phase 3 build plan

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 10, 11, 12, 13, 15, 16, 17

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
Resolved on 2026-10-23 by the root under the owner's grant ("move faster ...
decide to kick off"). Tickets 08, 09 and 19 were taken off this ticket's
blockers. Each now gates only the PR that needs it.

## Answer

The plan is `.scratch/appium-phase3/plan.md`, approved to build. It has ten PRs,
P3.1 to P3.10, stacked on the planning PR. Two GPT-6.1-Sol Codex workers run it.
Worker A owns the device lane: P08, P19, then P3.7 and P3.6. Worker B owns the
main chain. The PLAN-B bar stays, and the owner still merges every PR. Gates:
09 holds P3.3, 08 holds P3.5, and 19 holds the alias rows of P3.4. The
draft-release plugin spike moved to Phase 4.
