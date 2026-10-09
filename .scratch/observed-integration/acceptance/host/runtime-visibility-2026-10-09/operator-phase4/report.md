# Runtime visibility phase4 — bounded metadata diagnosis

## Result

One finite batch completed. All eight exact inputs were regular, single-link, below1MiB and stable by before/opened/final/after stat and before/after SHA256. All inspected ancestors were nonsymlink directories. Seven JSON conversions were parsed. Xcode Info.plist conversion exceeded the65536-byte output cap; its fields remain UNVERIFIED. No compatibility acceptance verdict is issued.

The approved Cryptex candidate directly contains metadata for `com.apple.CoreSimulator.SimRuntime.iOS-27-0`, actual/declared version27.0 and actual build24A434. Runtime profile supports arm64/x86_64 and families[2,1]; iPhone17 requires family[1], supports arm64/x86_64 and minimum runtime26.0. Runtime minimum host14.0.0 is below recorded host27.0.1/build26A434. Xcode version.plist records27.0/build27A266a. Every evaluated metadata predicate matches; Xcode identity/executable/min-host predicates are unknown because of the bounded conversion stop.

## Dispatch and binding

The full phase4 brief was read before the probe. Refreshed Orca runtime `5f433f83-b0b5-4579-b844-952323951016`, handle `term_19640861-824c-4f24-8789-3f584723bc5a`, same incarnation/tab/leaf were connected/nonorphaned. Read-only terminal preview displayed GPT-6.1-Sol xhigh and integration cwd. Orca ownership metadata still names the main checkout; this is disclosed in context.json. No terminal was created or sent input. HEAD `4004ece782fc9448607605bfe3a54702f8622bb0`; accepted product `b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433`.

## Invocation

```text
env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS node .scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase4/run.mjs
```

Probe executable `/opt/homebrew/Cellar/node/26.8.1/bin/node`; exact argv/cwd in command.json. Start `2026-10-09T02:49:15.099Z`, end `2026-10-09T02:49:15.231Z`, exit0, signalnull, stderr empty. Eight metadata children, all exactly `/usr/bin/plutil -convert json -o - -- <one approved plist>`, fixed account HOME/PATH/LANG/LC_ALL/DEVELOPER_DIR, shellfalse/ignoredstdin. All eight exited0/signalnull/stderr empty with no timeout. Xcode Info receipt has overflowtrue; process exit0 does not establish a complete accepted result. No retry, other parser or fallback occurred.

## Catalog correspondence

Phase3 candidate/catalog hashes were checked against their immutable manifest: `8ac7edcc956f5cfdcbf3e511b776434699dacfd229f7d0bfbe2108dd831bd29d` and `9eb9df2ee598242ec1f9dd65acd6d9b07083c6317fac9f3163b34d07c8563e4c`. The sole expected record UUID `8BD8CF0F-622F-4F00-84B2-D803DD15EDE1` binds expected identifier/build24A434/arm64 to the same approved URL. Phase3 source images.plist hash `08fca67bd717824e0d532b373eabfc2b7aa8329453c7ca7272040c425bc196d1` is prior evidence; that installed catalog was not reread in phase4.

```text
/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime
```

## Inputs

Exact full paths and all four stat receipts are in metadata-input-hashes.json/result.json. Raw input bytes were not stored; hashes preserve identity. Successful conversion outputs are sanitized by key/URL/bearer rules. Nonpredicate feature keys containing auth/session were conservatively redacted.

