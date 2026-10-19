# Phase 1 native protocol and fencing

Date: 2026-10-13
Fixed point: `35483a7c5fe92f81725330d45bdfee633ae8cf26`
Status: paused by owner; Phase 1 incomplete; no GO verdict

The tracer now uses the pinned public MCP client and public `appium-mcp/core`
extension on the dedicated iOS simulator and Android emulator. Production
drivers, dependencies, admission authority, and historical quarantines have
not changed. The published implementation request remains active beyond this
feasibility work.

## Owner stop and matrix state

The owner stopped work on 2026-10-13. The in-flight
`proof-ios-cancel-c-20261013` case finished its own cleanup. The matrix
controller was suspended to prevent another case, then terminated after its
child exited. No native action was killed to implement the owner stop.

Both private devices are shut down, with closed owned ports. They were not
erased or deleted. The final bounded host audit checked 1,158 recorded process
identities: none remained alive with the recorded incarnation. Its single
process scan found no process naming the private UUID, private set, private
Android serial, or owned automation ports. This stop audit does not reconstruct
lost ancestry and does not close the Phase 1 descendant-verification gap.
See the [iOS shutdown receipt](evidence/owner-stop-20261013/ios-shutdown.json),
[Android shutdown receipt](evidence/owner-stop-20261013/android-shutdown.json),
and [host audit](evidence/owner-stop-20261013/host-audit.json).

The latest corrected matrix stopped at the following state. "Passed controls"
means the recorded protocol/fault checks and scoped cleanup passed. It does not
mean Phase 1 or native gate 3 passed.

| Case | iOS | Android |
|---|---|---|
| Normal observe/action/check | Passed controls: `proof-ios-normal-20261013` | Passed controls: `proof-android-normal-20261013` |
| Lost creation reply | Passed controls: `proof-ios-lost-create-c-20261013` | Failed: `proof-android-lost-create-c-20261013`; reconciliation returned zero sessions where one was required |
| Lost action reply | Passed controls: `proof-ios-lost-action-c-20261013` | Did not run in this corrected matrix |
| Cancellation after native dispatch | Passed controls: `proof-ios-cancel-c-20261013` | Did not run in this corrected matrix |
| Late action reply | Did not run in this corrected matrix | Did not run in this corrected matrix |
| MCP process failure | Did not run in this corrected matrix | Did not run in this corrected matrix |

Earlier iOS late-reply and process-failure cases recorded passing controls;
earlier Android lost-creation and lost-action cases also recorded passing
controls. Their narrower source/provenance and verification boundaries remain
part of their evidence. They do not replace the missing corrected-matrix cases.
The [complete case inventory](evidence/owner-stop-20261013/matrix.json) records
all 35 native case results, including failures and incomplete case-end cleanup.
Raw replies, per-case frozen source records, component receipts, and native
observations remain under `evidence/live-protocol/`.

Failures retained in that inventory include XML-viewer parsing, effective
completion defaults, Android observer HOME resolution, competing preparation,
slow boot, APK-install timeout, missing-package cleanup, stalled global process
scans/fault barriers, and the latest Android reconciliation mismatch. Failed
cases are not converted to passes by the final stop audit.

## Open descendant-verification gap

`native-process-receipts.mjs` records children spawned directly by the MCP Node
process. An unrecorded grandchild can daemonize or leave the process group and
escape both those receipts and the group scan. Therefore receipts alone do not
prove that every owned automation component is inert. Gate 3 remains open for
every case, even where `releasePredicateRecorded` is true in the experimental
journal. Those journal receipts are provisional mechanism evidence and cannot
release production ownership.

A draft `verify-native-descendants.py` was written before the owner stop. It
has not been tested, integrated into cleanup, or used to qualify any matrix
case. It must not be treated as completed verification.

The next step, only after the owner resumes work, is to finish and test bounded
ancestry recording and one post-stop verification. Walk descendants of each
recorded root by parent/session identity and inspect commands naming the exact
private device identifiers, set path, serial, or owned ports. Persist the
result with cleanup, retain quarantine for any unverifiable component, and
never stop shared ADB or CoreSimulator services. Then resolve the Android
reconciliation failure and rerun the required matrix. Full adapter construction
remains gated on a reviewed Phase 1 GO report.

## Native protocol

A normal case checks server identity, required schemas, and frozen startup
selection before creating one explicitly owned session. It validates the
creation reply, reads and parses accessibility XML, requires exactly one
Apple button, sends one tap, checks a fresh `Selected: Apple`, validates an
inline PNG, and validates session deletion. Deletion is a terminal tool
response; it does not establish native release.

