# Fresh Sam recheck after owner-local ownership enablement

**Ownership enabled is confirmed** by one fresh bounded query: exact MountPoint `/Volumes/Sam`, VolumeUUID `48570675-F94C-3532-89D3-B005FDCF8334`, DeviceIdentifier `disk6s3`, DiskUUID `9776C4A9-99F0-4B06-A2A9-E097A2709E25`, filesystem hfs, Internal=false and all three writable flags typed true. GlobalPermissionsEnabled=true and SupportsGlobalPermissionsDisable=true.

**Permission setup stops at the conditional scope:** Sam now reports actual uid0/gid0/mode0775, not uid501/gid20. The authorized uid501 held-descriptor repair precondition is false, so no repair script, chmod, directory open or namespace creation was prepared or performed under that condition. Root must supply separately reviewed scope. Ownership-ignored uid501/gid20 from the earlier diagnosis was a synthetic current-user view, consistent with the retained installed manual; current on-disk ownership is root/wheel.

| Exact ancestor | uid | gid | Mode | dev | ino |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 0 | 0 | 0755 | 16777233 | 2 |
| `/Volumes` | 0 | 0 | 0755 | 16777233 | 17207 |
| `/Volumes/Sam` | 0 | 0 | 0775 | 16777242 | 2 |

All are nonsymlink directories. ACL listing reports no ACL entries for any of the three paths, captured raw in `acl.stdout.bin`. Lossless bigint lstat captured mode/owner/dev/ino/size/nlink and nanosecond timestamps before/after; full snapshots matched. This is a point-in-time path proof, not an atomic mount pin.

Exact once query `/usr/sbin/diskutil info -plist /Volumes/Sam`. Raw plist, stdout/stderr, actual argv/env, events and closes retained. Actual diskutil close 2026-10-11T05:06:43.271Z; the diskutil, offline Python parser and finite numeric ancestor ACL listing direct children all exited0 with complete captures. Each deadline10s/combined output64KiB/shellfalse; no timeout/overflow/kill. Six read-only lstat samples, each deadline3s. Only direct child closes are observed; descendants are unobserved.

Owner reported DONE to their local command; this recorder did not observe that command or read a password. No sudo retry or ownership toggle was performed. Prior stopped sudo authentication receipt and all36sealedfiles remain unchanged. No Sam mkdir/open/chmod, namespace, source removals/moves, cache cleanup, build, migration or device operation. Product sources and budgets were not changed.

New evidence only, 0700/0600; artifact-hashes.json seals all files except itself. Sam permission effects await new Root scope. Candidate activity-check preparation may continue without executing probes or moving data.
