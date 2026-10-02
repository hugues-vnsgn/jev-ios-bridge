# Hand-back to Claude

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: 07

## What to build

- `src/driven/handback.ts`: the gate behind `ctx.handback`: holds one pending pause per run (`pauseId`, package, created time), resolves it with Claude's validated answer, times out after `handbackTimeoutMs` (default 5 min) → `HANDBACK_TIMEOUT`. A cancel while paused cancels cleanly.
- `src/service.ts`: job state `needs_claude`; `status(runId, waitMs)` returns **immediately** when the run is or becomes paused, with the package (reason, step id and intent, screen text, screenshot path, Jev's top 3 picks). New `resolve(runId, pauseId, answer)`; validate the answer (one kind; refs must exist in the paused snapshot; value keys must be allowed for the step; `revise` steps validated like a script; `tapAt` within the screen).
- `src/mcp/index.ts`: register `resolve_step` with a strict input schema and a description that tells Claude what to send; extend `get_report`'s description with the `needs_claude` state. CLI: `run` prints the package and waits (no interactive answering in the CLI for now; document `resolve_step` as MCP-only).

## Acceptance

- Tests: pause → `get_report` returns within milliseconds even with `waitMs: 45000`; resolve with each answer kind; invalid answers rejected with a clear message and the pause kept; timeout; cancel while paused; two pauses in one run; the device lease stays held while paused and is released at the end.
- `npm run check` passes.

## Comments

- 2026-10-01, coordinator, from Issue 01: `tapAt` coordinates are **pixels of the screenshot file** Claude sees (both platforms shrink screenshots to ≤ 800 px); the driver scales them. Describe `tapAt` that way in `resolve_step`. **iOS `tapAt` currently throws `UNSUPPORTED_ACTION`** (MobileBuildMCP 2.7.1 has no point tap; ADR-0002 forbids direct AXe) pending the owner's decision; build `resolve_step` so it reports that error cleanly and the pause stays open.
- 2026-10-01, coordinator, from Issue 07 (merged `d12c09d`; read `src/driven/step.ts` and its report at `.worktrees/handoffs/jev-drives/issue-07-report.md`): the loop calls an injected `handback(packet)`; `service.ts` does not pass `driven` options yet — **you wire it** (this unblocks `do` scripts through MCP and the CLI, together with Issue 09's opt-in check). Hand-back reasons now also include `LOCAL_ONLY_STEP`, `NO_PREFLIGHT`, `UNREADABLE_SCREEN`, `SCREEN_UNCHANGED`, `REPEATED_ACTION`, `SCREEN_LOOP`, `DECISION_BUDGET`, `SCREEN_CHANGED`. Answer validation (refs exist, value keys allowed, revision valid as a script) is yours. **Ruling: add a `done` answer kind** (Claude declares the paused step done; recorded `decidedBy: "claude"`), so `localOnly` steps can finish. Also add the new event kinds, action kinds and `do` to the log's `protocolValues` pass-through sets in `src/log/index.ts`.
