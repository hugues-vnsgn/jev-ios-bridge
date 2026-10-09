# Runtime visibility phase3 — exact catalog location found

The finite metadata batch ran once. Exit 0, signal null, empty probe stderr. Probe time 2026-10-09T02:27:02.080Z to 2026-10-09T02:27:03.306Z. No production compatibility call or bypass ran.

## Stable iOS27 CoreSimulator catalog record

Python3 standard-library plistlib successfully parsed the single approved `/Library/Developer/CoreSimulator/Images/images.plist` input. Its3929bytes and SHA-256 `08fca67bd717824e0d532b373eabfc2b7aa8329453c7ca7272040c425bc196d1` matched before/opened/final/after checks and the second nofollow read after parsing. Parsing exception: none. The hash also equals the preserved phase2 input hash.

- Runtime identifier: `com.apple.CoreSimulator.SimRuntime.iOS-27-0`
- Build: `24A434`
- Platform: `com.apple.platform.iphonesimulator`
- Supported architectures: `["arm64"]`
- Cryptex variant: `Arm64Only Customer Simulator Runtime`
- Catalog state: `5` (recorded only; no state semantics inferred)
- Catalog source: `file:///System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/3e800c38767f9f2c5fc86acdad7adf44565e051a.asset/AssetData/`
- Catalog bundle URL: `file:///private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS%2027.0.simruntime/`

Decoded exact bundle candidate:

`/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime`

This path is outside the unchanged production default/per-volume runtime search roots. It was not lstat/opened/inventoried or otherwise followed. A stored catalog record establishes the location claim; it does not establish current mounted state, bundle identity on disk or usable compatibility.

## Finite inventories

| Exact approved root | Result / immediate names |
| --- | --- |
| `/Library/Developer/CoreSimulator/Cryptex/Images` | `Inbox`, `bundle`, `mnt` |
| `/Library/Developer/CoreSimulator/Images/mnt` | empty |
| `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/3e800c38767f9f2c5fc86acdad7adf44565e051a.asset` | `AssetData`, `Info.plist`, `version.plist` |
| `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/3e800c38767f9f2c5fc86acdad7adf44565e051a.asset/AssetData` | `Restore` |
| `/Library/Developer/CoreSimulator/Cryptex/Images/bundle` | `SimRuntimeBundle-295A47AD-585D-4F25-875F-CD9B5078FE66`, `SimRuntimeBundle-DEC29122-A7BB-4891-827C-AD42F1979D7F` |
| `/Library/Developer/CoreSimulator/Cryptex/Images/bundle/Library/Developer/CoreSimulator/Profiles/Runtimes` | ENOENT |
| `/Library/Developer/CoreSimulator/Cryptex/Images/Inbox` | empty |
| `/Library/Developer/CoreSimulator/Cryptex/Images/Inbox/Library/Developer/CoreSimulator/Profiles/Runtimes` | ENOENT |
| `/Library/Developer/CoreSimulator/Cryptex/Images/mnt` | empty |
| `/Library/Developer/CoreSimulator/Cryptex/Images/mnt/Library/Developer/CoreSimulator/Profiles/Runtimes` | ENOENT |

Three immediate nonsymlink directory children of Cryptex/Images were inspected: bundle, Inbox and mnt. Their immediate names and only the fixed runtime suffix were inventoried. Images/mnt has no immediate directory children. No directly named .simruntime bundle appeared in these exact locations; consequently no bundle plist was opened and no plutil child ran. The27.0 AssetData directory contained only Restore; its immediate lstat was recorded and no Restore descendant or bytes were read. The two SimRuntimeBundle-* names under bundle are returned as exact unvisited candidates, not searched recursively. All entry/child/input/output/time caps were respected.

## Hypothesis results

