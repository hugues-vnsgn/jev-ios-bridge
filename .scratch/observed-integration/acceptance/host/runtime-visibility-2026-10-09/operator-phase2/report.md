# Runtime visibility phase 2 — bounded installed metadata

The authorized metadata batch ran once. Exit 0, signal null, empty probe stderr. Probe time 2026-10-09T02:18:01.237Z to 2026-10-09T02:18:01.268Z. No actual production compatibility call ran.

## Observed iOS 27.0 metadata

A stable local MobileAsset Info.plist at `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/3e800c38767f9f2c5fc86acdad7adf44565e051a.asset/Info.plist` declares:

- CFBundleIdentifier: `com.apple.MobileAsset.iOSSimulatorRuntime`
- CFBundleName: `SimulatorRuntimeAsset`
- MobileAssetProperties.SimulatorVersion: `27.0`
- MobileAssetProperties.Build: `24A434`
- MobileAssetProperties.Architectures: `[arm64]`
- Input: 875 bytes; SHA-256 `9c132a7b98c399f764873f4c70ade83e8e44ee2ee9356135a13f49d15c921243`, identical before/after conversion.

This identifies local simulator-runtime asset metadata. Payload completeness, an exposed .simruntime bundle, its exact CoreSimulator identifier/profile, availability and production compatibility remain unresolved.

Two other stable SimulatorRuntimeAsset records declare 18.6/build22G86 and 26.4.1/build23E254a. All three asset Info.plist conversions exited0. Their immediate AssetInfo.plist paths and the asset-root Info.plist/AssetInfo.plist paths returned scoped ENOENT.

## Fixed ancestor analysis and inventories

The 14 fixed targets were inspected through a cached unique lstat ancestor set. The original trustedPath owner/write/symlink/type predicate was evaluated separately; no filesystem value or product function was substituted. Only `/Applications` (uid0,gid80,0775) has an owner/write/symlink-policy violation in the fixed inspected paths. Every Xcode target retains that first production cutoff. The default `/Library/Developer/CoreSimulator/Profiles/Runtimes` is scoped ENOENT. No inspected symlink was followed.

| Immediate root | Result / names |
| --- | --- |
| `/Library/Developer/CoreSimulator/Images` | `Inbox`, `images.plist`, `mnt` |
| `/Library/Developer/CoreSimulator/Cryptex` | `Caches`, `Images`, `Personalization` |
| `/Library/Developer/CoreSimulator/Volumes` | `iOS_22G86`, `iOS_23E254a` |
| `/Library/Developer/CoreSimulator/Profiles/Runtimes` | ENOENT |
| `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime` | `3e800c38767f9f2c5fc86acdad7adf44565e051a.asset`, `7fd8477b73d7b67a321fff7d87723eed3c628424.asset`, `c060853b459625d7878fd533de79c966fb98d31b.asset`, `com_apple_MobileAsset_iOSSimulatorRuntime.xml` |

Four immediate asset children were lstat-inspected: three asset directories and one XML catalog file. The XML contents were not read. No 1000-name, 50-child, 1MiB-input, output or time cap was exceeded.

## Catalog conversion limit

`/Library/Developer/CoreSimulator/Images/images.plist` was stable before/after:3929bytes, SHA-256 `08fca67bd717824e0d532b373eabfc2b7aa8329453c7ca7272040c425bc196d1`. Its one permitted `/usr/bin/plutil -convert json -o - -- <path>` conversion exited1, no signal, stdoutempty. Stderr was94bytes; the recorder conservatively redacted all nonempty stderr and retained its size/SHA-256. The exact error wording is therefore unavailable in the saved artifacts, and no cause is inferred. No conversion fallback or second batch was run.

## Bounded hypothesis verdicts

1. **FALSIFIED** — Additional fixed installed ancestors also violate the original owner/write/symlink trust predicate.
   Evidence: Only /Applications (uid0,gid80,0775) violates those checks across the inspected fixed paths. The missing default Profiles/Runtimes is scoped ENOENT, not an additional permission violation.
   Limit: Finite dispatched ancestor set only; no broader filesystem claim.

2. **STILL_UNKNOWN** — The iOS27 component is a runtime image without a currently exposed bundle in production-supported roots.
   Evidence: Stable local SimulatorRuntimeAsset Info.plist declares SimulatorVersion27.0, Build24A434, arm64. The default runtime root is ENOENT; immediate Volumes names are iOS_22G86 and iOS_23E254a. These observations support runtime-asset presence.
   Limit: No image bytes, asset payload, image catalog fields, mount mapping or per-volume bundle inventory was obtained. Current exposure of a matching .simruntime is unresolved.

