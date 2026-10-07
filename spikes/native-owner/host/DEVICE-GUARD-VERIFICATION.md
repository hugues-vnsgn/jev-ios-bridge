# Research device exclusion

`DeviceGuard(root, device_id, request_id, evidence_directory)` exposes `take()`,
`check()`, `release()`, `provenance`, `created` and `released`. Pass `root=None` for
the Bridge's default namespace; a supplied root is a local test/data Seam.
The default follows Node's Unix `TMPDIR`, `TMP`, `TEMP`, `/tmp` precedence and
uses `jev-ios-bridge-device-locks/<UPPERCASE-UDID>.lock`. Ordinary symlinked temp
ancestry, including macOS `/var`, remains usable. The lease/root itself may not
be a symlink.

Before exclusive acquisition, the helper writes and syncs an immutable
`device-guard-intent.json` under the fresh evidence directory. Its `pending`
state proves only the proposed path and record. The caller also persists that
provenance in its ownership ledger before `take()`, and records later facts.
Provenance getters/results are defensive copies.

The mode-600 JSON claim has `pid: null`, truthful `hostPID`, token, deviceId,
runId, createdAt, evidenceDirectory and research kind/schema. `pid: null`
deliberately leaves native settlement unknown: the actual TypeScript
`DeviceLease.take` keeps it busy after the Python frontend exits. No living PID
is invented. Research refuses every existing claim without parsing, deleting or
taking it over, including a departed owner's claim, malformed JSON, directories
and symlinks.

`created` becomes true immediately after O_EXCL creates the file, including
partial-write or sync failures; it stays true after release. `released` becomes
true immediately after successful matching-claim unlink. Fallible synchronization
and ownership checks occur before unlink, so their failure keeps the claim.
Deletion durability is not promised: a crash may restore a busy claim. A later
directory-descriptor close error does not undo known removal or report false
retention. Checks require the original
directory/file identities, regular single-link mode-600 owned file and exact
record bytes. A missing/replaced/symlinked/modified claim, inspection failure or
I/O uncertainty permanently prevents that guard from releasing. Reads are bounded
by the original record length. No uncertainty path deletes a claim.

`DeviceGuardError.reason` is `DEVICE_GUARD_BUSY` for an existing lease,
`DEVICE_GUARD_UNCERTAIN` for I/O or ownership uncertainty,
`DEVICE_GUARD_NOT_HELD` before acquisition/after release,
`DEVICE_GUARD_ALREADY_ATTEMPTED` for repeated acquisition, or
`DEVICE_GUARD_CONFIGURATION` for invalid device/run identities.
On errors the caller must inspect `created`, preserve uncertain ownership and
issue no device work. Only positively settled/restored work may call `release()`;
the helper cannot establish settlement. Caller integration is a separate change.

The tests cross this Interface with real temporary files, actual TypeScript
`DeviceLease`, and harmless Python processes that exit naturally. OS write/sync/
unlink failures are injected at the filesystem Seam. They cover competing claims,
frontend exit, canonical namespace/casing, matching release, immutable intent,
uncertain partial writes, sync/unlink failures, exact replacement, missing files,
changed fields/permissions, oversized content, hardlinks and symlinked roots.

Meaningful red evidence:

- `/tmp/jev-native-owner-device-guard-red.log`: the real Bridge reclaimed a
  departed Python host's numeric-PID record; the unknown-owner assertion failed.
- `/tmp/jev-native-owner-device-guard-claim-red.log`: private mode assertion
  failed against an ordinary mode-644 exclusive file.
- `/tmp/jev-native-owner-device-guard-ownership-red.log`: a byte-identical new
  inode was deleted; existing leases also lacked classified refusal handling.

Green gate: `python3 -W error -m unittest discover -s spikes/native-owner/host
-p 'test_*.py' -v`; isolated worktree execution sets
`JEV_NATIVE_OWNER_TSX_LOADER` to the original checkout's installed tsx loader.
The committed test defaults to its own checkout's `node_modules`, as in CI after
`npm ci`. Log: `/tmp/jev-native-owner-device-guard-all-green.log`.
Python compile and `git diff --check` also pass.

The release correction has independent behavioral red evidence in
`/tmp/jev-native-owner-device-guard-release-red.log`: a directory sync failure
after unlink let the actual Bridge acquire despite `released=False`, and a later
directory close failure misreported known removal as uncertainty. The two new
regressions pass after moving sync/checks before unlink and setting `released`
immediately on successful unlink. They verify blocked Bridge acquisition on
pre-removal sync failure, and truthful release after a post-removal close error.
Correction green log: `/tmp/jev-native-owner-device-guard-release-green.log`.

These tests operate no simulator and issue no process signals. Exclusion applies
to consumers sharing the Bridge namespace. Noncooperating external tools, custom
Bridge roots and same-user replacement races are outside its guarantee; POSIX
offers no atomic compare-record-and-unlink operation. All 23 production capability
requirements remain unaccepted.