2. **STILL_UNKNOWN** — The iOS27 runtime image lacks a currently exposed usable bundle.
   Evidence: The stable images catalog binds the expected CoreSimulator identifier/build24A434/arm64 to an exact private cryptexd runtime-bundle path. Permitted image-root mnt inventories were empty; the asset AssetData contains only an immediate Restore directory.
   Limit: The catalog path was not followed. State5 was recorded numerically without interpreting its meaning. Catalog location is not current mounted/bundle/compatibility proof.

3. **SUPPORTED** — The iOS27 catalog location is outside production hardcoded runtime search roots.
   Evidence: runtimeInfo.bundlePath references /private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime; production searches only the default Profiles/Runtimes and CoreSimulator Volumes/<name>/.../Profiles/Runtimes roots.
   Limit: Direct bundle existence, canonical path/no-symlink chain, identifier/profile/SystemVersion and actual compatible availability remain UNVERIFIED.

## Concrete prerequisite decision and next finite candidates

A separately reviewed host/trust-policy decision is required to resolve the /Applications0775 rejection before production compatibility can pass. This batch made no permission or policy change.

The catalog additionally exposes a production discovery coverage gap if this reported Cryptex bundle is directly confirmed. The next useful bounded approval is the exact candidate ancestor/canonical-path check and only these three metadata files:

- `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Info.plist`
- `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources/profile.plist`
- `/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist`

Each is derived from the exact catalog URL, unvisited and existence UNVERIFIED. Root must dispatch a new bounded scope before any is followed; no mount, permission change or compatibility rerun is part of this result.

Other exact immediate-name candidates:

- `/Library/Developer/CoreSimulator/Cryptex/Images/bundle/SimRuntimeBundle-295A47AD-585D-4F25-875F-CD9B5078FE66` — immediate name only; no descendant access.
- `/Library/Developer/CoreSimulator/Cryptex/Images/bundle/SimRuntimeBundle-DEC29122-A7BB-4891-827C-AD42F1979D7F` — immediate name only; no descendant access.

The full sanitized catalog and candidate-paths.json preserve other reported locations, including older runtime bundles, image/dmg and personalization URLs. Those bytes/locations were not read; none is proposed for image/personalization inspection.

## Invocation, guards and provenance

Working directory: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic`.

```sh
env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS node .scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase3/run.mjs
```

The only metadata child argv was `["/usr/bin/python3","-I","-S","-B","/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase3/parse-images.py","/Library/Developer/CoreSimulator/Images/images.plist"]`, shell:false, stdinignored, fixed HOME(account)/PATH/LANG/LC_ALL/DEVELOPER_DIR and no inherited loader/key options. Python -I/-S isolates environment/site loading; -B disables bytecode writes. The fixed script accepts only this cwd and images.plist path. It uses O_RDONLY|O_NOFOLLOW, checks every ancestor without following symlinks, caps the input at1MiB and preserves datetime as ISO-tagged values, UID as tagged integers and data as byte-count/SHA-256. Credential/token/auth/session keys and credential-bearing URL parts are redacted before output storage. The8MiB output cap was not approached. Exact sanitized argv/time/exits/stdout/stderr are in command.json/child-receipts.json.

HEAD `4004ece782fc9448607605bfe3a54702f8622bb0`; product `b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433`. All15acceptedhost+437source+68compiled references match before/after, as do immutable phase1/2 artifacts and consumed receipts/briefs. Exact phase3 probe/parser script hashes were checked before/after too. The same sole Orca handle/tab/leaf matched, and the read-only preview displayed GPT-6.1-Sol xhigh and integration cwd. No terminal/model/input command changed that binding.

## Stop

Only new private700/600 operator-phase3 artifacts were written. No catalog location was followed, no runtime executable/framework/dmg/image/payload bytes opened, and no device/store/config/journal/lease/migration/activation/mount/installation/permission/source/test/build/process-scan/SDK/backend/MCP effect ran. No .env was loaded; every claim/device and prior evidence remains preserved. Full installed compatibility and L01–L05 remain UNVERIFIED. This is metadata diagnosis, not acceptance evidence or a verified repair. Operator returns idle.
