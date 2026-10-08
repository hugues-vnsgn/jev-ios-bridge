# 04 — Build narrow creation and artifact source adapters

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: None
Owner: Source/artifact implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, project-organization, use-git-worktree
Expected commit: `feat: add bounded simulator creation and artifact adapters`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Inventory decision](../../observed-integration/evidence/inventory-decision.md), [provisioning research](../../observed-integration/evidence/provisioning.md), [allocation](../../observed-integration/evidence/allocation-contract.md): prerequisites/artifact staging.

## Write ownership

Allowed writes: `src/observed/create-source.ts`; `src/observed/supplied-source.ts`; `src/observed/artifact.ts`; `tests/observed-sources.test.ts`; `tests/observed-artifact.test.ts`; `tests/fixtures/observed-artifacts/**`; this issue's Status and Comments only.

Protected shared files: `src/device/**`; `src/observed/allocation.ts`; `src/observed/service.ts`; `src/experimental/**`; `src/process.ts`; `src/cli.ts`; `src/mcp/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement independently injected adapters, never orchestration or stores. Creation accepts an internally authorized dispatch callback and executes only the approved xcrun simctl create argument array with explicit type/runtime and single UUID-success validation; raw outcomes remain private diagnostic artifacts. Supplied selection validates configured provenance without arbitrary adoption. Artifact inspection/staging validates simulator platform/architecture/minimum OS/bundle metadata, bounded bytes and escaping symlinks, produces an immutable private staged copy/content digest and verifies it before install. Reuse existing process helpers by composition; request changes from Root if their interface is insufficient.

## Acceptance and stop criteria

H04 adapter subsets: malformed/lost/nonzero/abort-ignoring creation receipt yields uncertainty without retry; escaping symlink/content mutation/incompatible metadata refuses; no shell interpolation, direct list, destructive operation, default runtime or source fallback. Fake process/fs fixtures only; tests plus typecheck.

Completion: Adapters are testable without admission mocks granting real devices, have no device operation on module load, and publish typed inputs/outputs for 07. Real device listing/create is outside this ticket. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

