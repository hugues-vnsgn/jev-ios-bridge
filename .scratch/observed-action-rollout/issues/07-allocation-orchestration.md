# 07 — Prepare bounded allocations through the shared store and driver

Type: task
Status: ready-for-agent
Execution: integrated
Claimed by: shared_driver; integrated by Root
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

Root acceptance: candidate `bfa73591673fb931d58df8e46f343700aae8a68a` integrated as `6d5536a551df853dd92fdf63253c1bacc244263f` after separate Spec/Standards PASS and six unchanged probes on Node26/exact24. Combined657/657 each runtime, full1423/1423 plus typecheck/build and all21 runtime/allocator hashes pass; zero skips. [Review and evidence](../../observed-integration/acceptance/host/allocator-review.md). This accepts bounded implementation, not the complete public/host/live matrix. Source ownership returns to Root.


### Execution — 2026-10-08

Claimed by: `/root/shared_driver` (allocator implementer). Root dispatched autonomous execution from `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181`; Root later advanced this isolated branch by fast-forward to `98f7de41baa316f47a65a7bc2160128a72051f3e` for the reviewed `inventoryStatus` dependency, preserving the six owned in-progress files. Status remains `ready-for-agent` under Root's tracker instruction.

Applied Cook, TDD, diagnosing-bugs, use-git-worktree, do-test and codebase-design to the reviewed plan. Root provides independent review. Simplify is unavailable; a local maintainability review checked ownership, capability boundaries, shared stage signals, bounded underlying-operation tracking and the structural runtime interface. No shared driver/store/source adapter, CLI/MCP, goldens, protected app, key or production-storage edits or effects were used.

Implemented the strict preparation parser/canonical digest, fixed private config and bounded installed metadata proof, narrowly composed source process, authoritative capacity/storage rechecks, immutable staging, fixed creation/supplied source, admitted preparation and parking, pure retrieval/wait, cancellation/retirement, private full-binding consume and explicit conservative preparation-owner recovery. Close is memoized, synchronously revokes owned preparation, and leaves the borrowed Admission capability usable. Ready jobs leave ownership at committed park.

Genuine reds and fixes include pending config-read shutdown, metadata replacement, malformed create names, production backend construction against test authority, config permission replacement, nonsettling child errors, cancelled/deadline child close code, lost reservation reply and private bounded diagnostics. Raw originals are retained under `.scratch/observed-integration/acceptance/host/allocator/`. Initial missing-module reds, fake plist XML/setup errors, invalid acknowledged-error fixture payloads, nonexistent test-only `Admission.close()` and the reassignment oracle correction are recorded separately from behavioral defects. No assertions were skipped or timeouts relaxed.

Root's reviewed evidence clarification at `86dae24eb0091abe63808cd454560ca1cd52f7c2` permits rendering the durable absolute `evidenceDirectory` as a deduplicated directory pointer in snapshot `evidenceRefs`. It does not certify a diagnostic file or its completeness. Unknown creation remains quarantined with its guard/capacity; later/private diagnostics cannot rewrite terminal authority. The existing store APIs cannot append a per-file diagnostic ref after `recordCreation` has made the allocation terminal, and no store extension was made.

Final gates, checked hashes, matrix, commit and bounded limitations will be recorded in the private allocator report and appended here after the serialized complete checks.

### Bounded repairs before final review — 2026-10-08

Before the complete gate, an isolated fake-only probe confirmed that `cancelAllocation` throwing before commit left the known local job issuing after return. Root authorized changes only in allocation.ts/its test/comments: cancellation now finds the matching existing owned capability before the fallible store operation and synchronously closes that job on error. Normal cancellation still commits first. Before/after-commit faults and a separate concurrently live allocation assert safe unknown acceptance, held uncertain stock, no later target commands and no cancellation of unrelated ownership. Original `cancel-store-repro.log` and `cancel-store-regression-red.log` are preserved.

Root also authorized a second confirmed repair after `finalization-known-fs-repro.log` observed 10141ms: a blocked private diagnostic write followed by delayed local advisory lease release used sequential budgets. Failure now revokes issuance and runs tracked diagnostics/local close concurrently under one 5000ms signal. An abort wrapper grants no settlement proof; unknown local close becomes quarantined `PREPARATION_UNCONFIRMED` with held capacity. Already uncertain/cancelled reasons remain appropriate; known acknowledged failures with successful finalization still return their original stage refusal. The isolated child regression asserts the 5000ms bound with an explicit 500ms scheduling tolerance, original acknowledged error retained only privately, no synthesized file receipt, and unchanged quarantine/identity/capacity/backend calls after delayed filesystem release. The separate earlier pending-boot probe passed at 5058ms and is not a 10s reproduction.

