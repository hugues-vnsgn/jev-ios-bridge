# Phase 1 result, 2026-10-19

**GO. All twelve cases qualify: Android 6/6 and iOS 6/6.** The four remaining iOS cases passed after the owner's reboot recovery. The eight earlier qualifying cases were retained without rerunning them. No Phase 1 blocker remains.

## Case index

| Required case | Android | iOS |
| --- | --- | --- |
| Normal | [Pass](evidence/live-protocol/phase1-android-normal-20261018/case-check.json) | [Pass](evidence/live-protocol/phase1-ios-normal-device-root-20261018/case-check.json) |
| Lost creation reply | [Pass](evidence/live-protocol/phase1-android-lost-create-20261018/case-check.json) | [Pass on one retry](evidence/live-protocol/phase1-ios-lost-create-device-root-retry-20261018/case-check.json) |
| Lost action reply | [Pass](evidence/live-protocol/phase1-android-lost-action-20261018/case-check.json) | [Pass](evidence/live-protocol/phase1-ios-lost-action-post-reboot-20261019/case-check.json) |
| Cancellation after native dispatch | [Pass](evidence/live-protocol/phase1-android-cancel-20261018/case-check.json) | [Pass](evidence/live-protocol/phase1-ios-cancel-post-reboot-20261019/case-check.json) |
| Late reply | [Pass](evidence/live-protocol/phase1-android-late-action-20261018/case-check.json) | [Pass](evidence/live-protocol/phase1-ios-late-action-post-reboot-20261019/case-check.json) |
| MCP process failure | [Pass](evidence/live-protocol/phase1-android-process-failure-20261018/case-check.json) | [Pass](evidence/live-protocol/phase1-ios-process-failure-post-reboot-20261019/case-check.json) |

The [matrix index](evidence/phase1-matrix-20261018.json) records all twelve rows and earlier failures. Attempt directories retain client state, source snapshots, command journals, component receipts, native observations and vendor logs. The [freeze manifest](evidence/phase1-freeze-20261018.json) remains the source, version, artifact, device and budget record.

## Reboot recovery and final four cases

The owner attributed the earlier lost-action startup failure to a hung shared CoreSimulatorService and reported rebooting the Mac at about 07:45. The [post-reboot cleanup observation](evidence/live-protocol/phase1-ios-lost-action-device-root-20261018/post-reboot-cleanup-20261019.json) measured a 0.205-second private `simctl list`, confirmed `15013501-2535-42EB-A67F-45B015DF18F4` Shutdown and found both WDA ports closed. This verifies that attempt's later cleanup; its failed startup receipt remains unchanged. The owner authorized one fresh lost-action case.

Each new case waited for load below 8 and passed a private-set preflight within 15 seconds before booting. Each then passed all 16 checks, including cleanup, before its successor.

| iOS case | Pre-boot 1-minute load | Private simctl seconds |
| --- | ---: | ---: |
| [Lost action](evidence/post-reboot-20261019/preflight-lost-action.json) | 7.90 | 0.226 |
| [Cancellation](evidence/post-reboot-20261019/preflight-cancel.json) | 7.33 | 0.228 |
| [Late reply](evidence/post-reboot-20261019/preflight-late-action.json) | 6.46 | 0.211 |
| [Process failure](evidence/post-reboot-20261019/preflight-process-failure.json) | 6.22 | 0.132 |

No frozen runner change, rebuild or shared-service restart was needed. Late reply was not rerun after the model-capacity interruption. The final process-failure receipt verifies private shutdown and closed ports.

## Scope, checks and review

Every qualifying case records one creation, no replay, closed dispatch, host and recorded-child stopping, an on-device automation fence while the device remains running, one verified post-stop scan, and later private shutdown. Fault outcomes remain inconclusive with local refusal proved. Research journals retain quarantine and `leaseReleased: false`; Phase 1 GO does not release production leases.

The exact private `launchd_sim` subtree classification and WDA/XCTest exclusions remain as reviewed in the [coverage follow-up](evidence/phase1-device-root-review-20261018.md). Its host checks passed 18/18. Earlier host results, isolated retries and failures remain in the freeze and prior report commits; no host suite was repeated for this evidence-only follow-up. The [one combined Standards and Spec review](evidence/phase1-post-reboot-review-20261019.md) evaluates the final GO report.

Post-reboot 1D used 3,265,873 processed tokens, including 3,110,912 cached; uncached input plus output was 154,961. Cumulative 1D usage is 20,960,665 against its 250M cap. Post-reboot 1E report/review used 3,112,050 processed tokens at preparation, including 2,955,648 cached; uncached input plus output was 156,402. Cumulative 1E usage is 9,891,344 against its 50M cap. The combined review found zero Standards or Spec findings and no open P1/P2 issues. These counters are not subscription-quota charges.

Deferred race tests and accepted ticket 07 residual risks remain unchanged. Phase 2 was not started. Only explicit paths are committed; unrelated deletions, `AGENTS.md`, `__pycache__` and `.audit` are excluded. No other device was controlled, no shared service restarted, and no Jev call, push, PR, merge, tag or release occurred.
