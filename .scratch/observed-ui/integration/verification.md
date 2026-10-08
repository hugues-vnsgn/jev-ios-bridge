# Observed action integration verification

Verdict: PASS for the bounded live fixture and host regression matrix.

## Failure and fix

The pre-fix observed CLI returned inconclusive after one acknowledged semantic tap
and 19 real captures without navigation. A direct AXe selector tap at the correct
point also returned success without navigation on a second fresh simulator.
The existing vendor touch-down/up path with a 50ms hold reached Details. This
isolates a working alternative path, not the exact internal OS cause of the no-op.

Experimental `MobileBuildMcpDriver.tapOnce` now requires tap and touch capabilities
and submits one vendor `touch` request with both down and up. There is no retry,
selector fallback or near-expiry refresh. Ordinary `act` behavior is unchanged.
No new dependency, system entitlement, direct AXe transport or app SDK was added.

## Host checks

- `tests/observed-touch-integration.test.ts` against f91ada4: two failing assertions
  (wrong command and missing touch-capability refusal), one pass. [Red log](touch-red.log).
- Same tests after fix, experimental suites and existing driver/lease regressions:
  pass. [Targeted log](touch-green.log).
- `npm run check`: 965 tests passed, zero failed/skipped; typecheck and build pass.
  [Full log](check.log).
- Independent Spec and Standards reviews: zero material findings, each independently
  ran 23 affected tests. No reviewer performed device operations.

## Live checks

The user-selected Orca Codex pane was the sole live operator. Supervisor inspected
all four saved harness outcomes/command ledgers and the ordinary/loss Details JPEGs.

| Case | Actual backend input | Runner result | Durable outcome |
| --- | --- | --- | --- |
| Ordinary navigation | One touch; zero semantic taps | outcome_observed, two captures | completed |
| Already satisfied | Zero touch/tap | already_satisfied, one capture | completed |
| Controlled reply withholding | One real touch | inconclusive, acknowledgement withheld | uncertain + quarantine |
| Fresh successor process | Zero backend commands of any kind | refused before preparation | quarantine retained |

Full command/response, screenshot, fixture and runtime provenance:
[live report](../live/report.md). The loss harness captured Details after the real
response, then withheld that response at the driver wrapper. Its extra read-only
captures are diagnostic activity, not runner actions after an unknown backend
outcome. This is not a test of native transport loss or native contact release.

## Remaining limits

Three owned test simulators are retained with uncertain records; no historical
study device was reused. This evidence covers one local navigation fixture on
one runtime/device type, not arbitrary apps. Production script/MCP integration
and automated disposable-device provisioning remain outside this change. The
23 native-certification tickets are not accepted by these different guarantees.
