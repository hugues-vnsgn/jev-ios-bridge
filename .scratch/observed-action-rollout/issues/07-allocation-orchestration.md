# 07 — Prepare bounded allocations through the shared store and driver

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 04, 05
Owner: Allocator implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, diagnosing-bugs, use-git-worktree
Expected commit: `feat: orchestrate retained observed allocations`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Allocation contract](../../observed-integration/evidence/allocation-contract.md), [inventory](../../observed-integration/evidence/inventory-decision.md), [public contract](../../observed-integration/evidence/public-contract.md): shared snapshot/error and shutdown semantics.

## Write ownership

Allowed writes: `src/observed/allocation.ts`; `src/observed/allocation-schema.ts`; `src/observed/allocation-config.ts`; `tests/observed-allocation.test.ts`; `tests/observed-allocation-config.test.ts`; `tests/fixtures/observed-allocation-backend.ts`; this issue's Status and Comments only.

Protected shared files: `src/device/**`; `src/observed/service.ts`; `src/observed/schema.ts`; `src/observed/report.ts`; `src/observed/evidence.ts`; `src/observed/create-source.ts`; `src/observed/supplied-source.ts`; `src/observed/artifact.ts`; `src/experimental/**`; `src/cli.ts`; `src/mcp/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement prepare/get/wait/cancel/retire and private consume by composing integrated store methods, 04 sources/artifact and 05 driver. Validate private per-user config/effective budgets and storage metadata, reserve before staging/spawn, fixed source, stage digest before creation, one boot/install/launch, bounded Booted listing and readiness, then settle and park. Cancel commits before further dispatch; ready commit removes owned job so exit/close preserves readiness. Pure read has no TTL transition. Unknown creation retains guard/capacity; no SQL, alternate store, cleanup/reuse or automatic build. Publish structural interface for 06.

## Acceptance and stop criteria

H01/H03/H04/H05/H06/H07 allocator subsets: both sources, byte/capacity/free-space boundaries, protected IDs, staged mutation, lost receipt, every preparation phase cancel, ready process exit then independent-process consume, TTL race, unknown creation/refusal without fallback. Fake backend plus real store; targeted tests/typecheck.

Completion: Preparation can park safely and action transfer can attach exactly once without relaunch. Root integrates 06/07 together and resolves interface mismatch before 08. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

