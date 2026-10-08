# 01 — Build the durable admission core

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: None
Owner: Admission-core implementer
Model: gpt-6-astra
Effort: high
Skills: cook, tdd, codebase-design, use-git-worktree
Expected commit: `feat: add durable iOS admission core`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Admission](../../observed-integration/evidence/admission-decision.md): invariants, storage/identity, interface, cancellation/finalization. [Allocation](../../observed-integration/evidence/allocation-contract.md): minimum store records.

## Write ownership

Allowed writes: `src/device/admission.ts`; `src/device/admission-sqlite.ts`; `tests/admission-core.test.ts`; `tests/fixtures/admission-core-worker.ts`; this issue's Status and Comments only.

Protected shared files: `src/device/index.ts`; `src/device/lease.ts`; `src/device/factory.ts`; `src/observed/**`; `src/experimental/**`; `src/cli.ts`; `src/mcp/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement the private canonical SQLite adapter, schema/version/root identity and installation-marker validation, transactional device/attempt acquisition, fenced capability attachment, read-only consistent snapshots, durable dispatch authorization/cancellation, joint terminal/disposition commit and owner-aware abandoned recovery. Initialization/migration activation is closed until 02. Define narrow typed extension seams for allocation policy and 03; document them in the return, not a new shared spec. Every transaction is short; operations remain outside transactions. Core tests use real SQLite and child-process owners, including ambiguous COMMIT and late stale owners.

## Acceptance and stop criteria

H03/H05/H06/H07/H09 core subsets: one owner; competing reads/acquires preserve incumbent; cancelled authorization refuses; terminal/disposition atomic; stale tokens and missing initialized DB fail closed. Run targeted tests and typecheck, plus Node 24.0.0 transaction/import smoke. No backend calls.

Completion: The core interface has passing transactional tests and no alternative authority; Root can integrate it before migration. Allocation orchestration is deferred to 07. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

