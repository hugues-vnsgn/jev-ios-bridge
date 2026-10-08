# Allocator review

Verdict: BLOCKED pending the preparing-retirement repair, its frozen-source gates and both independent review axes. No ticket07 product commit is integrated.

## Spec axis

Round1: five confirmed findings in preflight identity conflict, creation-blocker evidence context, failure-evidence quarantine, executing busy context and immutable historical lookup. [Original report and unchanged probes](allocator/review/round1/spec/review.md).

Round2: all five originals pass5/5 on Node26.8.1 and exact24.0.0, zero skips. One P2 regression remains: verified busy enrichment accepts only executing and misreports healthy preparing retirement as storage failure. A fake pending-boot probe reproduces it while the original preparation completes. [Separate re-review, hashes and regression](allocator/review/round2/spec/review.md).

Root grants a narrow allocation source/schema/test repair to distinguish preparing retirement from executing cancellation. Preserve verified durable context, safe bad-read failures and the executing action cancellation direction. Preparation retirement must return truthful ALLOCATION_BUSY and may direct allocation cancellation. The original five probes and new reproduction remain unchanged.

## Standards axis

Round1: PASS, no documented breaches, one nonblocking possible Repeated Switches advisory about timeout-reason mapping. [Independent report](allocator/review/round1/standards/review.md). Re-review of the repair is pending. Simplify was unavailable and was not run.

## Checks and limits

Round2 author gates passed556/556 on each Node26/exact24, coverage147/147 and full1355/1355 plus typecheck/build, zero skips. These runs apply to the blocked round2 mapping, not the pending repair. Raw evidence will be copied with the final handoff without replacing original results.

Host checks use isolated stores and explicit fake runner, opener and source process. Root integration checks, H01–H09, public adapters, packed/plugin behavior, live acceptance and final safety review remain pending. The earlier unintended driver invocation has UNVERIFIED effects; these fake runs do not certify them. iOS27.0 remains the user's explicit live runtime prerequisite.