| Input | Bytes | Result | SHA256 |
|---|---:|---|---|
| Runtime Info | 878 | Parsed/stable | `87c0dc59cebc228fc5fee40bfacd854a3cc4dd68dce6131ba4e5c30f20a572b5` |
| Runtime profile | 2530 | Parsed/stable | `31529d7b5ba245cbc3391629b0f8becbd67e725d8156eca3c510dc6f980742ff` |
| Runtime SystemVersion | 571 | Parsed/stable | `41ca552b38198d022aefb099e3fa40c530474456933613ada8365a078ad2cf0b` |
| Xcode Info | 34501 | Stable input; JSON output cap | `537783b4c639af6ee31208fe2ec12a40bacbb0fc8f5dd2820f54e03063c4dbe8` |
| Xcode version | 530 | Parsed/stable | `99aa0f4ffa738d03c9d86b273745d4a3945c7cdc7462221033fb807463d895e9` |
| Host SystemVersion | 604 | Parsed/stable | `bd61e19dd67dd97ce9a27c79a2148d42cc9685a71c6f17ff27d62b819f39f983` |
| iPhone17 Info | 888 | Parsed/stable | `7b919f007de487c548592a348a98f78f9cf8e48bffbc0a12ad1cc37e97422e1d` |
| iPhone17 profile | 1349 | Parsed/stable | `098e2080d544facbecaae8ec5eebc8b99de6581f02107ce753b80eba21597318` |

## Metadata predicates

Pure comparison of saved parsed metadata against unchanged [verifyInstalledCompatibility](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:172). No imported/called compatibility implementation, mock filesystem or trust bypass. 14 predicates match; 2 are unknown; no discrepancy among evaluated metadata values.

| Predicate | Verdict | Actual | Source anchor |
|---|---|---|---|
| host_platform_and_architecture | MATCH | `{"platform":"darwin","architecture":"arm64"}` | [src/observed/allocation-config.ts:175](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:175) |
| host_os_version_shape | MATCH | `{"ProductVersion":"27.0.1","ProductBuildVersion":"26A434"}` | [src/observed/allocation-config.ts:180](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:180) |
| xcode_bundle_identifier_and_executable | UNVERIFIED | `{"required":{"CFBundleIdentifier":"com.apple.dt.Xcode","CFBundleExecutable":"Xcode"},"reason":"Xcode Info.plist JSON output exceeded the diagnostic 65536-byte cap; no parsed fields retained."}` | [src/observed/allocation-config.ts:181](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:181) |
| xcode_minimum_host_version | UNVERIFIED | `{"required":"LSMinimumSystemVersion <= host ProductVersion","reason":"Same bounded Xcode Info.plist conversion stop."}` | [src/observed/allocation-config.ts:182](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:182) |
| xcode_version_and_build | MATCH | `{"CFBundleShortVersionString":"27.0","ProductBuildVersion":"27A266a"}` | [src/observed/allocation-config.ts:183](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:183) |
| device_identifier | MATCH | `{"CFBundleIdentifier":"com.apple.CoreSimulator.SimDeviceType.iPhone-17"}` | [src/observed/allocation-config.ts:191](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:191) |
| device_supported_architectures | MATCH | `{"supportedArchs":["arm64","x86_64"],"hostArchitecture":"arm64"}` | [src/observed/allocation-config.ts:195](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:195) |
| device_families_shape | MATCH | `{"supportedProductFamilyIDs":[1]}` | [src/observed/allocation-config.ts:196](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:196) |
| runtime_identifier | MATCH | `{"CFBundleIdentifier":"com.apple.CoreSimulator.SimRuntime.iOS-27-0"}` | [src/observed/allocation-config.ts:209](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:209) |
| runtime_platform_and_architectures | MATCH | `{"platformIdentifier":"com.apple.platform.iphonesimulator","supportedArchs":["arm64","x86_64"],"hostArchitecture":"arm64"}` | [src/observed/allocation-config.ts:216](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:216) |
| runtime_family_inclusion | MATCH | `{"deviceFamilies":[1],"runtimeFamilies":[2,1]}` | [src/observed/allocation-config.ts:217](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:217) |
| runtime_minimum_host | MATCH | `{"minHostVersion":"14.0.0","hostVersion":"27.0.1"}` | [src/observed/allocation-config.ts:218](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:218) |
| device_minimum_runtime | MATCH | `{"minRuntimeVersion":"26.0","runtimeVersion":"27.0"}` | [src/observed/allocation-config.ts:219](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:219) |
| device_maximum_runtime | MATCH | `{"maxRuntimeVersion":null,"absentIsAllowedByPredicate":true,"defaultCreationRange":{"versionMax":"99.99","versionMin":"26.0"},"defaultPairingRange":{"versionMax":"99.99","versionMin":"26.0"}}` | [src/observed/allocation-config.ts:220](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:220) |
| runtime_declared_and_actual_version | MATCH | `{"actual":"27.0","declared":"27.0"}` | [src/observed/allocation-config.ts:221](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:221) |
| runtime_identifier_version_and_build | MATCH | `{"runtimeId":"com.apple.CoreSimulator.SimRuntime.iOS-27-0","declared":"27.0","ProductBuildVersion":"24A434"}` | [src/observed/allocation-config.ts:222](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:222) |

