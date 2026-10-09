# Runtime visibility phase5 — metadata diagnosis

## Result

One finite batch completed once. Nine permitted metadata children all exited0, signalnull, stderr empty; no timeout, overflow or target-chain change. No acceptance verdict or repair was applied.

Xcode Info.plist input is stable34501bytes and matches phase4 SHA `537783b4c639af6ee31208fe2ec12a40bacbb0fc8f5dd2820f54e03063c4dbe8`. Complete JSON output is **77555bytes**, SHA `3b78d94ef7ee6f9ab11db94a9b3aa2513c77668ff00fa3227a7a12186ac32d33`, fitting1MiB while exceeding the unchanged production65536-byte limit by12019bytes. `CFBundleIdentifier=com.apple.dt.Xcode`, `CFBundleExecutable=Xcode` and `LSMinimumSystemVersion=26.6 <=27.0.1` all match production metadata predicates. The host version is prior accepted phase4 evidence; it was not reread. The two previously unknown phase4 metadata groups are resolved at metadata level.

The seven stat calls each recorded numeric flags `0` and text `-`, with stable exact device/inode/ownership/mode correspondence. No flag interpretation or trust approval is inferred. The mount/three leaves share device16777243; namespace ancestors use16777231. Different device numbers alone establish no read-only or protection claim.

Diskutil info succeeded with a complete bounded3108-byte XML result, SHA `338fdeb495a2a8d58be5e79ed9d2637d64bdbb6c7e9ba552b3aa345a34f2562d`. Installed package `plist` is unavailable (`MODULE_NOT_FOUND`), so the approved parser did not verify returned MountPoint or writable/read-only fields. **H1 read-only conclusion remains UNKNOWN.** The complete sanitized XML is preserved in [diskutil-info-output.xml](diskutil-info-output.xml) for Root review. No alternate parser or returned-device/path query was used.

## Ranked hypotheses

| Rank | Disposition | Evidence and limitation |
|---:|---|---|
| 1 | UNKNOWN — approved parser unavailable | Stable exact diskutil invocation/output; MountPoint/readonly correspondence remains unverified by approved parser. |
| 2 | UNSUPPORTED by recorded flags | All seven results0/`-`; these values provide no protection-policy approval or global statement. |
| 3 | SUPPORTED — metadata only | Stable complete Xcode JSON77555bytes; identifier/executable/min-host match. Production limits remain unchanged. |

## Binding and provenance

The complete phase5 brief was read before forming the probe. Same sole connected/nonorphaned Orca handle `term_19640861-824c-4f24-8789-3f584723bc5a`, same incarnation/tab/leaf and runtime `5f433f83-b0b5-4579-b844-952323951016`. Fresh read-only preview confirms GPT-6.1-Sol xhigh and integration cwd. Orca ownership metadata names the main checkout; context.json discloses this distinction. No new pane or terminal input. Actual cwd is `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic`. HEAD `4004ece782fc9448607605bfe3a54702f8622bb0`; accepted product `b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433`; no candidate repair is integrated or used.

Phase3 catalog/candidate and phase4 result hashes were asserted against immutable manifests. Mount root is derived only from their sole expected runtime record UUID `8BD8CF0F-622F-4F00-84B2-D803DD15EDE1`, identifier `com.apple.CoreSimulator.SimRuntime.iOS-27-0`, build24A434. No other record/mount was substituted.

```text
/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ
```

## Invocation and child guards

```text
env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS node .scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase5/run.mjs
```

Probe executable `/opt/homebrew/Cellar/node/26.8.1/bin/node`; exact argv/cwd/timestamps/output in command.json. Start `2026-10-09T03:10:19.276Z`, end `2026-10-09T03:10:19.488Z`; exit0/signalnull/stderr empty. Guard permits only one `/usr/sbin/diskutil info -plist <exact mount>`, seven `/usr/bin/stat -f %d|%i|%u|%g|%p|%f|%Sf <exact path>` calls without `-L`, and one `/usr/bin/plutil -convert json -o - -- /Applications/Xcode.app/Contents/Info.plist`. At most once per exact argv;10s timeout,12s hard termination,1MiB stdout+stderr per child. Fixed account HOME/PATH/LANG/LC_ALL/DEVELOPER_DIR; shellfalse/ignoredstdin; no key/loader inheritance. Executables/ancestors lstat-only.

Every child has before/after finite target-chain lstat checks. Any symlink/non-directory ancestor/change fails that subprobe. Xcode is the sole installed input-byte read: regular/nonsymlink/nlink1, O_RDONLY/O_NOFOLLOW,65536-byte max, expected SHA and stable before/opened/final/after stats/hash. No runtime leaf/executable bytes were read. Complete output hashes are original bytes; saved text/JSON outputs are sanitized.

