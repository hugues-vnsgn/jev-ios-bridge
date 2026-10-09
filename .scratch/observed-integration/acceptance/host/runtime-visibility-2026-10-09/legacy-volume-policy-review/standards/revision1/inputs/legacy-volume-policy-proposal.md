# Proposed read-only legacy runtime-volume policy

Revision1. Owner approval pending. No Source change is authorized by this proposal.

## Confirmed blocker

The repaired product passed both1999-test default/typecheck/build gates, both37-command installed npm/plugin proofs and wrapped startup. The once actual compatibility lookup at full HEAD `e971d3312b595a5d841b1d70288302c40f7a5b70` then refused `/Library/Developer/CoreSimulator/Volumes/iOS_22G86/Library/Developer/CoreSimulator/Profiles`: nonsymlink directory uid0/gid80/exact0775. It ran134 successful plutil children and no diskutil children; it stopped before Cryptex discovery. [Refusal](operator-repaired-compatibility/refusal-report.md), [Root provenance audit](root-repaired-compatibility-audit.json).

The approved Cryptex v3 policy explicitly preserved strict default and Volumes checks. Its approval does not authorize this extension. Names `iOS_22G86` and `iOS_23E254a` were observed in a bounded immediate listing; neither name proves a metadata identifier or read-only status. The sole operator's new manual diagnosis is pending. Owner approval will be requested only after its evidence and independent design reviews are retained.

## Proposed trust boundary

Keep `/Library/Developer/CoreSimulator/Profiles/Runtimes` and every unrecognized legacy-volume name under the original strict policy. Keep the approved Applications and Cryptex semantics and all public signatures unchanged.

Add one private recognized mount class: canonical immediate directories under exactly `/Library/Developer/CoreSimulator/Volumes`, with full basename grammar `^iOS_[0-9]{1,3}[A-Z]{1,3}[0-9]{1,6}[a-z]?$`. Names only classify a namespace; they never select, order or infer a runtime. Preserve the existing immediate-name validation for all Volumes entries. Strict ancestors from `/` through the fixed Volumes namespace must be nonsymlink directories, uid0 and not group/other writable. There is no writable-ancestor exception above these mounts.

Require a fresh bounded `/usr/sbin/diskutil info -plist <exact canonical mount root>` before and after every metadata conversion and every runtime listing. Require exact MountPoint and actual boolean Writable=false, WritableMedia=false and WritableVolume=false. Use the already shipped bounded XML parser, fixed executable/argv/environment and strict executable/Xcode validation. Bootstrap inspects only the finite namespace/mount-root chain and does not read runtime metadata or recursively ask its own verifier for a mount proof. Refuse missing, writable, mismatched, malformed, changed or uncertain proof. No cached mount proof authorizes a later read.

Within the confirmed mount, require every component to be on the mount root's device, nonsymlink, uid0 and gid0 or80. Directories allow only0755/0775; additionally01775 is allowed only at the exact `<root>/Library/Developer/CoreSimulator/Profiles/Runtimes/<bundle>.simruntime/Contents/Resources/RuntimeRoot`. Metadata leaves allow only0444/0644/0664, regular file, nlink1, at most65536 bytes. Reject other modes, setuid/setgid, world write, different owner/group/type, aliases and nested-device transitions. The actual modes remain to be measured; unsupported observations do not silently expand these sets.

Support only the fixed Runtimes suffix and the three already supported Info/profile/SystemVersion plist leaf forms. Classify recognized mounted namespaces before allowedArtifactRoots so an artifact prefix cannot downgrade their trust. Invalid targets within a recognized namespace refuse rather than fall through to ordinary artifact authorization.

Compare full before/opened/final/after identity including path, dev/ino, uid/gid, type/full mode, size/nlink and ctime/mtime for every component; compare exact metadata bytes before and after conversion. Each proof must match the mount identity in the full path snapshot. Check the caller's shared signal at every bounded stage; wait for actual child close. Preserve64KiB input and ordinary combined output, exact Xcode Info131072 output exception,10s mount deadlines and mount-only SIGTERM→250ms SIGKILL escalation. Other child termination behavior is unchanged.

## Enumeration and explicit runtime identity

Keep at most1000 immediate Volumes entries, at most64 recognized mount candidates in this namespace, at most1000 entries in any runtime listing, and at most1000 runtime bundles across default, legacy and Cryptex roots together. Keep8192 dispatched/actual children and the shared lookup deadline. Preserve existing Cryptex64-candidate bounds separately. Validate canonical paths up to4096 and basenames up to255.

Inspect all supported roots and match only the caller's explicit CFBundleIdentifier; missing or duplicate matches refuse. Do not skip an older recognized mount merely because its name differs from the requested identifier. Recognized mounts must satisfy the new proof even if their permissions would also satisfy the old rule. Unrecognized valid legacy names retain the strict old branch; `iOS_fixture` therefore retains its existing accepted regression. No newest-runtime selection, runtime fallback, runtime download or public path override.

## Implementation shape and required evidence

Extend the existing private mounted-metadata boundary to represent the two exact namespace classes. Share mount identity, read-only proof, bounded byte reads and conversion checks; namespace ancestry rules remain explicit. Avoid another copy of the read/proof/convert algorithm or a public configurable trust abstraction. No broader allocator, device or admission change is included.

Before repair add genuine failing regressions for the observed0775 legacy layout and typed read-only proof. Preserve all prior cases and assertions. Cover both exact name examples; name/path escape; missing/mismatched/writable/changed/uncertain proof; each owner/group/mode/type/symlink/hardlink/input/byte/identity/device failure; artifact-prefix bypass; duplicate identifiers across roots; enumeration/dispatch/deadline/abort/overflow; actual mount-child close and escalation. Preserve Applications/Cryptex behavior, existing strict legacy fixture and all other budgets. Then focused tests, actual unmodified defaults/typecheck/build on exact26.8.1 and24.0.0, independent Spec/Standards reviews, Source/compiled binding, clean installed proofs and wrapped startup precede integration and one new actual compatibility lookup.

## Limits of the decision

Read-only proof explains why mounted group-write mode bits cannot write the currently observed volume. This remains a mode-based policy trusting host namespace managers: it does not attest ACLs, exclusive writers, atomic ancestor pinning or immunity to privileged concurrent replacement. Before/after identity and bytes detect observed changes. No filesystem mode repair, mount change, cleanup or device operation is proposed.

The owner decision would amend strict checks only for this exact freshly confirmed legacy read-only mount class. Existing Applications/Cryptex approvals persist. Until approval, compatibility and operational entry remain refused/unverified; L01–L05 and ticket12 remain unstarted.
