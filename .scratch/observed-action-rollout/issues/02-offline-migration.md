# 02 — Import historical admission state offline

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 01
Owner: Migration implementer
Model: gpt-6-astra
Effort: high
Skills: cook, tdd, codebase-design, use-git-worktree
Expected commit: `feat: add conservative offline admission migration`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Admission](../../observed-integration/evidence/admission-decision.md): migration/coexistence and initialization marker. [Public contract](../../observed-integration/evidence/public-contract.md): historical read-only allocation IDs.

## Write ownership

Allowed writes: `src/device/admission.ts`; `src/device/admission-sqlite.ts`; `src/device/admission-migration.ts`; `src/device/admission-maintenance.ts`; `tests/admission-migration.test.ts`; `tests/fixtures/admission-migration/**`; this issue's Status and Comments only.

Protected shared files: `src/device/index.ts`; `src/device/lease.ts`; `src/device/factory.ts`; `src/experimental/**`; `src/observed/**`; `source journals/claims`; `src/cli.ts`; `src/mcp/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement the explicit offline maintenance entry at packaged dist/device/admission-maintenance.js, guard and manifest, conservative enumeration/import of historical journals and leases, alias consolidation, retained protected exclusions and one-time read-only historical allocation identities. Distinguish fresh initialization from missing initialized storage. Require operational old-writer quiescence and declared non-default roots; cannot prove quiescence by mtimes. Preserve source bytes. Expose activation validation through admission, so subsequent driver work can refuse before effects.

## Acceptance and stop criteria

H08 and H07 migration subsets: dead/live/malformed leases, quarantine plus apparent completion, aliases, unfinished intent, corrupt/unattributable data and unquiesced source all produce the required retention/refusal. Source fixtures remain byte-identical; rerun 01 tests and typecheck.

Completion: A successful manifest enables updated entry points; unsafe imports stay closed. Return exact maintenance invocation and prerequisites for docs. Transfer store ownership to 03 only after Root integrates. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

