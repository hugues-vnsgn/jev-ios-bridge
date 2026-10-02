# Fix: driven safety (Codex review P1 #1, #3, #4; P2 #9)

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Review: `.worktrees/handoffs/jev-drives/codex-review-report.md` (read findings 1, 3, 4, 9 in full)
Blocked by: none

## What to build

1. **#1 Search without preflight.** On a `test_write` step whose writes aren't allowed (no passing preflight), Jev's actions go to Claude — including target-search scrolls. Don't run `search()` there; hand back `NO_PREFLIGHT`.
2. **#3 Permission dialogs.** Jev must never act on a system permission dialog (C17). Detect one in code before asking Jev: Android elements whose identifier starts with `com.android.permissioncontroller:` or `com.google.android.permissioncontroller:`; iOS system alerts whose buttons include "Allow", "Don't Allow", "Allow Once", "Allow While Using App", "Allow Full Access", "Allow Paste", "Don't Allow Paste", "Limit Access…", "Ask App Not to Track" (case-insensitive, whole label). Hand back with a new pause reason `PERMISSION_DIALOG` (vocabulary text + docs row in `13-driven-steps.md`). Use the spike captures `nnw-02` (iOS notification + paste prompts) and `nia-03` (Android notification prompt) as fixtures.
3. **#4 Back through a risky control.** The fixed `back` candidate must be checked against the control the driver would actually tap: resolve the iOS back button the same way the driver does (share the helper from `src/device/index.ts`), and if it has a risky word, refuse `back` (hand back `RISKY_ACTION`). Android's Back key has no label; leave it.
4. **#9 Loops during search.** Search observations update the screen history and check the A→B→A→B rule like any other observation; a loop hands back `SCREEN_LOOP`.

## Acceptance

A regression test per finding through the fakes (`fakeDrivenJudge`, fake driver), reproducing the review's probe and showing the fix. `npm run check` passes; v1 goldens unchanged.
