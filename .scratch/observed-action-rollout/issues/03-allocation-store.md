# 03 — Add transactional allocation and parked ownership

Type: task
Status: ready-for-agent
Execution: integrated
Claimed by: allocation-store implementer
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

### Implementation grounding — 2026-10-08

Base `dc31c577a30b2aca0c8638f03420fd05b611dce7`, isolated `feat/observed-allocation-store`. The accepted seams are Admission and its module-owned allocation/preparation/action capabilities with real SQLite, fake effects, and independent subprocesses. Matrix: H03 identity/read invariance and parked transfer; H04 capacity/bytes/source/exclusion/creation receipts; H05 cancellation/TTL ordering; H06 commit/crash/stale-owner behavior; H07 unavailable storage and evidence projections. Existing 01/02 suites cover admission and immutable migration history. Public adapters/live behavior remain downstream. Cook uses the reviewed plan and explicit autonomous dispatch; Root supplies independent review, and the unavailable Simplify skill is not substituted with extra ownership.

### Implementation and host verification — 2026-10-08

Implemented the six-file owned store slice from base `dc31c577a30b2aca0c8638f03420fd05b611dce7`. Status remains `ready-for-agent`; independent Standards/Spec review belongs to Root. The shared store now owns immutable reservation/content/source/budget bindings, unknown-creation fencing and receipts, exclusion/eligibility, parked generation transfer, cancellation/TTL/retirement, explicit abandoned-owner recovery and joint terminal disposition. Durable action observations, nullable flags, finalizing state, read-only active-owner discovery and export metadata are available through typed methods without downstream SQL.

Verification: 134/134 core, migration and allocation tests pass on Node 26.8.1 and exact Node 24.0.0, zero skipped; typecheck and build pass. Sixteen real SIGKILL transaction milestones, independent reservation/start/cancel/TTL races, and preparation process exit before consumption are covered. Changed-file coverage: allocation types 100% lines/branches; SQLite 97.46% lines, 89.74% branches; admission 98.63% lines, 89.68% branches. Red/green repairs cover duplicate preparation admission, terminal flag consistency, local revocation after failed persistence, and park deadline enforcement. Raw logs and the complete interface/matrix report are at the worktree's `.scratch/observed-integration/acceptance/host/allocation-store/` (intentionally untracked per Root).

No live operations, real migration, production store, credentials, protected claims or app sources were accessed. Full installed/public/live gates remain downstream. Schema 2 rejects older initialized schemas rather than upgrading them automatically. Simplify was unavailable and did not run. Root retains shared plan/journal updates and integration authority.

### Independent-review repair — 2026-10-08

Addressed the P1 finding on candidate `c8930102e6f04218f3097bb937434095521a9782`: parking now rejects a previously closed/cancelled preparation claim or closed parent reservation before entering its transaction. Failed cancellation, reservation failure, finalization and parking writes all reproduced the bypass against the candidate (four failing regressions, each admitting one fake tap). The same four regressions now prove parking refusal, no consumption, zero later effects and preserved conservative quarantine finalization. Also resolved the Standards duplication by reusing `deviceView` in `inspect` and `creationGuard` in reservation.

Node 26.8.1 and exact Node 24.0.0: 138/138 focused core/migration/allocation tests pass, zero skips; typecheck/build and diff check pass. Raw `repair-*.log` and `repair-report.md` are beside the unchanged independent review artifacts in the worktree evidence directory. Status remains `ready-for-agent`, Execution remains `implemented-awaiting-review`; Root owns re-review and integration.

### Allocation capacity prerequisite — 2026-10-08

From Root's dispatched base `b70a7ab3883dfb1530918f16cc39324b1662f91e`, added the agreed non-mutating `Admission.readAllocationCapacity(): AllocationCapacity`, where `AllocationCapacity` is `{ heldAllocations: number; reservedBytes: number }`. One consistent read includes all held records across lifecycle states, uses persisted reservation bytes despite configuration changes, and fails closed on invalid capacity fields, corrupt checksums or unsafe aggregate arithmetic. This supplies allocator second free-space checks; lifecycle, release and unknown-creation behavior are unchanged.

Test-first evidence covers all held lifecycle states, pre-dispatch released capacity, changed config, database-byte invariance, corrupt fields/checksums and arithmetic boundaries. Eleven focused capacity cases pass after genuine captured red; the complete core/migration/allocation suites pass 149/149 on Node 26.8.1 and exact Node 24.0.0 with zero skips and test-process umask 0022. Typecheck/build/diff check pass. Raw evidence and report are private files in the new worktree's `.scratch/observed-integration/acceptance/host/allocation-capacity/`; Root owns independent review/integration. No live/production/secret access occurred; Simplify remains unavailable.
