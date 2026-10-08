# Shared driver independent review

Verdict: BLOCKED at first review. Candidate `2ec78bdcc01a6f5a809022a921faf3fc2766e445` has not been integrated. Base: `b70a7ab3883dfb1530918f16cc39324b1662f91e`. [Author evidence](shared-driver/report.md) and [source metadata](shared-driver/author-source.json) preserve the original checks and final-test drift.

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
