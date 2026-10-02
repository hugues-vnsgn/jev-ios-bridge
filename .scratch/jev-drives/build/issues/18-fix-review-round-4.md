# Fix: Codex review round 4 (two P2, one P3)

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Review: `.worktrees/handoffs/jev-drives/codex-review-round4.md` (findings 1–3, each with its probe)
Blocked by: none

## What to build

1. **P2 Rounding in the pause text** (`src/driven/handback.ts` `renderPause`): never print a number that looks like it met a threshold it missed. Print the numbers with enough precision (e.g. 3 decimals) **and** say explicitly "below the 0.80 floor" / "at or above" (same for the done probability against 0.90), computed from the raw values.
2. **P2 Decision-budget hand-back** (`src/driven/step.ts`): when the step returns `DECISION_BUDGET` (or any hand-back) after a decision on the current screen, keep that latest decision in the package (`jevDecision`, top picks, floor) instead of reporting Jev as not asked.
3. **P3 Report completeness** (`src/scripted/report-json.ts`, `report.ts`): a `do` step that started but whose first observation failed is listed in `driven.doSteps` with `completedBy: null`.

## Acceptance

A regression test per finding reproducing the review's probe. `npm run check` passes; v1 goldens unchanged (driven goldens only if these fields change).
