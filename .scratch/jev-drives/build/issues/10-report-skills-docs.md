# Report, watch page, skills, docs

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: 08, 09

## What to build

- **Report:** `report.json` and the text report gain, for runs with `do` steps only: per-action `decidedBy`, a hand-backs list (reason, step, answer kind, wait time), Jev decision count and tokens, the start mode, the preflight result. v1 report output byte-identical; bump nothing for v1. Document fields in `docs/guide/reference/report-json.md`.
- **Watch page:** show decisions (choice, confidence, done Noul) and hand-backs; title says iOS or Android correctly.
- **Skills** (`skills/test-ios`, `skills/test-android`): when driven mode is enabled, write a version 2 script with `do` steps (intent, visible doneWhen, effect, values incl. `fromEnv` for credentials), keep checkpoints for the expected result from the developer (C27), poll `get_report`, answer `needs_claude` with `resolve_step` (one action, or revise, or stop), never invent expected results, report who decided what. Mention the data change (screen text to TypeSafe at every decision).
- **Docs:** a new guide page "Driven steps (experimental)": what it is, enabling it (`.jev/config.json`, switch), preflight, local-only screens, hand-backs, limits (text only, can't see canvas/web/system sheets, real iPhone not supported). Reason-code rows. CHANGELOG entry for 1.3.0 (unreleased). Run `unslop` on human-facing text.

## Acceptance

- Report golden tests for a driven run (new goldens) and unchanged v1 goldens.
- `npm run check` passes; plugin build still works (`npm run build:plugin`).

## Comments

- 2026-10-01, coordinator: add reason codes `APP_NOT_IN_FOREGROUND` and `APP_NOT_RUNNING` (additive; see the spec's Rulings) and use them for the attach refusals in both drivers. Document the hand-back reasons from Issues 07 and 09 (`NONE_FITS`, `LOW_CONFIDENCE`, `RISKY_ACTION`, `DESTRUCTIVE_STEP`, `LOCAL_ONLY_STEP`, `LOCAL_ONLY_SCREEN`, `NO_PREFLIGHT`, `UNREADABLE_SCREEN`, `SCREEN_UNCHANGED`, `REPEATED_ACTION`, `SCREEN_LOOP`, `DECISION_BUDGET`, `SCREEN_CHANGED`), the `preflight` event, the start mode, and that `JEV_EXPERIMENTAL_DRIVEN` accepts `1` or `true`. Issue 11 already rewrote the `start` row in `script-format.md` — don't redo it. Reports: `.worktrees/handoffs/jev-drives/issue-NN-report.md`.
- 2026-10-01, coordinator, from Issue 08: implement the wall-time ruling in `run.ts` (spec Rulings) and fix the `resolve_step` description accordingly. The report and watch page must show the `needs_claude` state, each pause (reason, step, wait time) and Claude's answer kind; the skills teach the loop `start_scenario` → `get_report` (`needs_claude` → read the package → `resolve_step` with one answer, or `done`/`revise`/`stop`) → `get_report`; docs list the answer kinds, that `tapAt` is in screenshot-file pixels and Android-only for now, and that the CLI can't answer pauses (MCP only).