3. **STILL_UNKNOWN** — The actual matching .simruntime bundle lies outside production hardcoded roots.
   Evidence: The iOS27 MobileAsset metadata resides under AssetsV2, outside production bundle-search roots.
   Limit: A MobileAsset directory is not proof of a .simruntime bundle. No catalog location was recovered; no reported or derived candidate path was followed.

4. **FALSIFIED** — No iOS27 simulator-runtime component metadata exists; installed evidence is platform/SDK-only.
   Evidence: CFBundleIdentifier=com.apple.MobileAsset.iOSSimulatorRuntime and CFBundleName=SimulatorRuntimeAsset explicitly identify local SimulatorVersion27.0 metadata.
   Limit: This falsifies the SDK-only absence explanation at metadata level. The screenshot-to-asset binding, actual payload completeness, exact com.apple.CoreSimulator.SimRuntime.iOS-27-0 bundle identity, availability and production compatibility remain unverified.

## Exact next candidate paths

No converted catalog or asset Info.plist supplied a location field. The following observed or explicitly derived paths are candidates for a new Root approval; no expansion was performed:

- `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/3e800c38767f9f2c5fc86acdad7adf44565e051a.asset`
  Basis: Observed immediate AssetsV2 child; directory lstat-confirmed; Info.plist identifies iOS27.0 build24A434 arm64.
  Phase2 access: Directory lstat and Info.plist only; no child inventory/payload read.
- `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/com_apple_MobileAsset_iOSSimulatorRuntime.xml`
  Basis: Observed immediate asset-root name; lstat says regular file. Contents not read.
  Phase2 access: Name and lstat only.
- `/Library/Developer/CoreSimulator/Images/images.plist`
  Basis: Stable3929-byte catalog; exact allowed plutil JSON conversion exited1, stdoutempty, stderr94bytes redacted.
  Phase2 access: Stable read/hash before and after one conversion attempt.
- `/Library/Developer/CoreSimulator/Images/mnt`
  Basis: Exact immediate name under approved Images root; child type/content not inspected.
  Phase2 access: Name only.
- `/Library/Developer/CoreSimulator/Cryptex/Images`
  Basis: Exact immediate name under approved Cryptex root; child type/content not inspected.
  Phase2 access: Name only.
- `/Library/Developer/CoreSimulator/Volumes/iOS_22G86/Library/Developer/CoreSimulator/Profiles/Runtimes`
  Basis: Derived production search path from an observed immediate Volumes name; full path existence not checked in phase2.
  Phase2 access: Volume name only; derived full path not followed.
- `/Library/Developer/CoreSimulator/Volumes/iOS_23E254a/Library/Developer/CoreSimulator/Profiles/Runtimes`
  Basis: Derived production search path from an observed immediate Volumes name; full path existence not checked in phase2.
  Phase2 access: Volume name only; derived full path not followed.

Cryptex Caches/Personalization names were recorded only as required immediate inventory output; those directories were not entered or proposed for inspection.

## Invocation, provenance and binding

Working directory: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic`.

```sh
env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS node .scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase2/run.mjs
```

Exact argv/cwd/time/exit/signal and sanitized probe output are in command.json. Four metadata children used only the exact allowed plutil command, shell:false, ignored stdin and fixed HOME(account)/PATH/LANG/LC_ALL/DEVELOPER_DIR. No inherited credential/loader options or .env were used. Stable input read/hash checks used O_RDONLY|O_NOFOLLOW and before/open/final/after stats. Only approved metadata files were read; executable paths were lstat-only.

HEAD: `4004ece782fc9448607605bfe3a54702f8622bb0`; product: `b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433`. The same15host+437source+68compiled frozen references matched before and after. Phase1 artifacts, parent audit/binding and dispatch brief also matched before and after.

The owner-confirmed GPT-6.1-Sol xhigh binding remains authoritative. Read-only Orca terminal show returned the same handle/tab/leaf; its current preview was a model menu, so that preview did not independently prove the current selected model. No terminal creation, input or model-change command ran. Orca retains its main-checkout ownership metadata; every diagnostic command and both scripts enforce the integration cwd.

## Stop

Only new private700/600 operator-phase2 artifacts were written. No device, production store/config/journal/lease, migration, activation, permission change, source/test edit, test/build, runtime installation/mounting, executable-byte read, image/dmg-byte read, process scan or SDK/backend/MCP work ran. No catalog-reported location or deeper candidate path was followed. L01–L05 remain UNVERIFIED. These artifacts are diagnostic metadata, not acceptance evidence. Operator returns idle.
