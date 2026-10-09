# Cryptex design review

**Verdict: conditional.** Obtain the additional owner decision and define the missing rules before implementation. This reviews the proposal and retained evidence; production compatibility and L01–L05 remain unverified.

## Required decision

Trust root and every actor with daemon-group authority to manage entries in exactly `/private/var/run`, solely to reach `com.apple.security.cryptexd/mnt`. Its root0/daemon1/0775 parent permits namespace replacement despite the child’s 0705 mode. Applications approval does not authorize this trust. Keep the proposal’s explicit limitation on concurrent replacement by trusted namespace managers. Zero sampled BSD flags establish no SIP protection; Apple describes separate protection flags. [Apple](https://developer.apple.com/library/archive/documentation/Security/Conceptual/System_Integrity_Protection_Guide/FileSystemProtections/FileSystemProtections.html).

## Rules missing from the proposal

- Bind every directory below the mount, the opened file, and the final leaf to the proven mount device. A leaf-only comparison leaves nested mounts unspecified. Revalidate mount properties around conversion; stable inode/device values alone cannot detect a change in mount write status. Keep proof local to that operation.
- Replace “recorded group-write modes” with exact accepted owner/group/mode sets. Preserve rejection of other-write and unapproved special bits; explicitly handle the observed 01775 RuntimeRoot.
- Define the mount-name grammar, full-path length, total roots/bundles/metadata-command counts and cancellation checks. Existing compatibility execution has a ten-second stage deadline; retain it.
- Specify a nonrecursive bootstrap guard for diskutil: canonical namespace, candidate directory, fixed executable/argv/environment, strict executable checks, bounded complete output, stable chain. Then authorize only the three runtime metadata suffixes using its proof.
- Select a shipped parser. The diagnostic `plist` import is unavailable and its hypothetical `ReadOnlyVolume` key is absent. Require exact `MountPoint` and strictly boolean false writable fields; reject duplicates, malformed XML and expansion. Follow no returned location.

The existing runner sends SIGTERM and awaits close without escalation. Its timeout does not prove child termination. Specify bounded termination and tracked uncertainty for the new metadata command. [Node24](https://nodejs.org/download/release/v24.0.0/docs/api/child_process.html#subprocesskillsignal).

## Optional design advice

Keep discovery, path proof and conversion inside one installed-metadata module, behind the existing compatibility interface. A private bootstrap runner avoids recursive process authorization. Prefer a fixed 128 KiB Xcode-Info output cap across both guards: the recorded 77,555 bytes fit. Keep the 64 KiB input cap and other output caps.

The retained XML proves unwritable metadata at one observation. It supplies neither cryptographic Apple provenance nor atomic path pinning.
