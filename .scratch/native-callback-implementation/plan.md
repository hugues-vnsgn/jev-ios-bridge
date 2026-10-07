# Implement the native point callback diagnostic

Status: complete for offline implementation; live and production acceptance remain open
Implementation base: `86d81bf`; research context: `24f370f`
Contract: [specification](spec.md)

## Why this change

The installed iOS direct selector is an assertion stub. The current `ObservationStudy.point:phase:` invokes it twice in the intended reference flow. The source-backed session wrapper supplies the asynchronous replacement. Existing `ObservationStudyTests.m` already tests the actual study on macOS, so extend that seam rather than create a disconnected policy model.

A related admission defect is in `host/study.py:derive_plan`: it passes remaining seconds and native starts those seconds again after runner startup. Carry the original absolute deadline through the same integration.

## Parallel ownership

| Worker | Owns | Deliverable |
| --- | --- | --- |
| Native | `native/ObservationStudy.h`, `.m`, `ObservationStudyTests.m`, `NativeOwnerStudy.m`, `project.yml`, any narrowly named point/provenance helper files, `native/README.md` | Integrated callback transport/state, provenance, original deadline consumption, macOS policy tests |
| Host | `host/study.py`, affected `host/test_*.py`, `protocol.schema.json`, `host/INTEGRATION-VERIFICATION.md`, top-level spike README | Exact final summary validation, absolute deadline transport/default clock, public-interface host tests |
| Supervisor | This feature's spec/plan/issues, cross-language verification fixture if needed, architecture documentation and journal | Interface review, integration, independent tests/review, final commit |

Both workers consume the wire shape in the spec. Native owns environment parsing, host owns environment production. Neither changes binding inventory rules unless integration proves a necessary omission; recursive native source binding should include added helper files already. Freeze field names before dispatch. Host can implement against independent fixtures while native implements against fakes.

## Phases

1. **Complete:** supervisor reviewed the callback, ownership and wire contract. Two implementation issues assign disjoint file ownership. Host worker must verify the shared clock before finalizing that boundary; no live run is admitted.
2. **Complete:** each worker writes the smallest distinguishing regression and records meaningful red. Native first proves asynchronous transport replaces the direct selector in the ordinary study path. Host first proves startup delay consumes original admission.
3. **Complete:** implement and run focused tests, then affected suites. Keep callbacks retained through the final observation cutoff without claiming native settlement.
4. **Complete:** integrate both slices, send actual native-encoded ordinary/pending records through host validation, and compile both explicit iOS profiles without running them.
5. **Complete:** independent `do-test` and `code-review`, resolve findings, sync this plan/spec and journal. No live result or production-ticket acceptance is claimed.

## Offline commands

Run from repository root:

```sh
JEV_NATIVE_OWNER_TSX_LOADER=/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/node_modules/tsx/dist/loader.mjs python3 -W error::ResourceWarning -m unittest discover -s spikes/native-owner/host -p 'test_*.py' -v
xcodegen generate --spec spikes/native-owner/native/project.yml
xcodebuild test -project spikes/native-owner/native/NativeOwnerStudy.xcodeproj -scheme NativeOwnerPolicyTests -destination 'platform=macOS' -derivedDataPath /private/tmp/jev-callback-policy
python3 spikes/native-owner/native/build.py --plan metadata --derived-data /private/tmp/jev-callback-metadata-build --receipts /private/tmp/jev-callback-metadata-receipts
python3 spikes/native-owner/native/build.py --plan reference-study --derived-data /private/tmp/jev-callback-reference-build --receipts /private/tmp/jev-callback-reference-receipts
```

Use fresh derived/receipt paths when rerunning. The build script uses generic simulator `build-for-testing`; do not run `host/run.py`, iOS test schemes, `simctl`, or reconciliation. Native policy tests use macOS and doubles. Before implementation, verify generated-project output path for the root-invoked xcodegen command; use `--project spikes/native-owner/native` if required by installed xcodegen.

## Completion criterion

The real reference path uses the fixed callback wrapper and retained object; deterministic tests cover every listed callback state; host/native records agree; both generic profiles compile; independent review has no unresolved critical findings. Native settlement, reference reset/reuse, complete ancestry and input receipt/release remain separate owner-evidence questions.

## Results

43 native policy tests and 117 integrated host tests passed. Both generic iOS profiles compiled, with 21 source hashes per receipt matching the reviewed tree. Actual native-encoded ordinary/pending records passed the host validator. Independent review has zero unresolved specification findings and zero documented-standard violations; one optional test-setup duplication remains. See [verification](verification.md) and [review](review.md).
