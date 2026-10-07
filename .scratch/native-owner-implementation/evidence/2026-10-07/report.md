# Native study implementation and first joined run

The architecture and both research Modules are implemented. Architecture PR
[43](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/43), native PR
[44](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/44), and host PR
[45](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/45) are merged.
The first joined metadata run found a native JSON defect. The host rejected its
completion record and retained ownership. The reference study was not started.
No checked-UI production ticket is accepted by this work.

## Architecture delivered

The host exposes `run_study(plan, configuration, dependencies)`. Its CLI and
regressions cross the same Interface. Build provenance, executable ownership,
simulator guards, process groups, bounded protocol validation, fixture
coordination and retention stay inside this Module. The native Module owns
ABI checks, admission, exact retained objects and bounded observations.

The future production path remains Bridge → supported MobileBuildMCP → AXe →
IDB → native accessibility/input owner. Experimental XCTest calls stay under
`spikes/native-owner/`; production Device driver behavior is unchanged.

## Reviewed source and tests

- Native source used for the live run: `223d733a049485dd7a83b937dd0ae9e68135dc07`.
  Its 23 native policy tests passed; both actual iOS targets built successfully.
- Host source: `ea9bcdb1b834f039e9595523b19d49430522fa40`. Its 33 regressions
  passed locally and in package CI. Review fixes reject a foreign executable,
  plugin, bundle identifier, dependent product, startup target or runtime
  injection before the first simulator command.
- Independent Standards and Spec reviews checked both Modules and rechecked
  their fixes. Tests establish local policy, not external native guarantees.
- Before execution, the supervisor verified all 8 native source hashes, all 11
  product hashes, and the original `.xctestrun` hash against
  [the build binding](native-live-build-binding.json). Binding SHA-256:
  `bc5dccb863e6b589c4697502c4279f512fc9ec7ee539371eb82ba52c234a787e`.

Raw red/green receipts are in [verification](verification/).

## Live metadata result

The exact invocation was:

```sh
python3 spikes/native-owner/host/run.py --plan metadata \
  --derived-data /private/tmp/jev-native-owner-study-admission-fix-build \
  --evidence-directory /tmp/jev-native-owner-metadata-integrated-20261007 \
  --admission-seconds 90
```

The host verified the owned simulator's identity, booted it from Shutdown, and
observed exact canonical ENOENT for both study bundles before testing. Parallel
simulator testing was disabled. The actual runner returned `XCAXClient_iOS` and
the signatures of point acquisition, validity, snapshot and attribute selectors.
This metadata plan invoked zero private app-element query selectors and zero
input selectors. These counts concern the study's explicit calls.

The final raw record encoded `localMethodsReturned` and
`localReferencesReleased` as numeric `1`. The protocol requires JSON booleans.
Objective-C boxed comparison expressions supplied numeric NSNumbers, and the
unit assertions had treated NSNumber `1` and `true` as equal. The strict host
returned `retained / RECORD_SCHEMA` (CLI exit 3) before accepting completion.
Its [accepted observations](metadata-initial/observations.json) therefore contain
only sequences 0 and 1. The unmodified rejected sequence 2, subsequent class
marker and XCTest success output remain in
[raw stdout](metadata-initial/process-output/007-stdout.log).

The native test and `xcodebuild` success text appear in that output, but the host
aborted parsing before recording `xcodebuild`'s return code. They do not replace
the required valid stream. The
[result](metadata-initial/result.json) and
[ownership ledger](metadata-initial/ownership.json) retain their original values.

## Encoding fix and verification

[PR 46](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/46) fixes the defect
at `07874551ff5015837b5400cd6c2a4aa03c6d92ad`. A private `WireBoolean`
conversion returns explicit `@YES`/`@NO` for every dynamic boolean field;
numeric counters keep their numeric types. Two new tests reported 88 intended
assertion failures against the previous implementation. They check emitted
JSON bytes, CFBoolean identity before and after decoding, true/false cases and
exceptional completion. All 25 native policy tests pass after the fix.

Both actual iOS targets built again without warnings. The supervisor verified
8 source hashes, 11 product hashes and the test-plan hash in
[the fixed build binding](native-fixed-build-binding.json), SHA-256
`d40570d4a3d5029d58c9067e0f9703db963c5f883ffa6f04419ea44b29b82838`.
Independent Standards and Spec reviews cleared the fix. The fixed build was
not run on the simulator. Together with the 33 host regressions, 58 local tests
pass; these are policy/serialization tests, not 58 native guarantee proofs.

## Retained ownership and limits

The ledger retains simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`
(`jev-ios-bridge`, iOS 26.4), the runner installation
`dev.jev.research.native-owner-study.xctrunner`, runner PID `15195`, and
`xcodebuild` PID/process group `13915`. No fixture was installed by this metadata
plan. No cleanup, replay, forced termination or shared-daemon reset was issued.

A separate [read-only process inspection](metadata-initial/post-run-process-inspection.json)
subsequently found both PIDs absent (`ps` rc1, empty stdout/stderr) and no member
of process group 13915. This observation does not rewrite the historical ledger
or repair the invalid stream. The frozen cleanup contract has no recovery API
for this result; any manual ownership reconciliation needs a separately defined
workflow preserving the original refusal.

The reference study remains unrun. There are no joined observations of an
original point reference, snapshot parent, or reference after fixture recreation.
The native serializer fix must be verified separately; a new build cannot make
this earlier run valid.

All 23 production tickets remain pending: 10 IDB, 5 AXe, 5 MobileBuildMCP and
3 Bridge. Complete original ancestry, reference lifetime, independent
associations, bounded native settlement, consumption and contact release still
need applicable native owner evidence and supported upstream releases.

## Archive

The original build, result bundle and full logs remain in `/private/tmp` at the
paths recorded in the receipts. This repository stores the small JSON/log/test
plan receipts, not compiled products or `.xcresult` binaries. A manifest records
the SHA-256 of every archived file in [manifest.json](manifest.json).
Verification logs and the boot-status log use deterministic gzip compression
to preserve their exact bytes, including tool-emitted whitespace. The manifest
also records their uncompressed SHA-256; `gzip -dc <file>.log.gz` reads them.
Paths and request IDs correlate this run;
they do not certify native identity or validity scope.
