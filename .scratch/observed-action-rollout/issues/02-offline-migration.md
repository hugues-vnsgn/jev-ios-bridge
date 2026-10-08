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

### Root implementation guidance — 2026-10-08

Read-only preparation mapped the actual journal writer in `src/experimental/observed-journal.ts`, wrapper intent in `observed-tap.ts:60–62`, default/custom roots in `observed-run.ts`, and shared iOS/Android lease format in `src/device/lease.ts`. Enumerate records directly; never call historical readers or lease acquisition because they can mutate/reclaim state.

- Conflicting historical bindings of one action ID across different devices refuse activation; do not pick a winner. Same-device case aliases merge conservatively.
- Persist once-assigned read-only imported allocation IDs behind a typed store seam for ticket03. They reserve replay identity but confer no prepared capability. Preserve original intent/result and source references; do not fabricate a new public request digest, evidence directory or readiness.
- Completed-looking results with a remaining claim, quarantine, unfinished intent or other uncertain source state remain uncertain. Validate actual record shapes; the old journal accepts arbitrary JSON.
- Account for interrupted publication `.tmp` records. UUID-attributable malformed leases retain that device. Well-formed matching non-UUID lease records may be classified as non-iOS and preserved without blocking Android; genuinely unattributable/conflicting records refuse activation. Document the classification and its limitation; do not silently discard unreadable data.
- Use an explicit versioned maintenance manifest for operational old-writer quiescence, source roots and exclusions. The declaration is an operator assertion, not process/native proof. Include default roots plus declared non-default roots, including differing historical home/TMPDIR contexts. A missing explicitly declared source is not silently empty.
- Preserve marker-present/missing-database refusal and partial-installation refusal. A marker inside the admission directory cannot detect deletion of that entire directory; do not claim otherwise or automatically rebuild missing state. Backup/restore and root deletion remain documented operational limitations.

Implementation dispatch still requires integrated ticket01 and a pinned SHA. This preparation does not authorize dependent source edits before that handoff.
