# Read-only Sam volume diagnosis

**Sam is mounted, distinct from the original simulator filesystem, writable according to all three typed diskutil flags, and has enough available capacity for the 70 GiB staging threshold.** This does not resolve the unchanged internal simulator requirement or establish simulator relocation support.

Sam available: **136483442688 bytes (127.11011124 GiB)**. Threshold: 75161927680 bytes (70 GiB). Margin: 61321515008 bytes. Fresh internal simulator available: **21806772224 bytes (20.30913925 GiB)**, short by 42617737216 bytes against the unchanged 60 GiB requirement. These are independent point-in-time free-space samples, not reservations or quotas.

Exact mount: `/Volumes/Sam`. Device `disk6s3`, node `/dev/disk6s3`, parent whole disk `disk6`; USB, Internal=false. Filesystem `hfs` / Journaled HFS+ (Mac OS Extended (Journaled)); statfs type `0x19`. Disk UUID `9776C4A9-99F0-4B06-A2A9-E097A2709E25`; volume UUID `48570675-F94C-3532-89D3-B005FDCF8334`. Sam's non-following lstat device is `16777242`, distinct from the simulator device `16777233` (statfs type `0x1a`).

Sam is a nonsymlink directory, reported uid 501, gid 20, mode 0775, inode 2. Both path snapshots matched before/after the single query. All metadata identities and StatFs integers were captured losslessly as decimal strings. The path samples are not an atomic mount pin.

Diskutil reports typed Writable=true, WritableMedia=true, WritableVolume=true. Ownership controls are reported by SupportsGlobalPermissionsDisable=true, while GlobalPermissionsEnabled=false: global permissions are currently disabled. The reported uid/mode do not establish enforced private-directory permissions. No write or permission-enforcement test was attempted, and no permissions were changed.

Exact query: `/usr/sbin/diskutil info -plist /Volumes/Sam`, once, shell=false. Raw plist is retained in `diskutil.stdout.bin` (SHA `5681eeaa56d555e660a3adebd15a018877c3395d3c80bcea4ca27bc3483113fc`), parsed only offline by Python `plistlib`. Existing bounded recorder reused with only its evidence-directory string changed; no product parser or instrumentation change. Child environment, argv, raw outputs, events and actual close are in `diskutil-receipt.json`. Deadline 10 seconds, combined output 64 KiB; SIGTERM then 250 ms SIGKILL policy unused. Metadata reads: four lstat and two statfs calls over only Sam and the original simulator path, each with a 3-second deadline. Child and supported elevated tool both exited 0. Actual diskutil close: 2026-10-11T04:33:21.506Z. Stderr empty, captures complete, no timeout/overflow/kill. Only the direct child close is observed; descendants are unobserved.

Finite repository HEAD read returned `25873ea1de4ff948f795d05eae2b460a9ef79ad3`. Prior sealed storage evidence manifest and all 28 files remain unchanged. New evidence only, directory 0700/files 0600. No recursive scan, writes to Sam, permission/mount changes, data moves, symlinks, migration, build, device operation or key loading. No additional native diagnostic or rerun.

Root confirmed source support for external JEV_RUNS_DIR and that the simulator remains internal; this volume diagnosis changes neither setting nor path. Sam satisfies the disk-capacity facts for an external staging option, subject to a separately reviewed setup and permission policy. Overall operational entry remains blocked by the unchanged simulator requirement.

Operator idle for Root audit. `artifact-hashes.json` seals every evidence file except itself.
