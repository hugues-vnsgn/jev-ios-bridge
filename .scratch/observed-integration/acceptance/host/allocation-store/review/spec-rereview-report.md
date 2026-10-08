# Independent Spec repair review

**PASS — the previous P1 is closed; no remaining finding in this bounded repair.**

Reviewed `c8930102e6f04218f3097bb937434095521a9782...a427cc6bd3bb08c966e16003325de6b0d679bc02` (four files, +42/−10). `src/device/admission.ts:130` now rejects prior claim closure, cancellation, and parent-reservation closure before the park transaction. This preserves admission-decision line 155: failed terminal persistence leaves admission unavailable until conservative recovery, rather than enabling new authority. The SQLite helper substitutions preserve missing-device and unknown-creation responses.

Independent fake-effects/isolated-SQLite evidence:

| Cases | Required behavior | Result |
| --- | --- | --- |
| Failed cancel, reservation.fail, finalize, park before COMMIT | Subsequent park DISPATCH_CLOSED; consume ALLOCATION_NOT_READY; zero effects; conservative finalize quarantines | 4/4 PASS |
| Lost replies after committed cancel, reservation.fail, finalize | Subsequent park denied; consume denied; zero effects; quarantine retained/available through conservative finalization | 3/3 PASS |
| Lost reply after committed park | Old handle rejects another park; authoritative read preserves ready; exactly one new action owner may consume | 1/1 PASS |
| Existing transfer/creation tests plus four added regressions | Guard, normal transfer, and repaired failure behavior preserved | 6/6 PASS, zero skips |

Fresh raw artifacts: `spec-rereview-revoked-park.mts`, `spec-rereview-revoked-park.log`, `spec-rereview-focused.log`; both commands exit 0 on Node 26.8.1. The original reproduction/report/log remain untouched.

Read repair report and red/green logs: four regressions previously failed and now pass. Read runtime/suite logs showing 138/138, zero skips, on Node 26.8.1 and exact 24.0.0, plus passing typecheck/build logs. These full runs are author evidence; the 8-case script and 6-test run are independent evidence.

No source edits, production state, real migration, devices, credentials, or build rerun. Verdict is limited to this repair and its affected transitions; downstream installed/public/live acceptance remains outside scope.
