# Archive draft review and plan

`archive-cache.py` supersedes the per-file copy design for this task. It is a
source-only, unexecuted and untested implementation draft. Root must review it
before dispatching its exact bytes to the sole operator. No runnable plan is
provided because no candidate is selected yet. There is no deletion code.

## Required immutable plan

Root supplies a JSON file and separately pins its byte SHA-256 in the operator
command. Changing any field requires a new reviewed digest. Required fields:

| Field | Meaning |
|---|---|
| `version` | Integer 1 |
| `source` | One exact absolute allowlisted cache root |
| `run_name` | New lowercase letters/digits/hyphens name, maximum 64 characters |
| `source_identity` | Integer `dev`, `ino`, `uid`, `gid`, `mode`, `size`, `nlink`, `mtime_ns`, `ctime_ns` from fresh source-root stat |
| `inactivity_confirmed` | Boolean true, following operator activity evidence |
| `writer_stop_contract` | Explanation of how relevant writers stay stopped throughout the operation |
| `activity_evidence_sha256` | Root-audited activity evidence digest; script records the assertion, it does not independently establish inactivity |
| `max_depth`, `max_entries` | Positive finite source inventory limits |
| `max_source_bytes` | Sum of regular-file logical bytes; hardlinked names counted separately conservatively |
| `max_archive_bytes` | Positive compressed output cap |
| `max_tar_bytes` | Positive expanded tar stream cap including metadata/header overhead |
| `max_metadata_bytes` | Positive per-AppleDouble-member cap |
| `stderr_bytes` | Positive per-command diagnostic cap; any stderr causes refusal |
| `command_seconds`, `total_seconds` | Positive finite elapsed-time bounds |
| `min_sam_free_bytes` | Space preserved in addition to the maximum archive size |

All numeric bounds must be JSON integers. Choose them from candidate evidence and
capacity; no automatic enlargement or retries. Each attempt creates a fresh
private directory under the pinned external `archive` directory. Manifest files
stay there. Failure leaves a partial archive and failure receipt; nothing is
removed automatically. A successful result is `COPY_VERIFIED_SOURCE_RETAINED`.

The exact additional Gradle candidates are
`/Users/hugues_mini/.gradle/caches/8.13` and
`/Users/hugues_mini/.gradle/caches/9.7.1`. No generic descendant matching is allowed.
Root has excluded whole `.gradle/caches` and `.gradle/wrapper/dists` roots from
execution because they have active users, although their historical allowlist
entries remain. Prior absence of open files in the two version directories is
not current authorization: Root requires fresh activity evidence, a writer-stop
contract and exact source identity pins before selecting either candidate.

`min_sam_free_bytes` must include headroom for source manifests and receipts in
addition to space reserved for subsequent release work. The capacity check only
adds this plan value to `max_archive_bytes`; it does not separately estimate
manifest overhead. After any timeout or failed attempt, Root must review command
settlement and the partial destination before authorizing another attempt.

## Scope and qualifications

- Commands are one native mount proof before, one bsdtar copy, and one native
  mount proof after. Exact argv, bounded diagnostics, exit status and direct-child
  wait receipt are saved. Raw copy stdout is the archive itself. No shell or
  inherited arbitrary environment is used.
- SHA-256 covers every regular file before/after and its streamed archive content.
  Directories and symlink targets must match. Hardlinks must refer to an earlier
  archive member with the same inventoried source device/inode. Source and
  destination path checks use nofollow descriptors where supported.
- Gzip is drained through its trailer for checksum checking. No extraction or
  temporary expanded copy is performed. No cache bytes enter terminal output.
- Native AppleDouble metadata is archived and identified as auxiliary data.
  The verified guarantee is cache contents and links. ACL/xattr/timestamp fidelity,
  sparse layout, external hardlink topology and power-loss durability are not
  claimed. Special files and unexpected owners are rejected.
- The script does not promise an atomic source snapshot or atomic mount pin.
  Source endpoint equality and fresh namespace checks rely on the independent
  inactivity contract. bsdtar receives a checked source path and can still be
  affected by concurrent namespace mutation; such activity must remain stopped.
- Filesystem reads/writes are synchronous. Deadlines are checked between calls;
  a kernel I/O stall cannot be interrupted by those checks. Native commands have
  bounded pipe loops, TERM/KILL escalation and actual direct-child waiting;
  descendant settlement is explicitly unobserved.
- Same-UID hostile modification is outside this cache-offload task. The private
  namespace and Root-approved plan protect against accidental mixing of runs,
  not a hostile process already running as the owner.

## Before use

Review the script and supply a candidate plan only after activity checks finish.
The script has not been run, syntax-checked, tested or used to inspect any cache.
The only source for the pinned destination facts is the recorded operator
`namespace-result.json`; the implementation will reject changed device/inode
identities even if the same physical disk is remounted under new device numbers.
