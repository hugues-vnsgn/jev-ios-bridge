# Runtime visibility phase5: mount protection and complete Xcode metadata

Root coordinates. The same sole operator uses owner-confirmed GPT-6.1-Sol xhigh in integration cwd `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic`, terminal `term_19640861-824c-4f24-8789-3f584723bc5a`. HEAD remains `4004ece782fc9448607605bfe3a54702f8622bb0`; no candidate repair is integrated. Verify cwd/model and refuse another pane or checkout. The permission author owns the sole heavy test/build window; this dispatch is metadata only.

Root accepted phase4's bounded provenance: 18 artifacts, 15 host/437 product-test/68 compiled hashes and 56 prior artifacts match. Actual runtime metadata is iOS 27.0/build24A434. Fourteen evaluated predicates match; two Xcode Info predicates remain unverified. Production compatibility and L01-L05 remain unverified.

## Ranked hypotheses before this probe

1. The exact Cryptex mount is read-only, making group-write mode bits ineffective within that volume. A stable, exact-mount diskutil result reporting read-only supports this; writable, missing, mismatched or uncertain metadata leaves it unsupported.
2. The exact Cryptex namespace has system protection flags sufficient to justify a bounded trust design. Record flags and ownership; do not infer protection from its name, catalog state or a different device number. No flag result alone approves a policy.
3. Stable Xcode Info JSON fits a finite 1 MiB output budget and supplies matching identity/executable/min-host fields. Complete bounded conversion and those fields support this; overflow, conversion error, change or discrepancy falsifies it.

## Exact finite scope

Derive and assert these paths against the accepted phase3/phase4 evidence. Do not follow another catalog record or automatically substitute a mount.

Mount root:
`/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ`

Runtime bundle is that root plus `/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime`. Three known metadata leaves are its `Contents/Info.plist`, `Contents/Resources/profile.plist`, and `Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist`.

Allow exactly these children, each at most once, fixed account HOME/PATH/LANG/LC_ALL/DEVELOPER_DIR, shellfalse/ignoredstdin, no key/loader environment. Per child timeout10s with bounded termination; stdout+stderr combined at most1MiB. Preserve exact argv, cwd, time, exit, signal, bytes/hashes and sanitized outputs. Failure stops that subprobe without fallback.

- `/usr/sbin/diskutil info -plist <exact mount root>`: information only, no other diskutil verb or global inventory. Parse its XML output in memory with the existing installed plist package if available; never execute a parser child or discover a new tool. If output is not parseable, retain sanitized bounded output and report unknown. Require exact returned MountPoint correspondence before any read-only conclusion. Do not follow any returned device/path.
- `/usr/bin/stat -f '%d|%i|%u|%g|%p|%f|%Sf' <exact path>` once for each: `/private/var/run`, `/private/var/run/com.apple.security.cryptexd`, its `/mnt`, exact mount root, and the three runtime plist leaves. No `-L`; default is lstat. Before and after each child, lstat the finite path chain without following symlinks and record uid/gid/mode/type/dev/ino; refuse symlinks or non-directory ancestors and record changes. Treat flags as observed numeric/text values without guessing constants.
- `/usr/bin/plutil -convert json -o - -- /Applications/Xcode.app/Contents/Info.plist` once, with the explicit1MiB diagnostic output budget. Read only that same regular, non-symlink, nlink1 plist with O_RDONLY/O_NOFOLLOW, max65536 input bytes. Assert input SHA `537783b4c639af6ee31208fe2ec12a40bacbb0fc8f5dd2820f54e03063c4dbe8` and stable before/opened/final/after bytes, leaf and ancestor stats. Record complete JSON size/hash and sanitized fields; compare CFBundleIdentifier=com.apple.dt.Xcode, CFBundleExecutable=Xcode, LSMinimumSystemVersion<=27.0.1 using production version semantics. No production limit change or compatibility bypass.

Executables and their ancestors are lstat-only, no executable-byte reads. All stat paths and ancestors are a fixed allowlist; all input-byte reads are confined to that one Xcode plist and prior repository evidence. No directory inventory, payload/image read, mount/install/download/activation, permission/ACL/flag change, production compatibility call, FS simulation, SDK/backend/simctl/xcrun, build/test/source change, config/store/journal/lease/device operation or cleanup. No .env. Retain all claims/devices.

## Return

One finite batch only. Verify accepted15+437+68 and immutable phase1-4 artifacts before/after. Write only new private700/600 files under `.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-phase5/`; no parent edits or commit. Return exact results, ranked hypothesis dispositions, guard script/receipts/hashes, proposed next design scope and limitations, then idle. A read-only mount does not establish atomic protection of its writable ancestors or certify hostile-admin safety. Owner's trust decision remains ONLY the exact /Applications exception. Root will define any further repair after reviewing these results. L01-L05 remain UNVERIFIED.
