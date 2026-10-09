# Once guarded repaired installed compatibility: REFUSED

`verifyInstalledCompatibility()` ran exactly once and returned `HOST_PREREQUISITE_MISSING` (outer exit3). No guard mismatch. Attempt: 2026-10-09T06:22:10.426Z–2026-10-09T06:22:10.971Z.

## First confirmed cause

`/Library/Developer/CoreSimulator/Volumes/iOS_22G86/Library/Developer/CoreSimulator/Profiles` is a nonsymlink directory uid0/gid80/mode0775, device16777251/inode19. Production `trustedPath` rejects its group write bit at Source:250 / compiled:369. This legacy volume path is outside the approved fixed Applications and Cryptex exceptions. The final genuine lstat and caller stack are filesystem trace sequence9002. The inner reason is derived from the unchanged predicate; production exposes only its prerequisite error.

The earlier default runtime-root ENOENT is explicitly tolerated by production. The fatal strict ancestor refusal occurs while enumerating iOS_22G86; it stops before Cryptex discovery. No Cryptex lstat, diskutil child, runtime bundle listing or requested iOS27.0 runtime proof ran. This result makes no claim about runtime absence or usable compatibility.

## Completed metadata and provenance

All134 permitted children were exact plutil metadata conversions, exit0, signalnull, confirmed close, complete raw output, no kill calls. Xcode Info conversion returned77555bytes successfully under its approved131072 limit; Xcode27.0/build27A266a and macOS27.0.1/build26A434 were read fresh. All130 device Info records and the unique requested iPhone17 profile were inspected. These fields do not constitute a returned InstalledCompatibility result.

The sole owner-confirmed GPT-6.1-Sol xhigh pane and actual integration CWD were used. Full HEAD remains e971d3312b595a5d841b1d70288302c40f7a5b70. Product Source3edf247ab44d3332bc4bab5f3a43104536d84ce9 corresponds to candidate720cb380d07102d72b20a6a4f5f7787a0ab88f2b. Source441, compiled69, original15 host and121 explicit prior-evidence/script bindings all match before, after and final completion capture. No main working-tree files were used.

Complete filesystem identity/caller/byte traces (8197events,402 readonly metadata opens), exact scripts/command/argv/environment receipts, caller-process traces, original and retained byte hashes, child exit/close events and unredacted private raw binaries are retained beside this report. Only new private operator-repaired-compatibility artifacts were written. Existing fake host traces, caches and symlinks were not traversed or modified.

The pure guard audit accepts bounded65537 sentinel requests; actual pinned Source/dist issued65536 requests and input cap stayed65536. No native trial preceded the single lookup. Production counters, internal command authorization, nested-proof code, deadline, abort, termination and close behavior remain unchanged.

No second lookup or fallback, account/store/config/migration/activation, device/simulator/SDK/network/backend command, app build, live case, cleanup, permissions or claim change. L01–L05 remain UNVERIFIED. Operator idle.
