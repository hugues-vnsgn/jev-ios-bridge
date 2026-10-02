# Fix: live-check findings

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Evidence: `.worktrees/handoffs/jev-drives/live-checks.md` ("Bugs found"); transcripts and run folders under `~/Codes/eval-apps/live-checks/`
Blocked by: none

## What to build

1. **P2 Pause package numbers.** The package must show the numbers the bridge decided with: Jev's Choice `confidence` (the figure the floor is compared with) next to each top pick's probability, the floor that applied (0.80 / 0.90), and the "step done" probability. Label them so Claude can't read a per-option probability as the confidence. Update the rendering and the skills' explanation.
2. **P3 Credit in the report.** Search scrolls count in the report's actions as `decidedBy: "bridge"` (or list them separately with a clear label), and a step ended by Jev's done check is credited to Jev (`completedBy: "jev" | "claude"` per `do` step). Update `report-json.md`, the text report and the watch page.
3. **P3 Destructive steps doc.** `13-driven-steps.md` claims that after Claude's first action Jev only checks done; make the docs match what the code does (or, if simple, make the code ask only the done Noul there — pick one, say which).
4. **P3 Screenshot path.** The package's screenshot path must be the run's own evidence file (`screen-N.jpg` in the run folder), not a temp file.
5. **P3 Version.** Bump the package version to `1.3.0` (package.json, `src/version.ts`, plugin manifest via the build) — CHANGELOG stays "unreleased" until release.
6. **Search on unscrollable screens:** skip the target-search scroll when the screen has no scrollable element and a first scroll left the screen unchanged (saves ~1.3 s per hand-back).

## Acceptance

Tests for each item through the fakes; report goldens for driven runs updated only where these fields change (new driven goldens from Issue 10 may change; v1 goldens unchanged). `npm run check` and `npm run build:plugin` pass.
