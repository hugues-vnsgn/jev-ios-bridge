# 05 — Enforce admission at every updated iOS driver dispatch

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 03
Owner: Shared-driver implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, diagnosing-bugs, use-git-worktree
Expected commit: `feat: fence iOS driver commands with shared admission`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Admission](../../observed-integration/evidence/admission-decision.md): command ledger, compatibility lease, cancel/finalize. [Allocation](../../observed-integration/evidence/allocation-contract.md): preparation and parked driver transfer. [Seam](../../observed-integration/evidence/seam-decision.md): driver paths.

## Write ownership

Allowed writes: `src/device/index.ts`; `src/device/lease.ts`; `src/device/factory.ts`; `tests/device.test.ts`; `tests/device-lease.test.ts`; `tests/device-factory.test.ts`; `tests/lease.test.ts`; `tests/observed-touch-integration.test.ts`; `tests/admission-driver.test.ts`; this issue's Status and Comments only.

Protected shared files: `src/device/admission*.ts`; `src/experimental/**`; `src/observed/**`; `src/service.ts`; `src/cli.ts`; `src/mcp/**`; `src/device/android/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Install required integrated admission on legacy scripted/driven iOS, preparation/capture and observed paths before selected-device effects. Keep compatibility lease best-effort exclusion but disable iOS dead-holder reclaim. Add typed preparation operations boot/install/launch/readiness and a parked-action driver attachment with no relaunch. Persist dispatch authorization and ledger before every call; unify signal/deadline, track underlying promises, synchronously revoke issuance and reject late continuations/cleanup after uncertainty. Preserve ordinary legacy retry semantics while observed tapOnce remains one touch and no semantic fallback. Migration/root checks precede effects.

## Acceptance and stop criteria

H03/H04/H05/H06/H08 driver subsets: races against observed/preparation/legacy, guard blocks every new iOS path, cancelled/late operation sends no follow-up, parked attachment zero boot/install/launch, at most one observed input. Targeted driver/lease/factory/observed-touch tests and typecheck; Android regression tests remain passing.

Completion: Root integrates the real typed session interface before dispatching 06/07. Shared src/device/index.ts ownership ends here and transfers to Root; downstream workers cannot patch it. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

