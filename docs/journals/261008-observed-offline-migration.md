# Observed rollout — offline migration

## Context

Ticket02 follows the accepted admission core. The agent used Cook, TDD, codebase-design, worktree isolation and do-test; review repairs also used diagnosing-bugs. Root coordinated independent Spec and Standards reviews.

## What happened

The importer preserves historical records and source hashes, conservatively combines aliases and uncertainty, reserves historical action identities, assigns read-only allocation IDs, and records explicit operational declarations. A packaged maintenance command establishes the installation marker and transactional manifest; initialized storage is never silently recreated.

Independent review found a blocking FIFO open and a source-validation ordering gap. An ancestor-permission reproduction extended the latter finding. Regression tests and fixes closed both. The closure-only use of a prior verified manifest is documented in the [review report](../../.scratch/observed-integration/acceptance/host/migration-review.md).

## Verification and limits

Integrated `60efe5f` passed1091 full-suite tests, typecheck/build and126 combined focused tests on minimum Node24.0.0. All tests used isolated stores and fake effects. No production store, app or device was changed. Quiescence remains an operational assertion; migration does not fence older/external tools or prove native release. Whole-root deletion and old-backup restoration remain outside detection.

## Next

Transfer admission ownership to the allocation-store agent. Its narrow methods must cover reservations, creation guards, parked transfer, cancellation and joint terminal disposition, plus durable evidence/export projections. Driver integration follows after that store is reviewed and integrated.
