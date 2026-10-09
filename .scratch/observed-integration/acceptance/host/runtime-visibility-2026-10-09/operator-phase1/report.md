# Runtime visibility diagnosis — phase 1 reproduced

## Actual result

The unchanged compiled verifyInstalledCompatibility returned **HOST_PREREQUISITE_MISSING** for iPhone 17 / com.apple.CoreSimulator.SimRuntime.iOS-27-0. The probe process exited 3, signal null, with empty stderr. Actual lookup start/end: 2026-10-09T02:06:04.201Z / 2026-10-09T02:06:04.202Z. Child Node start/end: 2026-10-09T02:06:04.118Z / 2026-10-09T02:06:04.205Z.

The last successful filesystem lookup was lstat(`/Applications`): directory, uid 0, gid 80, mode 0775, nlink 41. The first production failure is the trustedPath policy immediately following this successful stat: `s.mode & 0o022` is nonzero, so its group-write bit is rejected. No filesystem syscall itself failed. The wrapper returned the actual unaltered stat; no FS value was simulated.

The function never reached Xcode Info.plist, any version/profile plist, device-type enumeration, executable-path checks or runtime-root enumeration. Installed plist reads: **0**. Metadata process requests: **0**. Actual metadata child processes: **0**. Touched metadata plist hashes: none, because no plist was read. This result establishes the first production cutoff; it does not establish whether a compatible iOS 27.0 runtime is installed. The prior scoped negatives and owner's displayed component evidence are preserved.

## One-command invocation

Working directory: /Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic

```sh
env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS node .scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase1/run.mjs
```

run.mjs verified provenance, executed probe.mjs exactly once, and captured before/after hashes and exact argv/stdout/stderr/exit/signal in command.json. The actual child argv is ["/opt/homebrew/Cellar/node/26.8.1/bin/node","/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase1/probe.mjs"]. probe.mjs is a reusable read-only reproduction; this evidence wrapper refuses to overwrite its prior artifacts. No second lookup ran.

## Production seam and guards

The brief names installedHostProcess; that symbol is absent from the inspected Source/compiled module. The actual reviewed factory is **allocationSourceProcess(host, allowedArtifactRoots = [], launch = spawn)**. The probe used that unmodified factory with an empty artifact-root list, installedHost(), a transparent recording FS wrapper and two child guards. Only exact `/usr/bin/plutil -convert json -o - -- <approved-installed-plist>` arguments could execute. No xcrun/simctl/create, bridge/CLI/MCP/SDK or device operation was allowed. Executable metadata paths, if reached, were lstat-only. The imported compiled dependencies contain schemas and helpers; no store factory was invoked.

## Provenance

Evidence base HEAD: 4004ece782fc9448607605bfe3a54702f8622bb0. Tested product: b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433. All **15 accepted host files, 437 Source/test/docs paths and 68 compiled JavaScript files** match their frozen references before and after. The compiled reference is the preserved accepted Node24 installed-proof manifest, linked to current-product-correspondence.json; no rebuild or test suite ran.

- src/observed/allocation-config.ts SHA-256: b6519649edbaf203e5323a15c80273321a42a5cb49850551297268e6ee1f5f0a
- dist/observed/allocation-config.js SHA-256: 0926b7250a569f9f01d3557e528f4cb23ff2f702ae60cb1aba4f89ddfffa56e8

The named Orca terminal/tab/leaf remains the sole operator; read-only terminal show reported GPT-6.1-Sol xhigh with the integration working directory. The owner binding/component receipt is read-only parent evidence. Sensitive environment keys were removed before execution and from children without printing their values. No .env was loaded.

## Ranked next hypotheses — untested

The trust rejection above is observed and explained by unchanged code. The following hypotheses concern subsequent cutoffs or the component/runtime visibility discrepancy; none was tested.

1. **Other approved installed ancestor paths also fail the same trust policy.**
   Prediction: A newly authorized lstat-only inspection of the remaining fixed Xcode/OS/device-type/runtime ancestor paths finds additional root-owned group-writable directories that this predicate rejects. If those paths all satisfy the predicate, this hypothesis is falsified.
   Next bounded probe: Record only type/uid/gid/mode/nlink for a Root-approved finite installed-path list; no permission changes or runtime activation.

2. **The displayed iOS 27.0 component is an installed runtime image whose bundle is not currently exposed in the supported roots.**
   Prediction: Newly authorized component/catalog/image/mount metadata identifies the expected simulator runtime image, but no corresponding mounted .simruntime bundle is exposed in the supported roots. A currently exposed matching bundle falsifies this visibility explanation.
   Next bounded probe: Inspect exact component catalog and mount/image metadata named by Root; do not mount, install, download, or invoke simulator/device services.

3. **The current runtime bundle is stored at an installed location absent from the production hardcoded root list.**
   Prediction: Newly authorized component location metadata points to an existing .simruntime outside those roots whose Info.plist identifies com.apple.CoreSimulator.SimRuntime.iOS-27-0. A location within supported roots, or no matching bundle, falsifies this hypothesis.
   Next bounded probe: Follow only a specific catalog-reported installed metadata path after Root names and approves it; hash identifier/profile/SystemVersion plists without recursive app/user searches.

4. **The displayed iOS 27.0 component represents platform/SDK support without the required simulator runtime component.**
   Prediction: Newly authorized component manifest metadata classifies the entry as platform/SDK support and supplies no matching CoreSimulator runtime identifier/image. A manifest binding to the expected simulator runtime identifier falsifies this hypothesis.
   Next bounded probe: Read the specific component manifest fields that distinguish platform/SDK support from a simulator runtime; no SDK/bridge execution.

## Scope and return

Phase 1 ends here. No production admission/config/journal/lease or simulator Devices roots were accessed; no migration, activation, tests/builds, runtime installation/mounting, allocation, launch, capture, input, cleanup or permission changes occurred. All claims/devices and prior evidence remain preserved. L01–L05 remain **UNVERIFIED**. This is a diagnostic reproduction, not host/live/native acceptance or a verified fix. Root selects the next bounded metadata probe before further work.
