# Legacy-volume manual diagnosis: two exact unwritable mount proofs

Attempt 2026-10-09T06:54:39.090Z–2026-10-09T06:54:39.370Z. Exactly two serial diskutil info -plist children, once per exact root, both exit0/signalnull/confirmed close; no overflow, timeout, kill, parser refusal or symlink/error observation. Complete raw outputs:3092bytes and3093bytes, stderr0.

The shipped pure parser returns exact MountPoint and typed boolean `false` for `Writable`, `WritableMedia`, and `WritableVolume` on both `/Library/Developer/CoreSimulator/Volumes/iOS_22G86` and `/Library/Developer/CoreSimulator/Volumes/iOS_23E254a`. Query/listing/component snapshots match within recorded Node Stats values.

## Factual permission patterns

| Mount basename | Immediate bundle basename | Exact RuntimeRoot uid/gid/mode | Observed mounted device |
| --- | --- | --- | --- |
| iOS_22G86 | iOS 18.6.simruntime | 0/0/0755 | 16777251 |
| iOS_23E254a | iOS 26.4.simruntime | 0/80/1775 | 16777239 |

Both volumes: Profiles, Runtimes, runtime bundle, Contents and Resources directories are uid0/gid80/mode0775. Info.plist and Resources/profile.plist are uid0/gid80/mode0664/nlink1. RuntimeRoot/System/Library/CoreServices/SystemVersion.plist is uid0/gid0/mode0444/nlink1. Other inspected mounted directories are0755; all recorded mounted components have uid0, gid0or80 and stay on their respective mount device. All210 permitted lstat events and both immediate listings are retained. Each listing has one bundle. Names are directory basenames only; no runtime version/identifier/build was read or inferred from them.

## Recording qualification

Retained evidence audit found default Node Stats numeric inode fields outside Number safe-integer precision for `/usr`, `/usr/sbin`, and `/usr/sbin/diskutil`. Their exact64-bit inode integers cannot be recovered from the recorded numbers; exact system-ancestor inode stability is uncertain. All inspected legacy-volume/runtime inode and device fields are safe integers. The two complete exact mount proofs remain factual. This post-run qualification is preserved explicitly in identity-precision-audit.json, with no further native probe or retry. No atomic namespace safety is certified.

## Preservation and boundary

Full HEAD remains91084c0c065373a978c8437f8f8362c4f5e4dbc9; product Source3edf247ab44d3332bc4bab5f3a43104536d84ce9/candidate720cb380d07102d72b20a6a4f5f7787a0ab88f2b. Before/after/completion: Source441, compiled69, original host15, all693 compatibility artifacts,15 Root dispatch/binding/submit/audit records,121 prior explicit records and4 new scripts/context all match. The sole GPT-6.1-Sol xhigh binding was refreshed read-only; actual integration CWD used, main protected. Only new private operator-legacy-volume-diagnosis files were written.

Production compatibility lookup count0; runtime file opens0; plutil0. No native trial, Source/dist change, test/build/commit, config/account/admission/journal/lease/Devices, simulator/device/SDK/network/backend, app/migration/activation/live/download/mount/permission/cleanup/claim effects. Legacy trust proposal remains unapproved. L01–L05 UNVERIFIED. Operator idle.
