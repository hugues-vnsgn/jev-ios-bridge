# Phase 1 device-root follow-up review, 2026-10-18

Reviewed the owner's scoped working-tree diff against `51884bb1b180b3acbd1b3a4fd6b9ab0351234d63` on `feat/appium-mcp-migration`. One reviewer performed both axes, as authorized. Authority: the full `phase1-finish-plan-20261018/brief.md` and the later exact private-device/root instructions supplied with this review. Unrelated deletions were excluded.

## Standards

**No findings; no P1/P2 issues.** The scoped change conflicts with no applicable documented repository standard. The code-review smell baseline produced no actionable finding.

The classification remains in `candidate-stack/experiments/process-ownership.py`. Lines 50 through 67 validate the private set, exact UDID, parent PID, executable and argv while checking the root incarnation before and after inspection. Lines 155 through 168 keep WDA runners, XCTest executables and executables within the WDA bundle outside the device-internal exemption. Device-internal rows are explicitly excluded from owned automation. The verifier retains quarantine on inspection exceptions and requires positive absence or zombie evidence for an unreadable exiting child; lookup failure alone does not qualify.

Read both the supplied `.audit` host log and its retained copy, [phase1-device-root-host-tests-20261018.log](phase1-device-root-host-tests-20261018.log): 18 passed, zero failed. The added host case covers the bound tree, foreign set/UDID, an outside unmarked candidate, all three automation exclusions, positive absence and an unreadable live child. This review ran no additional tests or native operations.

## Spec

**No findings; no P1/P2 issues.** The new classification implements the owner's narrow device-root exception without granting signal ownership. The first normal boot's [root receipt](live-protocol/phase1-ios-normal-device-root-20261018/device-root.json) records PID 8333, its incarnation, and argv containing the exact private set and `15013501-2535-42EB-A67F-45B015DF18F4` path.

The retained receipts support normal and lost-create retry qualification: closed journals, complete automation fences while the simulator remained running, verified post-stop scans, and later private shutdown. Normal's final scan contains 207 device-internal rows and zero unknowns. The first lost-create failure retains active unreadable candidate 19371 with null incarnation; its correction requires targeted positive absence/zombie proof, followed by one qualifying retry with all 16 case checks true.

Lost-action retains one uncertain creation and no input. Host cleanup verified, but its native fence and private shutdown did not. The [private cleanup retry](phase1-private-cleanup-retry-20261018.json) repeats the exact private-set `simctl list devices -j` timeout after 15 seconds. The matrix and result report retain `IOS_PRIVATE_SIMCTL_UNRESPONSIVE`, block the three successors and report **NO-GO, 8/12**. Six earlier Android passes remain indexed; GO still requires 12/12.

All four new attempt directories retain 23-file source snapshots, 23 component records, owner receipts, command journals, case checks and vendor logs. The failed attempt remains indexed. The report distinguishes the earlier checks from this follow-up's 18/18 host result and makes no Phase 2 GO or production lease-release claim.

Standards: 0 findings, no worst issue. Spec: 0 findings, no worst issue. The operational blocker remains open.

Accounting source for the parent: `/Users/hugues_mini/.codex/sessions/2026/10/18/rollout-2026-10-18T23-28-05-01a14fd7-7fbb-72f3-87e8-d50a0c24e4b8.jsonl`. Final token counters are to be read after this reviewer finishes.
