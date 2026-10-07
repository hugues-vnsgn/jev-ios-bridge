# Independently bound native studies, 2026-10-07

The two-profile implementation is merged in [PR 50](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/50), merge `61ddbbb5125a7de851d71df3a6a30a0b516d6803`, reviewed head `f045d66ed2d10962b7c06839c0ad22fc884bfcb6`. Metadata now runs and cleans up successfully. The reference study reached the correct fixture, but its first native point lookup threw an exception. No reference was acquired; ancestry, validity and replacement checks remain unrun.

```text
two verified builds
  metadata: identities agree → methods present → zero queries → cleanup verified
  reference: fixture identity/PID agree → first point lookup throws
    no reference, parent walk or replacement → device/apps/guard retained
```

The supervisor owns diagnosis and subsequent implementation. The user need not select another backend or interpret a ticket. The next investigation is the native point failure and its caller requirements. It uses saved evidence and provider sources while the retained guard excludes further cooperating device work. An absent native settlement contract cannot be replaced by wrapper code or a successful process exit.

## Build and review evidence

Both generic simulator builds passed without device execution. Each binding covers 17 source inputs, 10 product files, the generated project and original test plan. Actual runner/plugin/fixture bundle IDs and the plugin's four bound identity fields agree with their selected profiles. The [verification receipt](verification/jev-native-profile-build-verification-20261007.json) records their digests.

| Plan | Build source commit | Binding SHA-256 |
| --- | --- | --- |
| metadata | `1b32ff2b891aead75580311f8df1dbe0ec01dc8d` | `994463cb88b69f96a81de99ad7f67b421253754c0c82996abc6526d930185d31` |
| reference-study | `f045d66ed2d10962b7c06839c0ad22fc884bfcb6` | `be2352c67519e200a7d92fdd8c2f8f87e205d5ab6ce06c99de587cfa9da90444` |

The intervening commit changed only verification documentation; all bound source bytes match. The initial metadata build failed because the restricted environment omitted USER. Its receipts remain in `build-metadata-failed/`. The fix admits USER/LOGNAME while rejecting secret and profile-override variables.

Independent Standards and Spec reviews passed at the reviewed head. Two Spec findings were fixed and rechecked: nested fixture resources escaped source inventory, and CLI path resolution hid a binding symlink. One optional duplicated plist-key mapping remains nonblocking. Meaningful red/green logs, 107 passing host tests, 27 native policy tests and two historical caller tests are archived under `verification/`. Package CI passed 929 tests, typechecking and build. Tests establish their recorded local behavior; they do not establish native ownership guarantees.

## Metadata result

Request `3472f13c-1700-4651-afd3-ca3205bd5ba2` completed with `METADATA_COMPLETED` under one 90-second allowance. Four valid records contain the actual study identity before getter work, the `XCAXClient_iOS` interface and four available methods with their runtime signatures. Completion flags are JSON booleans. Explicit app-element queries and input calls are zero.

All 13 commands exited with recorded owned groups absent and streams closed. XCTest class completion and `xcodebuild` exit 0 were recorded independently. An exact PID check positively established runner 92204's absence. The host uninstalled only the newly owned metadata runner, observed its canonical absence, restored all 23 initial device states, returned the owned device to Shutdown, and released its guard. [Verification](verification/jev-native-metadata-profile-20261007-study-verification.json), [result](metadata/result.json) and [ownership](metadata/ownership.json) preserve those gates.

This proves metadata observation and cleanup at the recorded time. It does not prove durable registration absence or native accessibility settlement.

## Reference result and retained ownership

Request `3ccf501b-f50f-419d-a805-d5948bfdb20d` returned `retained / NATIVE_SETTLEMENT_UNCONFIRMED`. Its independent profile passed startup absence and build/runtime identity gates. Fixture telemetry named the actual reference fixture, PID 3044, generation 0 and ordinary tap count 0. Native records confirm that activation preserved the same PID, generation and counter.

Sequence 6 records `failed / native-exception` from `accessibilityElementForElementAtPoint:error:`. Sequence 7 finishes with outcome `failed`, one explicit query, `localMethodsReturned: false`, `localReferencesReleased: true`, and all coverage fields unestablished. The exception name, message and stack were not recorded, so this evidence cannot assign its cause. There are no acquired-reference, validity or parent records, and no recreation write. Replacement is unrun.

All 11 owned command groups were observed absent with closed streams. The XCTest class and process completed successfully, with `xcodebuild` exit 0. Those facts describe the wrapper; they do not change the failed native observation or prove runner/accessibility-owner absence. [Raw observations](reference/observations.json), [verification](verification/jev-native-reference-profile-20261007-study-verification.json), [result](reference/result.json) and [ownership](reference/ownership.json) retain the distinction.

The study issued no uninstall or shutdown and wrote `stop-admission`. It retains the device, fixture, runner installation, recorded runner and device guard. The guard has `pid: null` and `released: false`; its [captured record](reference/device-guard-retained.json) matches the ownership receipt. No final device-state restoration or native settlement is established. No cleanup replay, shared-service reset, identity rotation or subsequent device experiment was performed.

## Preserved history and remaining work

The approved case, both historical archive manifests and consumed one-use claim match the [pre-study baseline](verification/jev-native-study-prior-evidence-baseline-20261007.json). The original invalid metadata record remains invalid; its historical exit code remains unknown. No command addressed the historical app identities; their current registration state was not rechecked. These successor observations accept none of the 23 production requirements.

The remaining native facts are complete containment, original-reference validity across all required lifecycle changes, started-work completion, exact tap receipt and contact release. Both studies sent zero input. The failed point operation supplies no evidence for containment or lifetime. Production implementation follows only when its actual prerequisites are established.

`origins.json` identifies copied originals and their exact byte hashes. `manifest.json` pins every archived file and decompressed raw log/test-plan bytes. App binaries and result bundles remain in their original directories and are not copied here.
