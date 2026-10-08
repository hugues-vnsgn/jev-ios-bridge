# Evidence-directory overlap repair — accepted

Root candidate and integration commit: `d0a6d7efef9fc0d55324e3803207fb2dffdfaf18`, parent `fd056b5b550d43710c095de105fd3e74c4516e20`. Integration fast-forwarded to the exact reviewed commit. Only `src/observed/evidence.ts` and `tests/observed-evidence.test.ts` changed.

## Defect and repair

Ticket08's original composed allocator/action case failed: allocation preparation had already created the shared action directory, so action evidence preparation threw `EEXIST` before attachment or capture. The ready allocation was consumed into committed inconclusive instead of already-satisfied. [Original worker reproduction](evidence-overlap/author/original/evidence-overlap-repro.log) and [Root unchanged reproduction](evidence-overlap/author/root-original-repro.log) remain preserved.

The writer now accepts only directory-creation `EEXIST`, then performs its existing absolute/private/owner/no-symlink validation and exclusive request-file write. It neither replaces evidence nor changes admission authority. [Composed regression red](evidence-overlap/author/composed-regression-red.log) and [same-test green](evidence-overlap/author/composed-regression-green.log) establish one observation, zero input, no repeated preparation and unchanged readiness evidence.

## Standards

**PASS**, zero documented breaches and zero new named smells. The reviewer authored no part of this repair. [Independent report](evidence-overlap/review/standards/review.md); [exact commit association](evidence-overlap/review/standards/commit-association.md). This axis inspected author test evidence and did not independently rerun tests.

## Spec

**PASS**, no findings. Independently reran 9/9 evidence tests on Node 26.8.1 and exact 24.0.0, zero skips. An additional unchanged concurrency probe fails on the exact base and passes on the repair: one request publication, a competing `EEXIST`, preserved readiness bytes and mode 0600. [Independent report](evidence-overlap/review/spec/review.md); [exact commit association](evidence-overlap/review/spec/commit-association.md). Scratch probe setup errors remain separate from behavioral red evidence.

## Root checks

| Check | Result |
| --- | --- |
| Four focused evidence/runtime/allocator suites, Node 26.8.1 | 225/225, zero skips |
| Same four suites, exact Node 24.0.0 | 225/225, zero skips |
| Changed evidence-module coverage | 225/225; 100% lines, 97.67% branches, 100% functions; no uncovered lines |
| Complete serialized tests and typecheck/build | 1428/1428, zero skips; typecheck/build pass |
| Separate `npm run check` recheck on exact candidate | 1428/1428, zero skips; typecheck/build pass |
| Integration checkout evidence tests, both runtimes | 9/9 each, zero skips; typecheck/build pass |
| Integration source audit before/after | All 21 runtime/allocator files match their accepted mappings, with only the two reviewed repair mappings substituted |

The complete checks ran in Root's isolated repair checkout. The integration checkout is the identical commit, rather than a new merge composition; its physical files and committed blobs were audited and its affected tests rerun. [Author commands and raw logs](evidence-overlap/author/); [integration commands and hashes](evidence-overlap/integration/); [frozen two-file manifest](evidence-overlap/author/final-source.json).

## Preserved failure and limits

The first default full run passed 1427/1428. The unchanged boot-polling test expected exactly two polls within 1100 ms but observed one. It passes unchanged in isolation on both runtimes. A separate controlled fake probe shows a delayed first response can consume enough of the same budget to permit only one poll; this is consistent with the full failure, whose response timings were not recorded. Allocator source, test and fixture blobs are unchanged. No assertion or timeout was altered. [Original full failure](evidence-overlap/author/full-check.log), [unchanged isolated checks](evidence-overlap/author/unchanged-polling-node26.json), [controlled diagnostic](evidence-overlap/author/poll-budget-probe.json), [complete serialized result](evidence-overlap/author/serialized-full-tests.json) and [separate full recheck](evidence-overlap/author/full-check-recheck.json) remain distinct. The timing-sensitive assertion may recur under load.

The initial directory probe import-path error is also retained separately from its corrected product red/green. This accepts only the bounded repair. Ticket08's original public cases must be rerun unchanged after its dependency update. H01–H09, live cases and final safety review remain UNVERIFIED. No production store, device, migration or secret operation occurred.
