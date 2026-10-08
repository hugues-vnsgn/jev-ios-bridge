# Allocation-store independent review

2026-10-08. Candidate `c8930102e6f04218f3097bb937434095521a9782`, base `dc31c577a30b2aca0c8638f03420fd05b611dce7`. Six authorized paths, +999/−8. Source is not integrated. All review tests used isolated SQLite and fake effects; no production migration or device operation occurred.

## Standards

Reviewer `allocation_standards_review`, gpt-6.1-sol/high, code-review skill. No documented standards/ADR breach or changed descriptor/private-file-mode defect found. One nonblocking possible Duplicated Code smell: `admission-sqlite.ts:390–394` adds `deviceView` while `inspect` at565–570 repeats the same projection; reservation's creation-guard query at538–539 duplicates `creationGuard` at273–275. Reuse those helpers within the existing transaction boundaries.

Reviewer read raw author logs: both test runs show134 passes, zero failures/skips. Compilation logs contain commands without diagnostics but do not separately record exits; Root's forthcoming integrated checks will record command exits. Root independently recorded Node26.8.1 and24.0.0 in [runtime-versions.json](allocation-store/runtime-versions.json). Simplify was unavailable and was not run; independent maintainability review was completed.

Standards: zero documented breaches, one minor duplication smell.

## Spec

Reviewer `allocation_spec_review`, gpt-6-astra/high, code-review and do-test skills.

**P1: revoked preparation can regain authority through park.** `admission.ts:129–132` calls parking without checking prior local closure/cancellation or `parentClosed()`. The admission decision requires failed durable transitions to keep admission closed pending explicit recovery/quarantine. Complete preparation, inject a before-COMMIT fault into either `claim.cancel()` or `reservation.fail('PREPARATION_UNCONFIRMED')`, restore storage, and call the old claim's `park()`: candidate commits ready, a new consume succeeds, and a fake tap executes. The old driver's dispatch is already fenced, confirming that parking bypasses its fence.

The independent existing allocation suite passes49/49, zero skips. The added safety reproduction fails with exit1. [Raw review report and reproduction](allocation-store/review/spec-review-report.md) preserve the finding. No other source defect was identified within this bounded review.

Spec: one finding, worst P1; BLOCKED pending repair and independent re-review.

## Disposition

Root assigned the confirmed P1 and small duplication cleanup to the allocation-store owner with diagnosing-bugs, TDD and do-test. Genuine pre-fix red, post-fix green, Node24/26 dependency suites, compilation and independent re-review are required. Ticket05 implementation remains gated on accepted integration; its read-only interface compatibility pass found no missing capability. Full H01–H09 and live acceptance remain UNVERIFIED.
