# Ticket 03 revoked-park repair

Verdict: PASS for the bounded repair, pending independent re-review. Repair base: `c8930102e6f04218f3097bb937434095521a9782`; original ticket base: `dc31c577a30b2aca0c8638f03420fd05b611dce7`.

Independent Spec finding P1 is addressed: `OwnedClaim.park()` now refuses an already closed/cancelled handle or closed parent reservation before its transaction. A failed closure write can leave durable preparation active, but cannot recreate transferable authority after storage recovers. Conservative `finalize()` remains available and commits quarantine. No interface additions, generic release, recovery authority change or guard clearing were introduced.

The focused regressions reproduce both reported cases and equivalent failed finalize/park writes. Against the pinned pre-fix source, all four reached consume and one fake tap (exit 1, four failures). With the guard, all four yield DISPATCH_CLOSED, ALLOCATION_NOT_READY and zero later effects, then successfully commit conservative quarantine (exit 0, four passes).

| Scenario | Evidence | Result |
| --- | --- | --- |
| Failed claim.cancel persistence cannot enable park/consume | repair-revoked-park-red.log → repair-revoked-park-green.log | PASS |
| Failed reservation.fail persistence cannot enable park/consume | Same | PASS |
| Failed claim.finalize persistence cannot enable park/consume | Same | PASS |
| Failed claim.park persistence cannot enable repeated park/consume | Same | PASS |
| Existing normal park, cancellation, TTL, transfer, immutable terminal and recovery behavior | repair-node26.log, repair-node24.log | PASS |
| Standards duplication | inspect delegates to deviceView and normalizes missing result to undefined; reservation delegates to creationGuard; full focused suites | PASS |
| Compilation | repair-typecheck.log, repair-build.log | PASS |

Commands and observed results:

- `node --import tsx --test --test-name-pattern='revoked preparation cannot park' tests/admission-allocation.test.ts`: before repair, exit 1, 0 passed/4 failed/0 skipped; after repair, exit 0, 4 passed/0 failed/0 skipped.
- `node --import tsx --test tests/admission-core.test.ts tests/admission-migration.test.ts tests/admission-allocation.test.ts`: Node v26.8.1, exit 0, 138 passed/0 failed/0 skipped, 22.21 seconds. Raw `repair-node26.log`; runtime `repair-runtime26.log`.
- `npx --yes --package=node@24.0.0 node --import tsx --test tests/admission-core.test.ts tests/admission-migration.test.ts tests/admission-allocation.test.ts`: Node v24.0.0, exit 0, 138 passed/0 failed/0 skipped, 22.96 seconds. Raw `repair-node24.log`; runtime `repair-runtime24.log`.
- `npm run typecheck`: exit 0, `repair-typecheck.log`.
- `npm run build`: exit 0, `repair-build.log`.
- `git diff --check`: exit 0.

The independent review report and reproduction artifacts remain unchanged. No full unrelated suite, live device operation, production store, real migration, secret access, merge, push or publication was performed. Evidence remains untracked. Root owns independent re-review and integration.
