# Native owner observations

This standalone study records what XCTest's native accessibility Interface
returns. It never sends input, enables a production capability, or accepts any
of the 23 pending checked-UI production tickets.

The study Module has this Interface:

```python
from study import Configuration, Dependencies, ProcessTools, run_study

configuration = Configuration(derived_data, fresh_evidence_directory, source_root,
                              build_binding=builder_receipt)
result = run_study("metadata", configuration,
                   Dependencies(ProcessTools(fresh_evidence_directory / "process-output")))
```

`derived_data`, `fresh_evidence_directory` and `source_root` are `pathlib.Path`
values. The source root is `spikes/native-owner`. The directory for evidence
must not exist. `admission_seconds` defaults to 90 and must be greater than zero
and at most 300. Device identity is fixed to simulator
`0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`, name `jev-ios-bridge`, iOS 26.4.

Build both owned targets without running a device:

```sh
python3 spikes/native-owner/native/build.py --plan metadata \
  --derived-data /tmp/native-owner-metadata-build \
  --receipts /tmp/native-owner-metadata-build-receipts
python3 spikes/native-owner/native/build.py --plan reference-study \
  --derived-data /tmp/native-owner-reference-build \
  --receipts /tmp/native-owner-reference-build-receipts
```

Both build paths must be fresh. The native builder generates its project,
builds `NativeOwnerStudy` and `NativeOwnerFixture` for a generic iOS Simulator,
and records build/source/product provenance. It needs Xcode and `xcodegen`.

Run the metadata study explicitly on the owned simulator:

```sh
python3 spikes/native-owner/host/run.py \
  --plan metadata \
  --derived-data /tmp/native-owner-metadata-build \
  --build-binding /tmp/native-owner-metadata-build-receipts/binding.json \
  --evidence-directory /tmp/native-owner-metadata \
  --admission-seconds 90
```

For the bounded original-reference/recreation observations:

```sh
python3 spikes/native-owner/host/run.py \
  --plan reference-study \
  --derived-data /tmp/native-owner-reference-build \
  --build-binding /tmp/native-owner-reference-build-receipts/binding.json \
  --evidence-directory /tmp/native-owner-reference \
  --admission-seconds 90
```

Each plan selects one fixed profile in [study-identities.json](study-identities.json).
The two plans have separate runner, plugin and fixture bundle identities. There
is no bundle-ID flag, alternate-profile retry or allocator. The builder records
actual bundle IDs and all source, generated-project, product and original-plan
hashes. Before a simulator command, the host requires that receipt to match the
requested profile and current bytes. Missing, changed, extra or symlinked inputs
refuse admission. The receipt is research provenance, not a production certificate.

Run one study at a time. The host checks the exact inventory and positive app
absence before installation. Before contacting a simulator, it binds the test
host, plugin, bundle identifiers and every dependent product to the verified
build. Extra targets, foreign app paths, launch arguments and runtime injections
are refused. The metadata plan excludes the unused fixture dependency.
Reference studies launch the newly installed owned fixture,
confirm its actual bundle identity, initial PID/generation/zero tap count, and pass the verified data
container through a derived `.xctestrun`. A native recreation request causes one
programmatic `Documents/recreate.request` write; setup activation is separate.
It never uses a touch, UID re-query, shared-daemon reset or another simulator.

Both study and reconciliation hold the Bridge's device lease in the default
temporary-directory namespace. The research claim records an unknown native
owner (`pid: null`) and the actual host PID separately. It remains busy after
frontend exit. Settled metadata cleanup releases the claim; retained work keeps
it. Existing claims are never taken over. This excludes cooperating Bridge runs
in that namespace; external tools and custom lease roots require separate
coordination.

The CLI exits 0 for metadata completion, 2 for refusal before owned native work,
and 3 for retained ownership. A single monotonic allowance covers preparation
and testing. Expiry writes `stop-admission`, stops new host work and returns
retained ownership without a terminating signal or replay. An already-started
native call may continue. Retained subprocess output uses files, so frontend
exit does not close a pipe and signal the child.

A rejected record stops native admission immediately. The host preserves that
refusal while monitoring the existing child/group under the original deadline.
Observed process exit is recorded independently of record acceptance. Neither
fact alone permits metadata cleanup.

Metadata cleanup requires the schema-valid complete stream, zero explicit
native app-element queries, both local completion flags, normal test-class
completion, successful `xcodebuild`, and positive absence of the exact runner
PID. It removes only the newly installed runner and verifies final app absence
and initial device states. PID inspection uncertainty retains ownership.
Immediately after `started`, native emits its actual runner/plugin identities
and build-bound fixture identity. Exact agreement is required before further
observations or recreation. Both telemetry readers check the fixture identity;
the host rechecks its initial telemetry before the single recreation write.

A reference study **always retains** the device, fixture and runner resources
while native settlement is unconfirmed, even when local calls returned and
references were released. Runner absence is not an accessibility fence. Read
`result.json` and `ownership.json` before any manual follow-up; the host provides
no automatic force-cleanup or resume command.

Metadata-resource reconciliation is a separate Module for the single archived
numeric-completion-flags failure registered in
[approved-case.json](../../.scratch/native-owner-recovery/approved-case.json).
Its Interface is `reconcile_metadata(retained_directory, configuration,
dependencies, apply=False)`. Inspection is the default; apply requires the
registered original receipts, pinned native build/source, exact installed app
path and five file hashes, positive fixture absence, and fresh process/group/
runner absence. A stable one-use claim prevents repeated cleanup. Any uncertain
gate keeps ownership retained.

Inspect the registered case without changing the simulator:

```sh
python3 spikes/native-owner/host/reconcile.py \
  --retained-directory /private/tmp/jev-native-owner-metadata-integrated-20261007 \
  --evidence-directory /tmp/native-owner-reconciliation-inspection
```

Apply uses a different fresh evidence directory and the explicit `--apply`
flag. It consumes the case's permanent one-use claim before tool work, so an
uncertain attempt cannot be replayed.

This source-bound exception can remove only that metadata-only runner and
restore its owned device setup. It preserves the original invalid result and
unknown historical `xcodebuild` exit code. It establishes no native settlement
and never cleans up a reference study. The contract and live sequence are in
[the recovery spec](../../.scratch/native-owner-recovery/spec.md).

The [2026-10-07 live report](../../.scratch/native-owner-recovery/evidence/2026-10-07/report.md)
records successful one-use recovery, followed by a metadata refusal after boot:
container lookup and installed-app listing returned the deleted runner's old
path. The diagnostic restored Shutdown. The two successor profiles permit
independent startup observations without changing that old registration. Each
still requires its own canonical absence replies; a refusal stops the study.
The historical cleanup claim remains consumed, and the old diagnostic and
reconciliation continue to address only their original IDs. No old archive or
executed-script binding is rewritten by the successor implementation.

Evidence includes source/product/test-plan hashes, exact commands and process
groups, local observations, fixture readiness, recreation writes and retained
resources. Raw observations remain in these local files. Schema and coverage
limits are in [protocol.schema.json](protocol.schema.json); architecture is in
[checked-native-owner.md](../../docs/architecture/checked-native-owner.md).
Request IDs and local reference labels correlate observations; they do not
establish native identity, complete ancestry, lifetime or independent clients.

Run host regressions without a simulator or `xcodebuild`:

```sh
python3 -W error::ResourceWarning -m unittest discover \
  -s spikes/native-owner/host -p 'test_*.py' -v
```

Tests cross `run_study` with scripted tool results and actual temporary files.
Real harmless child/descendant tests verify timeout retention and natural exit.
They establish host ownership policy, not native settlement or contact release.
