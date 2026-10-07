# Native callback diagnostic verification

Verdict: **SHIP for the offline callback implementation**. The actual iOS callback and native settlement remain unverified; no simulator or device was operated.

The macOS policy target executed **43 tests, zero failures, zero skips** against the integrated `ObservationStudy`, callback owner, encoding and provenance helpers. [Green log](green.log.gz). The ordinary-path regression first failed on the old implementation: zero callback sends instead of two, and two direct selector calls instead of zero. [Red log](red.log.gz).

## Acceptance matrix

| Contract / scenario | Oracle and exercised code | Result |
| --- | --- | --- |
| Original and fresh point callbacks replace the direct stub | `testReferenceStudyUsesCallbackAndNeverDirectPointStub`; existing retained-object validity/replacement tests | PASS; two callback sends, no direct call, identical callback objects passed downstream |
| Inline/background callback delivery | Ordinary regression and `testBackgroundCallbackObjectsReachExistingStudyReads` | PASS; real study consumes exact object from background reply |
| Pending callback / no reply | `testPendingAndDuplicateCallbacksRetainOwnershipWithoutAnotherSend` | PASS; original deadline closes waiting, pending=1, no later read/send |
| Stop while pending | `testStopWithPendingReplyEndsWaitingAndRefusesFurtherReads` | PASS; stop reason, one pending request |
| Late reply before/after final record | `testLateReplyBeforeFinalSnapshotIsCountedButNotConsumed`, pending test's post-final callback | PASS; final snapshot counts received late payload; no post-finished record |
| Duplicate/concurrent callbacks | Pending/duplicate test, `testConcurrentDuplicateIsCountedWithoutReplacingAcceptedObject` | PASS; first result never replaced, subsequent admission refused, bounded payload storage |
| Duplicate after result snapshot | `testAtomicReplyObservationKeepsItsObjectWhenDuplicateArrivesLater` | PASS; atomic snapshot retains the selected object even after another callback |
| Throw after inline reply | `testThrowAfterInlineReplyDoesNotClaimMethodReturnOrContinue` | PASS; replyReceived=1, sendReturned=0, localMethodsReturned=false, no later read |
| Nil/error and incompatible ABI | Existing nil/error point tests and `testWrongPointABIRefusesInvocation` adapted to callback transport | PASS; no fabricated object or wrong-signature invocation |
| Expiry/stop during preparation | Existing pre-activation and signature-preparation tests | PASS; distinct deadline/stop reasons, no send after admission closes |
| Invalid/expired original deadline | `testExpiredAndNonfiniteDeadlinesRefuseGetter` | PASS; zero native getter calls |
| Metadata isolation | `testMetadataDoesNotAcquirePointSession` plus existing metadata tests | PASS; no session resolution or point callback |
| Callback-object retention | `testRequestRetainsOriginalAndLatePayloadsWithoutReplacingFirst` | PASS across autorelease pool; at most first+late element retained |
| Loaded images and getter signature | `testLoadedProvenanceUsesRuntimeImages` | PASS on real loaded macOS test images; missing image/selector refused |
| Missing provenance | `testMissingProvenanceRefusesPointSend` | PASS; no point send |
| Exception provenance bounds | `testExceptionProvenanceIsBoundedAndReportsRealName` plus throwing-study tests | PASS; name/reason preserved, overlength reason replaced by byte count, at most 16 frames |
| Wire agreement | [Actual native ordinary](ordinary.jsonl), [pending](pending.jsonl), [Python validation](wire-validation.json) | PASS; actual encoder bytes accepted by host parser; synthetic class marker explicitly supplies framing only |
| Existing parent/snapshot/fixture/record behavior | Remaining preexisting policy cases | PASS; limits and refusals preserved |
| Generic iOS profiles | Source-bound `build.py` receipts | PASS; both generic simulator build-for-testing profiles compiled; [metadata receipt](metadata-binding.json), [reference receipt](reference-binding.json) |

The result snapshot and final summary each use the shared callback-state lock. Final `localReferencesReleased` derives from that same summary. Session getter and point send returns are separately counted from callback receipt. The runner retains its single reference-study owner and refuses to overwrite it on a repeated invocation.

## Commands and scope

```sh
xcodegen generate --spec spikes/native-owner/native/project.yml --project spikes/native-owner/native
xcodebuild test -project spikes/native-owner/native/NativeOwnerStudy.xcodeproj -scheme NativeOwnerPolicyTests -destination 'platform=macOS' -derivedDataPath /private/tmp/jev-callback-policy
python3 .scratch/native-callback-implementation/verification/host/check-native-records.py .scratch/native-callback-implementation/verification/native
python3 spikes/native-owner/native/build.py --plan metadata --derived-data /private/tmp/jev-callback-metadata-final-build --receipts /private/tmp/jev-callback-metadata-final-receipts
python3 spikes/native-owner/native/build.py --plan reference-study --derived-data /private/tmp/jev-callback-reference-final-build --receipts /private/tmp/jev-callback-reference-final-receipts
```

The red command used the same macOS target with `-only-testing:NativeOwnerPolicyTests/ObservationStudyTests/testReferenceStudyUsesCallbackAndNeverDirectPointStub`. Compilation-only intermediate mistakes and a fake-client type guard were corrected before the final pass; they are not counted as behavioral red evidence.

The runtime provenance assertions inspect the loaded macOS test executable, not a simulator process. Host clock correspondence has separate [host evidence](../host). Actual private iOS ABI compatibility, downstream completion, reference lifetime and input/contact facts require their own admitted evidence. No test here establishes those facts or accepts a production ticket.
