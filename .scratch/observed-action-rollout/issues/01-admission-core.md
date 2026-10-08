# 01 — Build the durable admission core

Type: task
Status: ready-for-agent
Execution: implemented-awaiting-review
Claimed by: admission-core
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



### Implementation handoff — 2026-10-08

Bounded verdict: PASS, implemented pending Root's independent review. No rollout acceptance is claimed.

Skills applied: Cook (existing reviewed plan, autonomous user-authorized progression), TDD, codebase-design, use-git-worktree (existing isolation verified), and do-test. Cook's simplify threshold was crossed; the skill is unavailable in the installed roots, so Root covers maintainability in independent review. Shared plan sync, journal and code-review remain Root-owned per dispatch.

Base: `b8c4a50942551bdf95d00036a6d2f7bb6142ff43`. Source: `src/device/admission.ts`, `src/device/admission-sqlite.ts`. Tests: `tests/admission-core.test.ts`, `tests/fixtures/admission-core-worker.ts`.

The module owns SQLite authority: canonical UUID/root and installation identity, schema/migration checks inside transactions, atomic owner/intent acquisition, durable attachment/dispatch/cancel ordering, immutable terminal/disposition commits, and explicit owner-aware quarantine. Available disposition requires settled work and no uncertainty. Observed taps authorize once; legacy attempts retain multiple taps. A failed or ambiguous command authorization closes its local session. Reads do not transition claims; healthy polling and duplicate retrieval preserve database bytes and mtime. Production has no initialization or migration activation entry point in this ticket; only explicit fake-backend fixtures initialize test-mode stores, which real backend attachment rejects.

#### Test matrix and evidence

Oracle: admission decision invariants/state table and this ticket's core subsets of H03/H05/H06/H07/H09. Tests cross `Admission`, its owned claim/session, real SQLite and real child processes. Direct fixture SQL is used only to create corruption/contention, never as the assertion surface for authority.

| Scenario | Expected / observed | Result |
| --- | --- | --- |
| Canonical identity and independent observed/legacy owner races | One owner; competitor refused; incumbent completes | PASS |
| Immutable intent and global attempt identity | Exact duplicate retrieves; changed intent/device conflicts | PASS |
| Read-only status and repeated retrieval | Database bytes/mtime preserved; healthy claim remains active | PASS |
| Cancellation before acquire, before effects and during underlying work | No post-cancel dispatch; pre-effect refusal can complete; uncertain work quarantines | PASS |
| Single observed tap and repeated legacy taps | At most one observed tap; legacy sequence preserved | PASS |
| Lost/failing command authorization and operation reply | Session closes; no follow-up effect | PASS |
| Terminal failure before/after commit | Unconfirmed candidate; fresh resolver sees whole committed transaction or prior active claim | PASS |
| Real child death before/after acquire and terminal commit | All-or-nothing persisted authority; no automatic reclaim | PASS |
| Live, dead, unknown and mismatched process incarnation | Live/unknown preserve owner; confirmed dead expected owner quarantines | PASS |
| Token/generation mismatch and stale finalization | Successor preserved; exact old terminal only retrieves | PASS |
| Missing/corrupt/schema/inactive/unsafe/aliased store and altered journal policy | Closed refusal; no replacement database or policy rewrite | PASS |
| SQLite writer contention | Bounded wait; incumbent preserved | PASS |
| Minimum Node version | Real tests and child processes pass on Node 24.0.0 | PASS |

Commands/evidence:

- `node --import tsx --test tests/admission-core.test.ts`: 30 passed, 0 failed/skipped; `/tmp/admission-core-targeted.log`.
- `npm run typecheck`: exit 0; `/tmp/admission-core-typecheck.log`.
- `npm run check`: exit 0, 994 tests passed, 0 failed/skipped, build passed; `/tmp/admission-core-full-check.log`. This run included 29 core cases; the subsequent journal-policy case and final metadata-validation change were covered by the final targeted/minimum-runtime/typecheck/build runs.
- Root-provided official Node 24.0.0 binary with `--import tsx --test tests/admission-core.test.ts`: 30 passed, 0 failed/skipped; `/tmp/admission-core-node24.log`.
- TDD red/green evidence: `/tmp/admission-core-red-01.log` through `red-04.log`, `red-07.log`, `red-08.log`, `red-09.log`; corresponding green logs plus final targeted output. Reproductions covered missing implementation, mismatched recovery incarnation, follow-up after uncertainty, changed intent under reused digest, ambiguous authorization, legacy multiple taps and altered journal policy.

#### Interfaces and next ownership

