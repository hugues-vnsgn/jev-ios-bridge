# Fix: privacy and pause (Codex review P1 #2; P2 #6, #8)

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Review: `.worktrees/handoffs/jev-drives/codex-review-report.md` (findings 2, 6, 8)
Blocked by: none

## What to build

1. **#2 Checkpoints in driven runs.** In a script with any `do` step (only there; v1 and v2-without-`do` checkpoints stay byte-identical), the checkpoint's assertion state is masked the same way as Jev decisions (every typed value → `[value:<key>]`, reuse Issue 05's masking), and a checkpoint on a screen matching `localOnlyScreens` is not sent to Jev: it ends `INCONCLUSIVE` with a new reason code `LOCAL_ONLY_CHECKPOINT` (additive in `REASON_CODES`, `tests/golden/vocabulary.json`, `reason-codes.md`). Note in the docs that claims about a typed value can't be checked in driven runs because Jev sees `[value:key]`.
2. **#6 Pause package.** Mask typed values in every string of the package and its rendering: intent, doneWhen, goal, reason text, top picks, screen text, element list.
3. **#8 Late answers.** `resolve()` refuses an answer received at or after `expiresAt` (treat it as the timeout: `HANDBACK_TIMEOUT`), regardless of when the timer callback runs.

## Acceptance

Regression tests reproducing each probe (fake driver, judge, gate, and a fake clock for #8). `npm run check` passes; v1 goldens unchanged; only additive vocabulary change.