## Concrete guard blockers

1. `/Applications` remains uid0/gid80/0775. Unchanged trustedPath rejects group-write. The owner authorized only Root preparation of that one narrow path repair; phase4 used no repaired source.
2. Xcode Info.plist stable input is34501bytes, but JSON conversion exceeds65536bytes. Captured stdout retains65536bytes and overflowtrue; complete output size/hash and parsed Xcode fields are unavailable. The unchanged production process and installedPlist enforce the same ceiling, so a separately reviewed bounded extraction/output-budget repair is required even after the first trust cutoff is fixed.
3. The directly observed runtime bundle is outside the default/per-volume roots and outside the unchanged metadata-child allowlist. Discovery and child authorization both require separate review.
4. Additional Cryptex directories and metadata leaves have group-write bits. The one /Applications owner decision does not cover these paths. `/private/var/run` is uid0/gid1/0775; runtime Info/profile leaves are uid0/gid80/0664. No permission change or expanded trust decision occurred.

| Exact path | Type | UID/GID | Mode | Links |
|---|---|---|---|---:|
| `/private/var/run` | directory | 0/1 | 0775 | 36 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator` | directory | 0/80 | 0775 | 3 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles` | directory | 0/80 | 0775 | 3 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes` | directory | 0/80 | 0775 | 3 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime` | directory | 0/80 | 0775 | 3 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents` | directory | 0/80 | 0775 | 6 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Info.plist` | file | 0/80 | 0664 | 1 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources` | directory | 0/80 | 0775 | 9 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources/profile.plist` | file | 0/80 | 0664 | 1 |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources/RuntimeRoot` | directory | 0/80 | 01775 | 14 |
| `/Applications` | directory | 0/80 | 0775 | 41 |

The production path predicate is [trustedPath](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:134); metadata leaf/process authorization is [allocationSourceProcess](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:85). Adding discovery coverage alone cannot satisfy them. Mount read-only state was not probed and is not inferred from these mode bits or catalog policy.

## Hypotheses and limits

H3 is now supported by direct stable bundle metadata, beyond catalog-only location. H2’s no-exposed-bundle portion is falsified at this exact candidate; the usable-production-compatible portion remains unknown. No claim is made about payload completeness, actual availability/operability, exactly-one matching installed bundle, executable/platform guards or production compatibility. No interpretation of catalog state5.

The exact next metadata candidate is Xcode Info.plist above, under a newly authorized bounded conversion/extraction scope. Root coordinates separately reviewed permission/process/discovery/output-budget repairs and host gates. This operator performs no further probe.

## Preservation and disposition

All15 accepted host,437 source/test/docs and68 compiled hashes match before/after; all56 referenced immutable phase1–3 artifacts/receipts/briefs and phase4 script/context references match before/after. New files only in operator-phase4 (700 directory,600 files). No parent/prior evidence edits, source changes or commit. No .env, directory inventory, executable/image/payload byte read, permission/store/config/journal/lease/device work, migration, mount/install/download/activation, test/build, compatibility call or bypass. Claims/devices retained.

L01–L05 remain **UNVERIFIED**. Return **IDLE**.
