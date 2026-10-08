# Independent Spec review — ticket 03

**BLOCKED — one P1 correctness finding.** Reviewed `dc31c577a30b2aca0c8638f03420fd05b611dce7...c8930102e6f04218f3097bb937434095521a9782` (one commit, six paths, +999/−8), with source unchanged.

**P1 — revoked preparation can regain transferable authority through `park`.** `src/device/admission.ts:129–132` calls `parkAllocation` without checking the claim's existing local closure/cancellation or `parentClosed()`. Admission decision line 155 requires: “If the transaction is not durably established, the old active record keeps admission closed; explicitly quarantine when the store recovers.” Line 149 also requires that resumed continuations cannot dispatch after cancellation.

Reproduction: complete fake boot/install/launch/readiness; inject a `beforeCommit` storage failure into `claim.cancel()`; restore storage; call `claim.park()`, consume, and dispatch a fake tap. The original driver correctly rejects dispatch as closed, but parking commits `ready`, consumption succeeds, and the new action executes one effect. The same bypass follows failed `reservation.fail('PREPARATION_UNCONFIRMED')`. Both failures leave the old durable preparation active, so the SQL checks accept the late park. Reject parking from a previously closed/cancelled claim or closed parent before attempting its transaction; retain conservative finalization/recovery capability.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Reviewed reservation, immutable identity/source/budgets, exclusions/unknown creation, transfer, TTL/cancel races, evidence/outcome/export, explicit recovery | No other source defect found | Pinned source and accepted contracts |
| Existing isolated allocation suite | 49/49 PASS; no skips | `spec-review-focused.log` |
| Normal park control | PASS | `spec-review-revoked-park.log` |
| Failed cancel / failed terminal write followed by park | FAIL; safety assertion exits 1 | `spec-review-revoked-park.mts`, `spec-review-revoked-park.log` |

Read author logs: 134/134 on Node 26.8.1 and 24.0.0; typecheck/build passed. Independently ran focused tests/reproduction on Node 26.8.1. No live operations, production store, real migration, credentials, source edits, or build rerun. Downstream installed/public/live acceptance remains outside this bounded review.
