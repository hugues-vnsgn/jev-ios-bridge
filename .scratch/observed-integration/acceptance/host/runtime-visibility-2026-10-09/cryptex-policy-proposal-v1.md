# Proposed bounded Cryptex runtime support

Status: proposal for independent review; no implementation or owner extension yet.

## Evidence and boundary

The runtime bundle directly confirms iOS 27.0/build24A434. Retained diskutil output names its exact Cryptex mount and reports `Writable=false`, `WritableMedia=false`, `WritableVolume=false`. Root parsed this 3,108-byte XML from repository evidence, verified against the complete original-output hash. [Derivation](root-phase5-retained-mount-derivation.json).

All seven sampled BSD flag values are zero. `/private/var/run` is root-owned, daemon-group, mode0775; its child `com.apple.security.cryptexd` is root/daemon/mode0705 and `mnt` is root/daemon/mode0755. The read-only volume explains ineffective write bits within the mounted runtime, but does not establish immutable ancestry. The owner has approved only the Applications exception so far.

## Proposed policy

Accept the OS-managed Cryptex namespace only under this additional explicit trust assumption: root and the daemon group may manage the exact `/private/var/run` namespace. Limit its writable-ancestor exception to a nonsymlink directory with uid0/gid1/exact0775, used only to reach the fixed `com.apple.security.cryptexd/mnt` subtree. Require those two following directories to be root-owned, nonsymlink and not group/other writable. Do not accept arbitrary daemon-owned or writable paths.

Enumerate only immediate mount-root directories under that fixed subtree, with finite count/path limits and a strict SimulatorRuntime name pattern. Enumerate only the fixed `Library/Developer/CoreSimulator/Profiles/Runtimes` suffix within a confirmed mount. Match the caller's explicit runtime identifier against stable bundle metadata across all supported roots; refuse missing or ambiguous matches. Never interpret a runtime version from the mount name or choose the newest runtime.

For each candidate, require bounded `diskutil info -plist <canonical exact mount root>` output with exact MountPoint and boolean `WritableVolume=false`, `WritableMedia=false`, `Writable=false`. Check stable root/ancestor identities and the leaf's device association around metadata reads and child conversion. Within that confirmed read-only volume, allow recorded group-write modes on root-owned directories and single-link regular metadata, while retaining nonsymlink/type/size/owner checks. Refuse writable, mismatched, missing, changed or uncertain mount metadata. Preserve the original strict policy outside these explicitly bounded paths.

Keep fixed executable/argv/environment authorization, input/output/time budgets, before/opened/final/after metadata identity and byte checks. No host permission changes, runtime downloads, mount operations, direct simulator listing, fallback, native cleanup or new public path override. The implementation must not recursively call the process guard while obtaining its own mount proof.

## Separate Xcode conversion change

The same stable 34,501-byte Xcode Info plist produces 77,555 bytes of JSON; required fields match. Permit a finite larger conversion output budget only for this fixed metadata target, or use bounded field extraction. Keep every other command's current output budget and all input/stability checks. Review the chosen form and genuine regressions before integration.

## Required checks and limits

Add genuine failing regressions before repair for the observed layout; negative cases for every exception, unsafe owner/group/mode/type/symlink, wrong or writable mount, alias/change, output overflow, command/env substitution, enumeration bounds, duplicate explicit-runtime matches and cancellation. Run focused, typecheck/build and actual default gates on both approved Node versions, independent Spec/Standards reviews and clean installed proofs.

This policy trusts OS namespace managers and does not certify atomic safety against their concurrent path replacement. Mount and file before/after checks detect observed changes; they are not a kernel capability pinning every ancestor. Apple documents separate SIP flags and entitlement controls, and XNU defines restricted and no-unlink flags; neither was observed on the seven sampled paths. [Apple filesystem protections](https://developer.apple.com/library/archive/documentation/Security/Conceptual/System_Integrity_Protection_Guide/FileSystemProtections/FileSystemProtections.html), [Apple XNU flag definitions](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/stat.h). Node's documented StatFs fields do not expose mount read-only flags, so the existing storage probe cannot establish this property. [Node24 StatFs](https://nodejs.org/docs/latest-v24.x/api/fs.html#class-fsstatfs).

After independent design review, Root asks only for the additional daemon-namespace trust decision needed by this proposal. Existing Applications authorization persists. Other authorized repair/review work continues while that decision is pending. Actual compatibility, operational entry and L01-L05 remain unverified.
