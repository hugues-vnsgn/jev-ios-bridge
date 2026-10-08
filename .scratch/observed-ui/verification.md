# Verification: observed iOS action experiment

Original host verification at f91ada4 follows. Live validation and its integration
fix subsequently passed on 2026-10-08; see [integration verification](integration/verification.md)
and [live report](live/report.md).

The user chose unmodified apps, visible outcome verification and honest uncertain
results. This change implements that alternative without an external provider
extension. It does not complete the old native-certification contract.

| Behavior | Evidence | Verdict |
| --- | --- | --- |
| Unique target, one attempt, visible result | observed-tap + observed-run tests | PASS |
| Already satisfied, duplicate target, invalid observation | zero-submit assertions | PASS |
| Stale vendor reference and near-expiry capture | real MobileBuildMcpDriver with injected CLI; one request, no refresh/reissue | PASS |
| Cancel/deadline/lost/late reply | no subsequent device callbacks, inconclusive/quarantine assertions | PASS |
| Durable intent before preparation | runner duplicate and claim-refusal assertions | PASS |
| Crash/restart and concurrent admission | filesystem journal plus actual abruptly exiting child process | PASS |
| Evidence/cleanup failure | forced screenshot failure and final-result path collision, successor refusal | PASS |
| Terminal authority | provisional artifact metadata and terminal journal; independent delayed-write reproduction | PASS |
| Legacy compatibility | full repository check: 962 tests, zero failures/skips; typecheck and build pass | PASS |
| Actual unmodified-app navigation and real lost reply | no simulator used; issue 04 names required experiment | UNVERIFIED |

Focused suites: 33 tests, zero failures/skips in [focused.log](focused.log).
Full command: `npm run check`, [check.log](check.log). CLI no-argument usage exits
2 and prints usage, [cli-usage.log](cli-usage.log). Host tests use injected device
responses and must not be described as native positive evidence.

## Review

Independent Spec review initially found two material defects: final evidence
publication after journal completion, and initial observation persistence failure
classified as refused. Both fixed and rechecked through real journal/filesystem
regressions. Standards independently confirmed the same defects and then found
a late-writer reporting mismatch. The evidence artifact now declares itself
provisional and provides a terminal journal locator; CLI success follows journal
completion. Both review axes end with zero unresolved material findings.

Meaningful red logs from implementation: [evidence](observed-evidence-red.log)
and [cancelled finalization](observed-finalization-red.log). Supervisor integration
regressions passed after those fixes; no claimed red from the earlier test-fixture
frame omission. Full tests were rerun after final report-shape changes.

## Limits

No new native ownership, consumption or release certificate exists. No causal
proof follows from observing a postcondition. The quarantine applies only to
this experimental runner, not other tools; it does not cancel native work or
reverse backend side effects. Automatic disposable-device provisioning remains
unimplemented. The historical retained study and its device were untouched.
The current live-study allocation must not be silently reused; issue 04 requires
an independently allocated dedicated device.