`Admission.open()` resolves the account-home canonical production root. `Admission.forTesting({root, backend:'fake', ...dependencies})` creates/reopens explicit test stores. Dependencies provide clock, process incarnation, liveness and before/after-COMMIT fault injection. `acquire` returns a module-owned `AdmissionClaim`, retrieval, or refusal. Claim `bindDriver` attaches once and returns `AdmittedSession.dispatch(kind, effect)`; the effect must return the underlying operation promise, never merely an abort wrapper. Claim `cancel` synchronously closes local issuance, and `finalize` closes issuance before its joint commit. `Admission.cancel` durably orders cross-process cancellation. `readAttempt` is the authoritative resolver. `quarantineAbandoned` requires the exact expected owner and confirmed-dead liveness; unknown/live remains busy.

Transfer both admission source files to ticket 02, then 03 as planned. The internal `AdmissionSqlite` is the typed storage extension seam: add concrete migration/allocation operations alongside existing transaction methods and schema; no SQL executor/callback escapes to allocator orchestration. Metadata contains nullable migration manifest plus schema/root/installation/mode fields. 02 must implement offline initialization/import/activation and migration exclusion; 03 must add reservation, host creation guard, inventory eligibility, parking/transfer and joint allocation terminal policy in the same authority. No advance implementation of those policies is included.

Limitations: no actual backend/device/model operations; no real filesystem exhaustion experiment; no public adapter/legacy-driver integration, migration or allocation policy yet. Those belong to dependent tickets and Root's acceptance matrix. SQLite crash tests establish host transaction behavior, not native release or durability under faulty hardware. OS PID reuse conservatively remains busy unless a supplied liveness adapter can establish the recorded incarnation is dead. Older binaries/external operators remain outside enforcement.

### Independent-review fixes — 2026-10-08

Bounded verdict: PASS, pending Root's re-review. Applied diagnosing-bugs, TDD and do-test within the existing Cook workflow; no subagents or live/default-store operations. Base for this repair: `03fcbe43332fea1272570dd9224808079d0329b3`.

P1 confirmed: a cancellation write rolled back before COMMIT, while the handle only remembered closed issuance. After a late tap settled, terminal validation saw no durable cancellation and accepted observed/available. A per-claim cancellation latch now sets synchronously before persistence; finalization passes it into the same fenced terminal transaction. That transaction validates cancellation even after a failed earlier write and persists the cancellation flag with a safe terminal. Success/available is refused after dispatched cancelled work; explicit inconclusive/quarantine remains possible. After-COMMIT cancellation ambiguity was already conservative and remains covered.

P2 confirmed: existing SQLite sidecars were outside root/database/marker permission validation. `secureSidecars` now applies the same ownership, regular-file, symlink and private-mode checks to `-journal`, `-wal` and `-shm` before SQLite can open/consume them, including fixture initialization. Missing sidecars are normal. Unsafe sidecars are refused without rewriting/removing them. A before-COMMIT witness verifies SQLite's newly created rollback journal is a regular, owned 0600 file.

| Regression / blast radius | Evidence | Verdict |
| --- | --- | --- |
| Signal abort, failed cancellation write before COMMIT, late tap settlement, attempted observed/available | `/tmp/admission-fix-p1-red.log`: exact regression fails before fix (1 failed, after-COMMIT control passes); `/tmp/admission-fix-p1-green.log`: both pass after fix | PASS |
| Safe terminal after cancellation persistence failure | Inconclusive/quarantine committed with cancellation flag; no successful terminal or available device after unsafe candidate | PASS |
| Sidecar permissions/symlink/directory across journal/WAL/SHM; new journal0600 | `/tmp/admission-fix-p2-red.log`: 5 failed/5 passed before fix; `/tmp/admission-fix-p2-green.log`: 10/10 pass after fix | PASS |
| Existing ownership, cancellation, crash, transaction and storage cases | `node --import tsx --test tests/admission-core.test.ts`: 42/42, no skips, `/tmp/admission-fix-node26.log` | PASS |
| Minimum supported runtime, including child-process owners | Root-provided Node24.0.0 `--import tsx --test tests/admission-core.test.ts`: 42/42, no skips, `/tmp/admission-fix-node24.log` | PASS |
| Type compatibility | `npm run typecheck`, exit 0, `/tmp/admission-fix-typecheck.log` | PASS |

The original reviewer diagnostic was rerun: its unsafe-success assertions now stop with `OPERATIONS_UNSETTLED` (`/tmp/admission-fix-original-cancel.log`). Its unsafe-journal scenario, isolated without changing its body, now stops with `STATE_UNAVAILABLE` (`/tmp/admission-fix-original-journal.log`). These diagnostics intentionally exit 1 because they assert the prior defect; the retained regression tests assert safe behavior and pass.

Limits unchanged: host-only tests, no device/native-release certification or actual disk-full experiment. Foreign-UID sidecar creation was not exercised; ownership uses the existing shared UID validator. Root owns the combined full repository gate and independent re-review.
