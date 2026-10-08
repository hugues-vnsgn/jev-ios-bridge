# Shared driver independent review

Verdict: PASS after repair, independent re-review and Root integration checks. Candidate `2ec78bdcc01a6f5a809022a921faf3fc2766e445` and repair `6f0ad209d4255713d36da52ccc6b278c2ebac98a` are integrated as `b3eb5ea` and `bd5d524`. Base: `b70a7ab3883dfb1530918f16cc39324b1662f91e`. [Original author evidence](shared-driver/report.md) and [source metadata](shared-driver/author-source.json) preserve the earlier checks, failures and final-test drift.

Root's exact integrated revision `bd5d5247421b78dde2a6a741f1f4769c673669fc` passed `npm run check`: typecheck,1196/1196 tests, zero skips and build. Exact Node24.0.0 combined store/adapter/driver suites passed410/410, zero skips. Checked source/test blobs match the repaired candidate. [Commands, raw output and hashes](shared-driver/integration/).

## Standards

Reviewer: `observed_runtime`, temporarily assigned this independent axis before authoring ticket06. No documented Standards breaches.

Confirmed final-candidate regression: `tests/admission-driver.test.ts:318` adds an unused factory import inside the child eval source. From its repository-root working directory, `../src/device/factory.js` resolves outside the worktree and fails with `ERR_MODULE_NOT_FOUND`. The isolated fake test `a separate process consumes parked driver readiness` failed on Node26.8.1:1 failed, zero skips, exit1. [Raw reproduction](shared-driver/review/standards-transfer-red.log). Remove only the unused child import and preserve the test module's factory import.

Possible Duplicated Code/resource-lifetime smell: signal-listener cleanup repeats in parking, owned admission finalization and successful local close. Uncertain external-claim close calls `finishAdmission`, which returns early because the driver does not own finalization, leaving the permanent attachment listener. A shared local cleanup helper can remove listeners independently of claim ownership while retaining quarantine and tracking pending work. This is a source-based heuristic; no independent leak test was run.

The recorded full suite passed1166/1166 on the earlier test blob; recorded201/201 focused checks also preceded final test edits. Later boundary runs omit the broken transfer case. Typecheck/build/coverage pass. No candidate edits or live operations were made. Simplify was unavailable and did not run.

## Spec

Reviewer: `capacity_spec_review`, who authored no implementation. One P1 finding.

Malformed selected-device list entries still authorize launch. `src/device/index.ts:140` accepts any simulator array; lines825-826 convert selected `state:123` to undefined, allowing the warning path and launch. Root's authorized oracle requires malformed selected-device lists to close dispatch with zero launch and preserves warning behavior only for valid listings missing the selected identity. Ticket05 also requires malformed terminal payloads to revoke issuance.

An isolated fake runner/opener and test store returned a selected record with numeric state. Preparation resolved; calls were `list, launch-app`; admission remained active. The strict assertion failed on Node26.8.1, exit1. [Reproduction source](shared-driver/review/spec-list-repro.mjs) and [raw output](shared-driver/review/spec-list-red.log). Validate used listing fields before acknowledging dispatch and cover malformed selected entries separately from missing identities.

The reviewer inspected contracts/ADRs, pinned diff, blob identities, raw gates, boundary additions, coverage and incident record. No full suite or live operation was rerun. Total readiness time depends on the allocator supplying one stage-deadline signal across internal commands; Root carries that requirement into ticket07 dispatch.

## Repair dispatch

Root returned only `src/device/index.ts`, `tests/admission-driver.test.ts`, `tests/simulator-window.test.ts` and ticket05 comments to the driver owner for these findings. Required: genuine red/green for both confirmed failures; a listener-lifetime reproduction if that heuristic is repaired; exact final-source focused checks on both runtimes, typecheck/build and a new full check after all source/test changes. Re-review and integration remain pending.

The initial old-constructor real launch/list incident on a synthetic UUID remains UNVERIFIED for side effects because raw vendor output was not retained. Its original log and disclosure stay unchanged; no cleanup or diagnostic device call was used to resolve it. Fixed-candidate host assertions cannot certify that historical event.

Summary: Standards0 documented breaches,1 confirmed test regression,1 possible resource-lifetime smell; Spec1 P1 finding.

## Standards re-review

PASS at repair `6f0ad209`, against parent `2ec78bd` and original base `b70a7ab`. No hard documented breaches; four authorized files only.

R1 closed: the unused child import is removed and the module import remains. The reviewer independently reran the exact separate-process transfer test on Node26.8.1 and exact Node24.0.0:1/1 each, zero skips. [Node26](shared-driver/review/standards-transfer26-green.log), [Node24](shared-driver/review/standards-transfer24-green.log).

C1 closed: `clearSignalListeners()` runs independently of claim ownership, including failed close and parking. Independent uncertain-close and normal park/close checks passed4/4 on each runtime, zero skips, preserving pending backend work, unchanged lease bytes after late settlement and zero follow-up commands. [Node26](shared-driver/review/standards-listeners26-green.log), [Node24](shared-driver/review/standards-listeners24-green.log).

No remaining named smells/regressions in the bounded repair. The reviewer read final220/220 focused checks on both runtimes, full1185/1185 plus typecheck/build, coverage220/220 and the matching final hash manifest. Broader gates were inspected, not independently repeated. No source or production/device operations. Simplify did not run. The historical incident remains separately UNVERIFIED.

## Spec re-review

PASS: R2 closed; no remaining bounded-repair findings. Original/fix HEAD and checked blobs match repair evidence.

The original numeric-state reproduction now exits0 with only `list`, rejection and quarantine. Validation precedes admitted settlement; malformed/missing list fields and error receipts reject, while valid empty/missing-selected behavior remains. [Original reproduction on fixed source](shared-driver/review/spec-list-green.log).

Independent admission-driver/simulator-window suites passed53/53, zero skips, including cross-process transfer and external uncertain close. [Raw affected suite](shared-driver/review/spec-affected-green.log). The helper removes listeners while preserving uncertainty, retained lease, external finalization ownership and underlying tracking. R1 removes only the erroneous child import.

The reviewer read final focused220/220 on both exact runtimes, full1185/1185 plus typecheck/build, coverage220/220, checked hashes and diff formatting. Full/minimum-runtime suites were inspected rather than independently rerun. No product edits or production/device calls. Aggregate readiness deadlines remain allocator-owned through a shared stage signal. The historical incident remains UNVERIFIED.

Current summary: Standards0 remaining findings; Spec0 remaining findings. [Corrective author report](shared-driver/repair/report.md). Complete H01–H09 and live acceptance remain pending.
