# 06 — Implement shared observed lifecycle and authoritative evidence

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 04, 05
Owner: Observed-runtime implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, codebase-design, use-git-worktree
Expected commit: `feat: add authoritative observed-action lifecycle`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Seam](../../observed-integration/evidence/seam-decision.md), [public contract](../../observed-integration/evidence/public-contract.md), [admission](../../observed-integration/evidence/admission-decision.md): resolver/terminal rules.

## Write ownership

Allowed writes: `src/observed/service.ts`; `src/observed/schema.ts`; `src/observed/report.ts`; `src/observed/evidence.ts`; `src/experimental/observed-journal.ts`; `src/experimental/observed-tap.ts`; `src/experimental/observed-run.ts`; `spikes/observed-ui/cli.ts`; `tests/observed-service.test.ts`; `tests/observed-schema.test.ts`; `tests/observed-evidence.test.ts`; `tests/observed-journal.test.ts`; `tests/observed-tap.test.ts`; `tests/observed-run.test.ts`; this issue's Status and Comments only.

Protected shared files: `src/device/**`; `src/observed/allocation*.ts`; `src/observed/create-source.ts`; `src/observed/supplied-source.ts`; `src/observed/artifact.ts`; `src/cli.ts`; `src/mcp/**`; `src/service.ts`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement strict action schema/canonical digest, shared service start/inspect/wait/cancel/close and durable authoritative renderer with injected integrated store/session and allocator interface. One consume/start, fresh guards, bounded polling/finalization; preserve four outcomes and nullable crash flags. Persist private absolute evidence and provisional versus postcommit terminal export; postcommit export failure cannot rewrite terminal. Adapt historical journal/runner/spike to the same resolver; raw-device execution requires a bound prepared allocation or safe migration-required refusal. Do not independently prepare or relaunch. Allocator interface is structural/injected, so 07 runs disjointly.

## Acceptance and stop criteria

H01/H03/H05/H06/H07/H08 lifecycle subsets: repeated start retrieval/conflict, read invariance, no tap for already-satisfied/refused, one tap under reply loss/stale/late cancel, restart never replays, no provisional success authority, exports reflect committed records, imported records remain read-only. Targeted observed tests and typecheck.

Completion: Both adapters can use one service implementation; imported/spike paths cannot bypass admission. Return allocator injection requirements to Root for integration with 07. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

