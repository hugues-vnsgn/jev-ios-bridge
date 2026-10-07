# Native reference observation verification

Verdict: **SHIP for the offline observation implementation**, supervisor integration review passed with no unresolved findings. Actual iOS observations and IDB ownership acceptance remain unverified; no simulator or device was operated.

The macOS target ran 56 XCTest cases with zero failures or skips. [Final log](native-evidence/native-green.log.gz). The validity regression first reported true from the Boolean wrapper despite a false raw attribute; source/key-presence assertions also failed. [Validity red](native-evidence/validity-red.log.gz). The independent-root regression first showed no factory acquisition, no expected-PID input and no explicit missing-root termination. [Root red](native-evidence/root-red.log.gz).

The review regression first failed five assertions in one test, then passed: a refused extra-key or NSError reply now preserves the requested false value and key presence. [Review red](native-evidence/refusal-red.log.gz).

## Contract coverage

| Scenario | Evidence through actual ObservationStudy | Result |
| --- | --- | --- |
| False value in nonnil attribute dictionary | `testValidityPreservesFalseAttributeInsteadOfDictionaryPresence` | PASS: false is preserved, wrapper not used |
| Retained old and fresh references | Existing replacement/validity tests | PASS: exact callback objects reach attribute requests; lifetime remains unestablished |
| Missing/malformed/nil reply, extra key, array value, NaN | `testRawValidityRefusesMissingMalformedAndNonfiniteValues` | PASS: explicit failure, no manufactured Boolean |
| String and error-domain limits | `testRawValidityStringAndErrorDomainExactBounds` | PASS at 1,024 UTF-8 bytes; explicit refusal at 1,025; error userInfo absent |
| Missing symbol/provenance | `testMissingValiditySymbolOrProvenancePreventsAttributeRequest` | PASS: zero attribute calls |
| Wrong attribute/root ABI | `testReferenceMethodABIMismatchPreventsInvocation` | PASS: mismatched call not invoked |
| Actual method metadata | `testReferenceMethodProvenanceContainsLoadedUUIDAndExactEncoding` | PASS for loaded macOS test image UUIDs and method encodings |
| Independent equal root / unequal root sharing PID | `testIndependentRootUsesNativeComparisonNotPIDOrLocalPointer` | PASS: distinct equal wrappers match; same PID alone does not |
| Missing root, root/equality provenance | `testMissingRootAndEqualityProvenanceRefuseTheirCalls` | PASS: explicit terminal unknown, no invented chain |
| Nil parent before root | `testNilParentRequiresIndependentRootObservationAndExplicitTermination` | PASS: separate PID-root acquisition and terminal reason |
| Fresh wrapper for repeated native reference | `testFreshWrapperNativeCycleIsDetectedBeforeAnotherSnapshot` | PASS: one parent edge, native cycle detected |
| Exactly 32 edges / attempted 33rd | `testRootExactlyAt32EdgesIsObservedWithout33rdParentRead` and existing edge-limit test | PASS: root at edge 32 accepted as observation; no 33rd parent read |
| Callback/deadline/fixture/encoding regressions | Existing policy suite | PASS: original callback accounting, stop/deadline and byte limits preserved |
| Cross-language records | [Native ordinary](native-evidence/ordinary.jsonl), [pending](native-evidence/pending.jsonl), [host parsing](native-evidence/wire-validation.json) | PASS: actual encoder bytes accepted; test-class marker supplied synthetically, never process/settlement proof |
| Generic simulator build profiles | [Metadata receipt](native-evidence/metadata-binding.json), [reference receipt](native-evidence/reference-binding.json), [source verification](native-evidence/build-source-verification.json) | PASS: both build-for-testing profiles, all 23 source hashes match final integrated tree |

The full native encoder boundary traces also pass the final host parser: [root at 32 edges](native-evidence/root32.jsonl), [attempted 33rd edge](native-evidence/over32.jsonl), [validator](native-evidence/check-boundary-records.py), [results](native-evidence/boundary-wire-validation.json). Both have exactly 32 sequential edges; their explicit terminations differ. Each rejects missing class completion before a synthetic framing-only marker is supplied.

Tests that previously counted every parent-operation record now count actual edge records separately from the newly required comparison/root/termination records. They retain the exact edge limits. The surprising-validity test supplies an independently matching fake root so its existing final-outcome assertion continues to isolate validity behavior.

During implementation the first attribute array had too short a lifetime across NSInvocation configuration. The macOS test executable crashed before the assertion. Owning the requested-attributes array through invocation and retaining invocation arguments corrected that implementation defect; the final suite runs without unexpected exits. Those intermediate failures are not counted as intentional TDD red evidence.

## Source and interpretation

[Installed primitive disassembly](native-evidence/reference-primitives-disassembly.txt) shows the root factory calls `_AXUIElementCreateAppElementWithPid`. Native `isEqual:` compares backing fields; equality is not treated as a supported epoch/lifetime contract. The validity key is an [exported symbol](native-evidence/reference-symbol.txt). [Fixup and constant bytes](native-evidence/reference-symbol-type.txt) prove the arm64 exported variable at `0x6dfd8` points to a CFConstantString at `0x5c9b8`, whose bytes at `0x41f83` contain `XC_kAXXCAttributeIsValid`. This supports the object-pointer indirection used by the fixed getter; applicability remains checked on the actual loaded image. [Binary provenance](native-evidence/source-provenance.json) pins this static inspection. Runtime records obtain UUIDs from loaded images, not these on-disk hashes.

The implementation adds no public IDB facade and accepts none of the production ticket's six acceptance criteria. It makes raw validity and independent-root observations executable, with discriminating tests and an ordinary fake-root positive. Non-omitted ancestry, backend-issued association/boot/app-instance scope, cross-client identity, owner settlement and a supported external-consumer API still need their own evidence.

## Commands

```sh
xcodegen generate --spec spikes/native-owner/native/project.yml --project spikes/native-owner/native
xcodebuild test -project spikes/native-owner/native/NativeOwnerStudy.xcodeproj -scheme NativeOwnerPolicyTests -destination 'platform=macOS' -derivedDataPath /private/tmp/jev-reference-policy
python3 .scratch/native-callback-implementation/verification/host/check-native-records.py .scratch/native-owner-continuation/native-evidence
python3 .scratch/native-owner-continuation/native-evidence/check-boundary-records.py
python3 spikes/native-owner/native/build.py --plan metadata --derived-data /private/tmp/jev-reference-final-metadata-build --receipts /private/tmp/jev-reference-final-metadata-receipts
python3 spikes/native-owner/native/build.py --plan reference-study --derived-data /private/tmp/jev-reference-final-reference-build --receipts /private/tmp/jev-reference-final-reference-receipts
```

The red runs used the same macOS command with `-only-testing` for the named regression. Generic `build.py` performs build-for-testing only. No native study runner, cleanup, install, reset or live accessibility query was invoked.
