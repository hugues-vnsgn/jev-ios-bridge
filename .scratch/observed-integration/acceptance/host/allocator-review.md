# Allocator review

Verdict: PASS for bounded ticket07 behavior after independent repairs and Root integration checks. Candidate `bfa73591673fb931d58df8e46f343700aae8a68a`, parent/dependency base `98f7de41baa316f47a65a7bc2160128a72051f3e`; Root integrated it as `6d5536a551df853dd92fdf63253c1bacc244263f`. Its seven-file scope contains six source/test files and its own ticket only.

## Spec axis

Round1: five confirmed findings in preflight identity conflict, creation-blocker evidence context, failure-evidence quarantine, executing busy context and immutable historical lookup. [Original report and unchanged probes](allocator/review/round1/spec/review.md).

Round2: all five originals pass5/5 on Node26.8.1 and exact24.0.0. One P2 regression remained: executing-only busy enrichment misreported healthy preparing retirement as storage failure. A fake pending-boot probe reproduced it while the original preparation completed. [Preserved re-review and regression](allocator/review/round2/spec/review.md).

Round3: PASS, no remaining finding in the repairs and changed boundaries. The six unchanged independent probes pass6/6 on each runtime, zero skips. Busy cancellation requires verified execution; retirement permits verified active preparation with truthful allocation-cancellation guidance. Invalid context still fails safely. [Independent final report](allocator/review/round3/spec/review.md) and [exact commit association](allocator/review/round3/spec/commit-association.md) verify all six committed blobs against the reviewed source.

## Standards axis

PASS, no documented breaches or new repair smell. The original nonblocking possible Repeated Switches advisory remains for timeout-reason mapping at allocation.ts105/115–116/163; a private helper is optional. [Original report](allocator/review/round1/standards/review.md), [repair review](allocator/review/round3/standards/review.md) and [final commit receipt](allocator/review/round3/standards/final-commit-receipt.json) remain a separate axis. Simplify was unavailable and was not run.

## Author checks and preserved history

| Source | Gate | Result |
| --- | --- | --- |
| Round1 | Focused Node26/exact24; coverage; full check |520/520 each;111/111;1319/1319 plus typecheck/build |
| Round2 | Focused Node26/exact24; coverage; full check |556/556 each;147/147;1355/1355 plus typecheck/build |
| Final round3 | Focused Node26/exact24 |564/564 each, zero skips |
| Final round3 | Coverage |155/155, zero skips;99.12% lines/90.24% branches |
| Final round3 | Full check |1363/1363, zero skips, typecheck/build PASS |

[Final author report, raw commands and hashes](allocator/author/round3/report.md). Original516 checks and all later rounds remain distinct. Genuine failed cancellation writes,10141ms sequential finalization and the preparing-retirement regression retain their red evidence. Interrupted coverage, shell preflight, binding-fixture and typing errors remain identified as harness/fixture history. Old green runs do not certify repaired source. All170 private author evidence files were copied separately without replacing prior Root or reviewer artifacts.

The accepted repairs revoke known local issuance despite cancellation-store failure, share one5000ms failure-finalization budget across tracked diagnostics/local close, and quarantine failed required evidence publication. Historical projections preserve durable identities/outcomes/exclusions, zero new capacity and no preparation permission. Directory pointers do not certify diagnostic file existence or completeness.

## Root integration and limits

The runtime/allocator structural interface compiles. Root's combined17-suite checks pass657/657 on Node26.8.1 and exact24.0.0, zero skips. Full `npm run check` passes1423/1423 plus typecheck/build. All21 runtime/allocator source/test hashes match their reviewed candidates before and after. [Raw integrated commands, type proof, counts and audits](allocator/integration/).

Host checks use isolated stores and explicit fake runner, opener and source process. H01–H09, public adapters, packed/plugin behavior, production migration, live acceptance and final safety review remain pending. The earlier unintended driver invocation has UNVERIFIED effects; these fake runs do not certify them. The user's explicit iOS27.0 live prerequisite remains fixed, with no fallback or installation dispatched.