The original owned coverage run was interrupted (exact fake test process 28308/child 28310, verified stopped) because the snapshot deadline fixture also shortened the unrelated boot stage and waited forever for a target never reached. Root authorized shortening only the target stage to the same original 30ms and racing its barrier against preparation completion. No production or target timeout was raised; the original interrupted raw output remains `final-coverage-node26.log`, exit 1. Source/test manifests and the original 516/516 gates on both runtimes remain separate from the repaired candidate's final checks.

### Independent review repairs and final host gates — 2026-10-08

Round1's exact source snapshot/manifest and 520/520 gates on both nodes, 111/111 coverage and 1319/1319 full check remain preserved under allocator/round1-* and repair-*. Independent Spec review confirmed five boundaries missed by those green suites. Root authorized only allocation.ts, allocation-schema.ts, this test and Comments. The repair preflights old/imported observed and preparation identities before every prerequisite, verifies the actual retained blocking creator's directory, treats either required diagnostics or local close failure as uncertainty, returns verified busy action/state/evidence with explicit action cancellation direction, and projects immutable historical allocation retrieval through the accepted consistent record view.

Root's normative historical/busy clarification at `c8012f40a4048db2bfd8b955f15eab0450ccc345` governs additive `readOnly`, `historicalOutcome` and optional error `state`. Historical get/cancel/retire never mutate; zero new reservation does not release historical exclusions. Confirmed current quarantine lowers disposition while preserving the old observed outcome; busy or unverifiable reads never invent quarantine. Both original outcomes and evidence paths come from storage, with no new preparation/consumption permission or invented allocation reason.

All five reviewer originals are retained unchanged in allocator/review-repair/original-*. The corrected authored regression ran against preserved round1 product source: 22/22 intended failures, exit 1; final bounded repair/compatibility assertions passed 42/42, exit 0. Initial test-only full-snapshot binding misuse and an optional-inspection type error remain preserved separately; exact-ID binding setup/typing were corrected without weakening an oracle. Final frozen sixfile manifest is review-repair/final-source.json and matches final-hash-check.json across every final gate. Config, config tests and backend fixture did not change in this five-finding repair.

Final sequential checks on Node 26.8.1 and exact Node 24.0.0: affected 556/556 each, zero skips; owned coverage 147/147, zero skips; npm run check 1355/1355, zero skips plus typecheck/build. All commands exit 0. Changed source coverage is 99.11% lines and 90.15% branches; each file exceeds 80%/70%, with every reported uncovered line reviewed. Raw commands, counts, hashes, ownership audit, H01/H03/H04/H05/H06/H07 matrices and limits are under `.scratch/observed-integration/acceptance/host/allocator/review-repair/`; final focused commit is reported separately. Source edits stop for Root's independent re-review and integration. This is fake-only host evidence; live/public/composition acceptance remains unverified.

### Final round3 boundary repair — 2026-10-08

Independent re-review found that healthy preparing retirement was incorrectly reported as STORE_UNAVAILABLE by the executing-only busy context check. Round2's exact six-file source snapshot/map, 556/556 both-node gates,147/147 coverage,1355/1355 full check and reports remain untouched; their green suites do not constitute acceptance of that boundary. Root granted only allocation.ts/schema/test/Comments. Its clarification `459dafc252c5c43e4674d8f8265f8427b75c601b` preserves ALLOCATION_BUSY with preparing state and allocation cancellation guidance for active preparation; executing retains explicit action cancellation guidance.

The pending-boot regression reproduced the original defect (7pass/1fail,exit1), then16/16 bounded cases passed after repair. Seven preparation cases verify correct or safely unavailable identity/state/evidence, unchanged durable record/SQLite bytes/backend calls, no retirement cancellation, and original preparation still completing ready. Busy cancel remains executing-only, including an injected preparing-state negative context. All six unchanged reviewer probes passed on both runtimes. No source/config/fixture/budget/store capability broadening occurred.

Final round3 source/test freeze `allocator/round3/final-source.json` matches immutable copies and all final gates: Node26.8.1/exact24.0.0 affected564/564 each; owned coverage155/155; full npm check1363/1363 plus typecheck/build; zero skips,all exit0. Coverage99.12%lines/90.24%branches, all three source files above80/70; every uncovered line read. Exact commands, hashes, ownership/private-permission audits, matrices, original reports and bounded limits are in round3/. Both independent frozen-source Spec/Standards re-reviews PASS; commit association/integration remain Root-owned. Final SHA follows in round3/checked-revisions.json. Source edits stop after the exact seven-file commit. Live/public/composition and historical incident acceptance remain UNVERIFIED.