Live replies exposed two omissions in the earlier host fixtures. Page-source
results include an unconsumed HTML viewer beside the XML text. The parser now
accepts that specific resource and still refuses duplicate XML text. The
pinned gesture schema also inserts `maxScrollAttempts: 10`; the client now
sends that default explicitly so completion binds to the effective request.
Both corrections have controlled-provider tests. Failed native cases remain
recorded; their gestures were not replayed.

The persistent module recorder starts before vendor imports and covers imports
through session creation and actions. Each loaded file records its package,
version, file hash, and matching lockfile archive metadata. The frozen WDA
bundle is compared against all 47 files. Android compares the installed bytes
of both UiAutomator2 APKs and Appium Settings with the selected package files.
The receipt records the actual public-core driver constructor and native
automation identities. Earlier startup-only and incomplete bootstrap records
retain their narrower coverage.

## Closure and native fence

Each experiment uses a private, disposable command journal. It is not a second
production admission authority and cannot release a production lease.
Authorization commits before native dispatch. Closure commits before an abort
or intentional MCP termination. Lost creation reconciles one owned session
through the public inventory without sending another creation. Every fault
case exercises the local closed call path and verifies that neither its wire
request list nor command journal changes.

Host subprocess instrumentation persists a precise process incarnation,
executable hash, argument digest, owner identity, and command identity before
executing the native program. Recorded children remain stoppable after escaping
the MCP process group and after parent death. A host test verifies that this
stop leaves an independent process alive. Public Node process APIs are
instrumented before vendor loading; unrecorded `fork` is refused.

Cleanup closes dispatch, stops the owned host group, and stops each recorded direct
child using incarnation checks. Escaped grandchildren remain the open gap above. The platform fence then runs while the private
virtual device remains on:

- iOS attests the selected WDA bundle and terminates its recorded runner in the
  exact private simulator set. Eight observations require no WDA automation
  service and closed WDA/MJPEG ports on IPv4 and IPv6.
- Android attests its installed automation APKs, stops and disables only those
  three packages, and removes only matching owned forwards on the exact serial.
  Eight observations require no automation processes and closed ports; the
  input dispatcher must report no displays touched.

The combined host, child, and native receipt is durably written and hashed
before the journal accepts the fence. Outstanding uncertainty becomes fenced;
the immutable outcome remains inconclusive. Production lease release remains
false. A later, separate housekeeping step powers down only the private
virtual device. That shutdown is not the automation-only fence.

Shared CoreSimulator and ADB services, existing simulators, existing AVDs, and
the connected phone are outside these owned components. No shared service is
stopped. The other agent's simulator is not controlled.

## Fault controls and corrections

The matrix covers normal execution, lost creation, lost action, cancellation
after actual native dispatch, a late action reply, and MCP process failure.
Cancellation and process failure use one four-second press solely to hold a
native operation in flight. This research operation does not advertise iOS
coordinate support in the production contract.

An overlapping Android experiment exposed a client error: failed admission
could enter shutdown cleanup and stop the earlier private experiment. No other
agent's device was affected. A per-platform OS lock now spans preparation and
cleanup; rejected competitors cannot enter the device lifecycle. Cleanup also
requires successful private-device preflight. The lock has a two-process host
test.

Slow fresh-emulator startup exceeded the initial boot deadline, and a later
APK install exceeded the vendor's 20-second install timeout. Boot is now bounded
at 180 seconds; Android install and ADB execution are bounded at 120 seconds.
The missing-package shutdown path was corrected without rewriting the frozen
historical helper. A frequent read-only process scan also timed out under load;
pre-execution child receipts now provide ownership recording without that
periodic scan. These failures are retained and do not count as passing cases.

Review also found incomplete bootstrap provenance, unexercised refusal flags,
and a success status that ignored cleanup failures. Those were corrected.
Overall success now requires closure, the complete selected cleanup evidence,
persisted automation fence, and final private-device shutdown. A public CLI
test rejects missing proof fields, cleanup failure, and an unexpectedly
confirmed reply during an injected loss case.

## Delivery boundary

Work is paused. A future verdict will depend on all required native matrix items and the
two-axis evidence review. The platform mechanisms must pass before full adapter
construction. Phase 2 then extends the existing production admission authority
through explicit offline migration, preserving histories and quarantines;
these research journals cannot substitute for that migration. Configuration,
adapter/mode compatibility, corpus evaluation, phone acceptance, and cutover
remain part of the authorized implementation.

## Host checks at the checkpoint

Typechecking passed before the owner stop. The latest targeted run passed 21
of 22 tests; the group-stop test failed when its process inspection exceeded
its timeout. The separate three-test native-process/result check passed. No
new test run was started after the stop instruction. The last complete host
check remains the previous commit's 2,274-test pass; it does not validate this
WIP. Source corrections received scoped Standards/Spec reviews, but the later
process-scan changes and draft descendant verifier have not received a final
review. This checkpoint is unfinished work.