| Receipt | Child | Start UTC | End UTC | Exit / signal | stdout / stderr bytes | stdout SHA256 |
|---:|---|---|---|---|---:|---|
| 0 | EXACT_DISKUTIL_INFO | 2026-10-09T03:10:19.312Z | 2026-10-09T03:10:19.426Z | 0 / null | 3108 / 0 | `338fdeb495a2a8d58be5e79ed9d2637d64bdbb6c7e9ba552b3aa345a34f2562d` |
| 1 | EXACT_LSTAT_FLAGS | 2026-10-09T03:10:19.427Z | 2026-10-09T03:10:19.431Z | 0 / null | 33 / 0 | `4084364ae7f6c789746bad747c69bfba6ad4342f9f010a8831cc8839ed5c7fe1` |
| 2 | EXACT_LSTAT_FLAGS | 2026-10-09T03:10:19.432Z | 2026-10-09T03:10:19.434Z | 0 / null | 33 / 0 | `6a2f51e0f1abaf5ab52cd4ba8d0e19ff82493ec874f6b316188a9779b43abafb` |
| 3 | EXACT_LSTAT_FLAGS | 2026-10-09T03:10:19.434Z | 2026-10-09T03:10:19.436Z | 0 / null | 33 / 0 | `830b349954a0c9a82bd0d31a92f0b84b59b59c838483d60537bfd653f8f23634` |
| 4 | EXACT_LSTAT_FLAGS | 2026-10-09T03:10:19.436Z | 2026-10-09T03:10:19.438Z | 0 / null | 25 / 0 | `addb51cdf29d2ff774183ac32e0dbb4fda6389bd1fb3c12fdb33b4bdc02f5591` |
| 5 | EXACT_LSTAT_FLAGS | 2026-10-09T03:10:19.439Z | 2026-10-09T03:10:19.441Z | 0 / null | 28 / 0 | `77932f13a1dbad6d9571effa7e4333ca830e966b80f1d80d98a1a2c907376b57` |
| 6 | EXACT_LSTAT_FLAGS | 2026-10-09T03:10:19.451Z | 2026-10-09T03:10:19.453Z | 0 / null | 32 / 0 | `7771129508d003847d5028436307d6da096e5229575be23c5fa2eb69e71fd902` |
| 7 | EXACT_LSTAT_FLAGS | 2026-10-09T03:10:19.472Z | 2026-10-09T03:10:19.475Z | 0 / null | 31 / 0 | `c44b5c8dc1783c8d39ea88d002ccfaddc9c03d62389d87e89e59c85050bc4fea` |
| 8 | EXACT_XCODE_PLUTIL_1MIB | 2026-10-09T03:10:19.477Z | 2026-10-09T03:10:19.482Z | 0 / null | 77555 / 0 | `3b78d94ef7ee6f9ab11db94a9b3aa2513c77668ff00fa3227a7a12186ac32d33` |

## Exact flag observations

Mode column preserves stat `%p` including file-type bits; numeric/text flag columns preserve `%f`/`%Sf` without guessing constants. Full ancestor stats and precise stdout are in result.json/child-receipts.json/stat-flags.json.

| Exact path | Device | Inode | UID/GID | Mode as returned | Flags numeric / text | lstat match |
|---|---:|---:|---|---|---|---|
| `/private/var/run` | 16777231 | 121903564 | 0/1 | 40775 | 0 / `-` | MATCH |
| `/private/var/run/com.apple.security.cryptexd` | 16777231 | 141253924 | 0/1 | 40705 | 0 / `-` | MATCH |
| `/private/var/run/com.apple.security.cryptexd/mnt` | 16777231 | 141253927 | 0/1 | 40755 | 0 / `-` | MATCH |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ` | 16777243 | 2 | 0/0 | 40755 | 0 / `-` | MATCH |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Info.plist` | 16777243 | 23 | 0/80 | 100664 | 0 / `-` | MATCH |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources/profile.plist` | 16777243 | 843659 | 0/80 | 100664 | 0 / `-` | MATCH |
| `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist` | 16777243 | 241634 | 0/0 | 100444 | 0 / `-` | MATCH |

## Proposed next design scope

1. Root reviews the saved bounded XML or authorizes a finite in-memory parser for this existing evidence. Any mount protection conclusion must bind explicit writable/read-only metadata to the exact returned MountPoint. No requery or returned-path expansion was performed.
2. Root separately reviews a finite Xcode metadata conversion budget/extraction. Current JSON is77555bytes; current process/installedPlist both enforce65536. Relevant anchors: [process output limits](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:99), [capture limit](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:121), [installedPlist limit](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/src/observed/allocation-config.ts:150). The diagnostic1MiB budget leaves production unchanged.
3. Root defines finite Cryptex discovery/child-authorization coverage and a separate trust strategy covering the exact candidate plus writable ancestors. Owner trust covers ONLY the exact /Applications exception. A read-only mount would not establish atomic protection of its writable ancestors or certify hostile-admin safety. This batch supplies no policy approval.

Production still has the recorded /Applications trust cutoff, the Xcode output ceiling, missing Cryptex discovery/child coverage and additional group-write trust requirements. No production compatibility call, bypass, executable/platform guard certification, runtime-operability test or live entry was made.

## Preservation and disposition

All15 host,437 source/test/docs and68 compiled hashes match before/after. All76 referenced phase1–4 artifacts/manifests, consumed evidence/briefs and exact phase5 script/context references match before/after. Prior evidence remains intact. Only new private operator-phase5 files were written (700 directory,600 files). No parent edit, commit, source/permission/ACL/flag change, .env, inventory, device/store/config/journal/lease work, migration, mount/install/download/activation, SDK/backend/simctl/xcrun, payload/image read, build/test or cleanup. All allocations/claims/devices retained; sole heavy test/build window unused.

**L01–L05 remain UNVERIFIED. Return IDLE.**
