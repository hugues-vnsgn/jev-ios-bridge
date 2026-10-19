# Package 1C combined review

Reviewed the explicit paths against `160870ff3`, including packages 1A/1B and the uncommitted freeze changes. No device commands or extra experiments ran.

## Standards. PASS

No P1/P2 documented-standard violations or actionable baseline smells found. The changes stay within the authorized integration and private-device restoration scope. Tooling-enforced nits were suppressed.

## Spec. FAIL

- **P1. Shared-service exclusions do not constrain signals.** `.scratch/appium-mcp-migration/candidate-stack/experiments/stop-group.py:70` calls `killpg` after checking that any member has a recorded incarnation. It never proves every member eligible or checks the shared-service exclusions recognized by `process-ownership.py:85`. The client invokes it unconditionally at `live-protocol-client.mjs:152`, even when the snapshot identifies an excluded service. Consequently an excluded ADB/CoreSimulator service sharing that group receives SIGTERM/SIGKILL. `stop-native-children.py:23` also admits every launch receipt and signals it at line 45 without honoring snapshot exclusions. Preserve shared services in both paths; prove eligibility for every group member or stop only individually attested eligible members. This violates the specification's explicit pre-group-signal exclusion rule.

- **P2. Coverage is verified before the platform fence.** `live-protocol-client.mjs:155` performs its only final host scan before `fence-owned-automation.py` runs at line 157. Lines 160 through 164 then use that earlier result to record `completeCoverage` and `fullNativeFenceProven`. The required post-fence inventory therefore never occurs. Native work still awaiting the fence can also make this early verification fail. Move the single final verification after the native fence, before admitting the fence receipt. Keep failed inspection and unresolved unknown/unreadable candidates quarantined; a failed identity lookup does not prove absence.

## Gate evidence

Read the supplied logs. Focused 1A passed 14/14; 1B passed 5/5; native-owner retry passed 125/125; startup passed 2/2. WDA, iOS and Android builds completed successfully. The completed full Node recheck passed 2289/2290; its cancellation failure subsequently passed the exact isolated retry, 1/1. This is not a clean initial full pass. Earlier fixture failures and the unsuccessful Node-only admission attempt remain recorded in the freeze; the corrected tsx admission retry passed. No matrix case has qualified this freeze.

Two Spec findings remain open. Standards has zero findings. Model and reasoning were inherited from the parent, with maximum effort requested; exact runtime model ID and token usage are unavailable.

## Closure after the bounded fix

Standards PASS. Spec PASS. Remaining P1/P2 findings 0.

P1 closed. `stop-group.py:74` rejects shared services and requires every member's retained incarnation evidence before signalling. `stop-native-children.py:40` preserves shared services during individual stops.

P2 closed. `live-protocol-client.mjs:164` now verifies after the native fence and before receipt admission. The verifier requires completed prior inspection and positive absence of earlier candidates; live unknowns, unreadable unresolved candidates and incomplete inspection retain quarantine.

Read `1C-review-regression-red.log` (three regressions failed before correction) and `1C-review-fix-retry.log` (22/22 passed). No new P1/P2 regression found. Initial findings and failure history above remain retained. Reviewer token counters are unavailable.
