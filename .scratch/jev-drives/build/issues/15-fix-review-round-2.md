# Fix: Codex review round 2 (three P2s)

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Review: `.worktrees/handoffs/jev-drives/codex-review-round2.md` (findings 1–3, each with its probe)
Blocked by: none

## What to build

1. **Marker-prefixed values** (`src/driven/decide.ts` `maskValues`): a typed value that starts with or contains an existing `[value:<key>]` marker (e.g. `password = "[value:user]password123"`) must still be fully masked. Match complete typed values, longest first, before skipping existing markers; masking twice must still change nothing.
2. **Preflight logging vs cleanup** (`src/driven/project.ts` `settle`, cleanup in `src/scripted/run.ts`): a failure to append the `preflight` event must not block `driver.close()`. `settle()` reports only whether processes survived; a log failure is handled like the run's other log-write failures (the run still closes the device and releases the lease once nothing survives).
3. **Step id in the pause package** (`src/driven/handback.ts`): mask typed values in `stepId` too, everywhere in the package and `renderPause` (and check no other package string is left unmasked).

## Acceptance

A regression test per finding reproducing the review's probe. `npm run check` passes; no golden changes.
