# Execute the next native-owner study

Build a standalone, no-input study in `spikes/native-owner/`, following
`docs/architecture/checked-native-owner.md`. Its outputs are raw observations,
not checked capabilities. Existing production source and installed dependencies
are unchanged. All 23 checked-UI production requirements remain pending.

## Interface and protocol

The host Interface is `run_study(plan, configuration, dependencies)` plus a CLI
that supplies those arguments. Plans are `metadata` and `reference-study`.
The native target emits `JEV_NATIVE_OWNER_V1 ` followed by one JSON object per
line matching `protocol.schema.json`. The host supplies a fresh request ID and
passes an explicit environment contract through a derived `.xctestrun` copy.

Every stream starts with sequence 0/kind started and has exactly one final
finished record. Sequences increase by one; request IDs and schema agree.
All records contain `inputCalls: 0`. A finished record includes
`localMethodsReturned`, `localReferencesReleased`, `nativeSettlement:
"unconfirmed"`, and coverage limits for ancestry/lifetime/association independence.
Started details are exactly {runnerPID: integer > 1, plan: metadata|reference-study}.
Finished details repeat runnerPID/plan and contain appElementQueries (integer >=0),
localMethodsReturned (boolean), localReferencesReleased (boolean), nativeSettlement
(constant unconfirmed), and coverage {originalAncestry: unestablished,
referenceLifetime: unestablished, independentAssociations: unestablished}.
appElementQueries counts explicitly invoked private native query selectors;
inputCalls counts this diagnostic's input selectors. Neither is a global census
of XCTest internals. Metadata cleanup requires finished outcome observed, both
local booleans true and appElementQueries zero, in addition to class completion,
xcodebuild success and positive runner PID absence.
Unknown record kinds/operations, duplicates, missing completion, contradictory
limits and oversized output refuse normal cleanup. Maximum total native JSON
stream is 1 MiB; maximum string is 1,024 UTF-8 bytes; maximum parent walk 32 edges.
The outcome observed means observations were collected, not ownership proved.

Native invocation parameters are explicit: JEV_NATIVE_OWNER_REQUEST_ID,
JEV_NATIVE_OWNER_PLAN, JEV_NATIVE_OWNER_ADMISSION_SECONDS,
JEV_NATIVE_OWNER_STOP_FILE, and for reference-study
JEV_NATIVE_OWNER_FIXTURE_DOCUMENTS. The host derives the fixture path only from
the newly installed owned fixture's verified data container. Before every new
read or recreation, native admission checks elapsed monotonic allowance and
the host's stop file. No process-wide timeout setting or runtime patch is used.

## Native target and fixture

Use a standalone XCTest/XCUIAutomation UI-test target, separate from WDA. Check
the Objective-C ABI before invoking each private selector, including snapshot
getters. Unsupported ABI/method, nil/error/malformed reply, cycle or exceeded
bound produces an explicit unavailable/failed observation.

Acquire the original point at (160, 170) from the actual accessibility Interface.
Hold that exact object. Read native validity before replacement. Request its
snapshot and directly observe available accessibilityElement and
parentAccessibilityElement; request parents independently rather than matching
captured row IDs. Stop at nil/unavailable/cycle/bound; no stop condition declares
a complete original root. Record each method's returned value/source separately.

The owned fixture is a minimal UIKit app with an ordinary button at
(40,140,240,60), a same-looking replacement hook, generation/PID telemetry and
tap counters. Documents/result.txt contains UTF-8 JSON exactly
{pid: integer > 1, generation: integer >= 0, ordinary: integer >= 0}.
Host setup launches the newly installed fixture and confirms generation 0 and
ordinary 0 before testing. Once the UI-test runner starts, testReferenceStudy
activates that existing fixture through public XCUIApplication under the same
allowance. It confirms the same PID, unchanged generation and zero ordinary
counter before point acquisition. This setup call is recorded separately as
operation fixture-recreation/details {setup: activate, bundleId:
dev.jev.research.native-owner-fixture}; it does not request recreation. The existing owned fixture's Documents/recreate.request hook may
be adapted. Native emits operation fixture-recreation/kind observation,
outcome observed/details {"request":"recreate"} once. The host then writes that
owned file exactly once. Native waits a bounded interval for generation change
with the same fixture PID; no touch is used. Validate the retained old object,
then acquire/validate a fresh point object. Never repair old references via UID
or identifier re-query. Record surprising validity results honestly.

