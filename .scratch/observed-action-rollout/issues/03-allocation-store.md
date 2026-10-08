# 03 — Add transactional allocation and parked ownership

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 02
Owner: Allocation-store implementer
Model: gpt-6-astra
Effort: high
Skills: cook, tdd, codebase-design, use-git-worktree
Expected commit: `feat: add fenced allocation store transitions`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Allocation contract](../../observed-integration/evidence/allocation-contract.md): durable records/transitions and budgets. [Public contract](../../observed-integration/evidence/public-contract.md): digest/identity/cancel authority. [Admission](../../observed-integration/evidence/admission-decision.md): fenced transitions.

## Write ownership

Allowed writes: `src/device/admission.ts`; `src/device/admission-sqlite.ts`; `src/device/admission-allocation.ts`; `tests/admission-allocation.test.ts`; `tests/fixtures/allocation-store-worker.ts`; this issue's Status and Comments only.

Protected shared files: `src/device/admission-migration.ts`; `src/device/index.ts`; `src/device/lease.ts`; `src/device/factory.ts`; `src/observed/**`; `src/experimental/**`; `src/cli.ts`; `src/mcp/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Own all allocation SQL and transactional transitions: global action/preparation reservations, source exclusions/capacity, immutable preparation/action/content bindings, write-once device identity, create-started guard/receipt binding, effective budget persistence, dispatch/cancel authorization, park/consume generation transfer, TTL/retire, retained eligibility and joint action terminal/allocation disposition. Every new iOS admission checks unknown creation and eligibility; existing owners may finish. Offer narrow typed methods to driver/runtime/allocator, with no general release or raw transaction API exposed to them. Preserve historical IDs from 02.

## Acceptance and stop criteria

H03/H04/H05/H06/H07 store subsets with real concurrent subprocesses: budget boundaries, unknown-create blocks legacy/supplied/ready acquisition, duplicate retrieval no mutation, TTL/start and ready/cancel races, uncertain receipt keeps guard, retained-success cannot be admitted, one new parked driver attachment. Rerun 01/02 tests and typecheck.

Completion: Runtime/allocator can implement every accepted transition using exported methods without SQL. Return the integrated typed interface and evidence; stop if the accepted transition set is incomplete. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

### Driver integration expectations — 2026-10-08

Read-only ticket05 preparation confirms the planned capability handoff: allocation reservation/known-device binding must yield a claim usable throughout preparation. Parking synchronously closes that handle and transactionally verifies settled commands, records readiness/evidence/TTL and removes its live attachment. Consumption binds the immutable action request and transfers a new owner token/generation with one fresh attachment. Cancellation orders against command authorization; terminal methods jointly publish action/allocation disposition. Unknown creation and retained eligibility are checked by every new acquisition, including legacy and ready consumption.

The existing generic dispatch can carry a driver-private acknowledged-result envelope; no additional generic release or settlement override is requested. The driver will authorize observed touch as `tap` to enforce the single-input guard and use a distinct internal kind for ordinary multi-step legacy actions. Ticket05 will receive the actual integrated exported types before implementation.

Root also assigns the narrow durable action progress/evidence/export projection methods required by tickets06/07 to this store owner. Preserve nullable attempt/acknowledgment flags and counts across restart, distinguish active/finalizing from authoritative terminal state, and record export status separately from the immutable committed outcome. Expose typed methods, not raw transactions or generic release authority. This is part of the accepted shared-store contract and requires no new public schema.
