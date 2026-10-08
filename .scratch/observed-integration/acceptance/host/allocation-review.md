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

## Repair re-review

Repair `a427cc6bd3bb08c966e16003325de6b0d679bc02` on `c893010` adds the pre-transaction closed/cancelled/parent-closed parking guard and removes the two duplicate helper projections. Four author regressions reproduced unsafe transfer before repair and pass afterward; dependency suites pass138/138 on Node26.8.1 and exact24.0.0, zero skips. [Repair evidence](allocation-store/repair/repair-report.md) remains separate from the original failed candidate.

Independent Standards re-review: PASS, no remaining findings. Helper reuse preserves existing read/write transaction boundaries, missing-device semantics and creation-guard refusal fields.

Independent Spec re-review: PASS, P1 closed. Eight independent before/after-COMMIT cases for cancel, reservation failure, finalization and parking pass, plus6/6 focused tests. Revoked claims cannot transfer authority or dispatch effects; conservative finalization still quarantines. A genuinely committed park survives lost reply and permits normal transfer. [Fresh re-review evidence](allocation-store/review/spec-rereview-report.md) preserves the distinction.

Both axes accept the bounded repair. Root integration and combined checks are next; full public/live acceptance is not claimed.

## Integration acceptance

Root integrated the candidate and repair as `009a798` and `a49abb710f47a8b5dd2daf24ae1e6e06f5b34f29`. Combined `npm run check` exits0:1144/1144 tests, zero skips, typecheck/build passed. Exact Node24.0.0 combined admission/migration/allocation/artifact/source suites exit0:179/179, zero skips. [Raw commands, exits and output](allocation-store/integration/) pin the integrated SHA.

The initial Root wrapper used umask0077 for evidence and unintentionally passed it to children. That changed deliberately unsafe0644/0755 fixtures into private files/directories, producing four expected-refusal assertion failures on both runtimes. A filesystem probe confirmed the masking; the unchanged four tests pass4/4 with child umask0022. Corrected complete runs pass, with evidence still private. Initial failures remain inspectable; no product code or assertion was changed for this harness error.

Ticket03's bounded store seam is accepted. Store ownership and typed capabilities may now be consumed by ticket05. H01–H09 public/installed gates, live acceptance and final safety review remain pending; no production state or device was operated.