On normal return release locally retained references and emit finished.
This is local accounting, never an accessibility fence. It does not establish
association reset/reuse, PID/boot lifetime or independent clients.

## Host ownership and lifecycle

Operate only available simulator 0E42FDE2-5E09-42D3-9876-9EF0037FCBE7,
name jev-ios-bridge, runtime com.apple.CoreSimulator.SimRuntime.iOS-26-4.
Refuse ambiguous identity/state, build artifacts or nonfresh evidence directories.
Verify runner and fixture bundle IDs from built plists; hash native source,
fixture source, build products and test plan. Generated projects/builds/logs
stay untracked. Do not read secrets.

Runner bundle: dev.jev.research.native-owner-study.xctrunner.
Fixture bundle: dev.jev.research.native-owner-fixture.
Native target/scheme: NativeOwnerStudy. UI test class: NativeOwnerStudy.
Methods: testMetadataOnly and testReferenceStudy. Project YAML:
spikes/native-owner/native/project.yml. Expected products under
Debug-iphonesimulator: NativeOwnerStudy-Runner.app, NativeOwnerFixture.app.

Establish initial inventory and exact positive absence of every bundle before
installation. Only exact simctl ENOENT rc2/empty stdout/canonical stderr proves
absence. Refuse preexisting/ambiguous app state without uninstalling anything.
Restore the owned simulator's initial state on a refusal before owned work.
Register process/resources in the evidence ledger before spawning. Disable
parallel simulator testing. Never use a different simulator or shared-daemon
shutdown. Public launch/install operations are setup, not contact evidence.

Use one monotonic host admission deadline across preparation/testing. Expiry
writes the stop file and returns retained ownership without killing/replaying.
Record exact child PID/command and fixture/runner identities. Native request
settlement remains unconfirmed. A reference-study therefore retains device and
fixture even if all local calls returned and the runner is absent. No cleanup
is inferred from xcodebuild exit alone.

For metadata-only: require zero admitted app-element queries, valid complete
record stream, normal class completion marker JEV_NATIVE_OWNER_CLASS_COMPLETED,
successful xcodebuild, and explicit positive runner PID absence before removing
the newly installed runner. Verify final exact absence and inventory restoration.
Process inspection errors or foreign/reused PID retain; never kill them.

## Acceptance and evidence

The two implementation tickets own disjoint paths and can proceed in parallel.
The native ticket owns native/ and fixture/. The host ticket owns host/ and the
study README. The schema and this spec are frozen by the supervisor. Report any
required cross-slice change rather than editing the other worker's files.

Host tests cross run_study with injected real/scripted tool Adapters and actual
temporary files. Distinguish wrong device/runtime/state, preexisting/ambiguous
absence, expired admission, malformed/duplicate/missing/oversized records,
process uncertainty, reference-study retention and metadata-only cleanup.
Include real harmless child-process timeout/retention evidence.

Native tests cross its observation Interface with controlled native replies for
ABI rejection, nil/error/invalid snapshot, cycle and output bounds. Doubles
establish local policy only. Build both real targets without device execution.
If a unit target cannot run on this host, disclose compilation vs execution.

Each worker commits tested work in its assigned worktree and reports commit,
commands/results, red evidence and limitations. Supervisor integrates, runs the
live study serially, reviews Standards and Spec independently, fixes findings,
and pushes/lands PRs in the owned bridge repository. No Apple outreach or upstream
release is implied. Landing the study does not mark any production ticket done.
