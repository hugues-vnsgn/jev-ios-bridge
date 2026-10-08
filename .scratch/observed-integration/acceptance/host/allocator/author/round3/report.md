# Ticket07 allocator — final round3 host report

**Bounded host checks PASS; independent Spec and Standards frozen-source reviews PASS. Commit association and integration remain Root-owned. Live/public acceptance remains UNVERIFIED.**

## Revision and scope

Original dispatch base `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181`; updated dependency/implementation base `98f7de41baa316f47a65a7bc2160128a72051f3e`. Branch `feat/observed-allocator`, isolated linked git-dir verified. Final SHA/commit association is recorded in checked-revisions.json.

Exact seven tracked files: src/observed/{allocation.ts,allocation-schema.ts,allocation-config.ts}; tests/{observed-allocation.test.ts,observed-allocation-config.test.ts,fixtures/observed-allocation-backend.ts}; own07 Comments/Execution. Status remains ready-for-agent. All six source/test files match final-source.json before and after every gate; immutable copies are in source/. Ownership-audit.json confirms exact scope, diff-check0 and private evidence. No protected source/golden/app/secret edits, merge, publish or production effects.

The allocator uses accepted Admission/source/artifact/driver capabilities for strict identity, installed compatibility proof, authoritative held count/bytes/storage checks, immutable staging, guarded fixed creation or supplied inventory, once-only preparation and bounded readiness/park. Pure retrieval/wait and historical projections confer no new authority. Close synchronously revokes owned work, is memoized and leaves borrowed Admission usable; ready jobs leave ownership at committed park. Runtime consumes the full accepted ActionBinding.

## Exact final gates

| Check | Raw log | Exit | Pass / skips | Wall |
| --- | --- | --- | --- | --- |
| 11 affected suites, Node26.8.1 | final-focused-node26.log | 0 | 564/564 / 0 | 57.44s |
| Same suites, exact Node24.0.0 | final-focused-node24.log | 0 | 564/564 / 0 | 58.13s |
| Owned changed-source coverage | final-coverage-node26.log | 0 | 155/155 / 0 | 35.95s |
| npm run check, Node26 | final-full-check.log | 0 | 1363/1363 / 0; typecheck/build PASS | 71.53s |
| Busy boundaries | green-retire-preparing.log | 0 | 16/16 / 0 | 5.86s |
| Six unchanged independent probes, each runtime | original-probes-node26.log / original-probes-node24.log | 0 / 0 | 6/6 each / 0 | 1.99s / 2.71s |

commands.json holds exact argv, exits, counts and raw hashes. Runtime receipts: Node26.8.1, exact24.0.0, npm11.19.0, TypeScript7.0.2, Python3.14.7. Tests ran sequentially with childumask0022 and evidence0077, isolated Admission.forTesting plus explicit CURRENT fake runner/opener/source/host. Real process composition was exercised only with injected fake child launch.

Coverage: config99.57%lines/88.24%branches; schema100/100; allocator98.58/89.76; overall99.12/90.24. Every file exceeds80/70. coverage-audit.md reads each uncovered line individually. matrix.md extends earlier H01/H03/H04/H05/H06/H07 assertions: both sources, capacity7/8/9/bytes/free space, metadata/artifacts, protected IDs, unknown creation, all-phase cancellation, shared deadlines/finalization, fresh-process consume/history, expiry/shutdown and unavailable storage.

## Repairs and preserved history

Round2's exact six files,556/147/1355 gates and reports remain unchanged in ../review-repair; its acceptance was BLOCKED by healthy preparing retirement incorrectly returning STORE_UNAVAILABLE. original-review.md and original-retire-preparing.log preserve that independent P2.

Authored pending-boot regression reproduced it (red-retire-preparing.log,7pass/1fail,EXIT1). Narrow repair accepts preparing busy context only for retirement; cancel still requires executing. The preparing message directs allocation cancellation; executing retains action cancellation. Seven pending-boot cases assert verified or safely unavailable identity/state/evidence, unchanged bytes/record/calls, no cancellation, and original job completing ready. A forged preparing busy-cancel view remains refused. Root clarification `459dafc252c5c43e4674d8f8265f8427b75c601b` governs this boundary.

Original516, round1 520/111/1319 and round2 556/147/1355 evidence/maps remain distinct. Genuine cancellation-store failure and10141ms sequential finalization reds, harness-only interrupted coverage, test-only binding/typing errors, all five prior Spec failures and fixes remain archived; no skipped/weakened assertion or raised target timeout. Independent final reports: spec-review.md and standards-review.md; all six exact frozen blobs verified, no remaining Spec finding/documented Standards breach. Original optional timeout-mapping advisory is nonblocking. Simplify unavailable, not run; local maintainability review and Root independent review used.

## Limits and handoff

Directory evidence pointers identify the actual durable association, not diagnostic file existence/completeness. Required active diagnostic failure quarantines; unknown creation guards/capacity and late operations cannot promote authority. Historical readOnly/historicalOutcome, null reason and zero new reservation preserve old exclusions; only proven current quarantine lowers disposition.

Actual production metadata/backend/device/native settlement, production migration, public CLI/MCP/packaging and live validation remain UNVERIFIED. Owner's explicit liveiOS27.0 remains fixed and absent; HOST_PREREQUISITE_MISSING before reservation, no fallback/install. Historical unintended backend incident remains UNVERIFIED independently of these fake-only gates. Source edits stop after the focused commit for Root's commit-blob association and integration.
