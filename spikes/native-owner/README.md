# Native owner observations

This standalone study records what XCTest's native accessibility Interface
returns. It never sends input, enables a production capability, or accepts any
of the 23 pending checked-UI production tickets.

The host Module has one Interface:

```python
from study import Configuration, Dependencies, ProcessTools, run_study

configuration = Configuration(derived_data, fresh_evidence_directory, source_root)
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
python3 spikes/native-owner/native/build.py \
  --derived-data /tmp/native-owner-build \
  --receipts /tmp/native-owner-build-receipts
```

Both build paths must be fresh. The native builder generates its project,
builds `NativeOwnerStudy` and `NativeOwnerFixture` for a generic iOS Simulator,
and records build/source/product provenance. It needs Xcode and `xcodegen`.

Run the metadata study explicitly on the owned simulator:

```sh
python3 spikes/native-owner/host/run.py \
  --plan metadata \
  --derived-data /tmp/native-owner-build \
  --evidence-directory /tmp/native-owner-metadata \
  --admission-seconds 90
```

For the bounded original-reference/recreation observations:

```sh
python3 spikes/native-owner/host/run.py \
  --plan reference-study \
  --derived-data /tmp/native-owner-build \
  --evidence-directory /tmp/native-owner-reference \
  --admission-seconds 90
```

Run one study at a time. The host checks the exact inventory and positive app
absence before installation. It launches only the newly installed owned fixture,
confirms its initial PID/generation/zero tap count, and passes the verified data
container through a derived `.xctestrun`. A native recreation request causes one
programmatic `Documents/recreate.request` write; setup activation is separate.
It never uses a touch, UID re-query, shared-daemon reset or another simulator.

The CLI exits 0 for metadata completion, 2 for refusal before owned native work,
and 3 for retained ownership. A single monotonic allowance covers preparation
and testing. Expiry writes `stop-admission`, stops new host work and returns
retained ownership without a terminating signal or replay. An already-started
native call may continue. Retained subprocess output uses files, so frontend
exit does not close a pipe and signal the child.

Metadata cleanup requires the schema-valid complete stream, zero explicit
native app-element queries, both local completion flags, normal test-class
completion, successful `xcodebuild`, and positive absence of the exact runner
PID. It removes only the newly installed runner and verifies final app absence
and initial device states. PID inspection uncertainty retains ownership.

A reference study **always retains** the device, fixture and runner resources
while native settlement is unconfirmed—even when local calls returned and
references were released. Runner absence is not an accessibility fence. Read
`result.json` and `ownership.json` before any manual follow-up; the host provides
no automatic force-cleanup or resume command.

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
