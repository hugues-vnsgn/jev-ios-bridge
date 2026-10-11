# Retirement script plan and review notes

`retire-cache.py` is unexecuted and untested. Independent source review and a
Root-approved exact plan are required before either phase. No runnable plan is
included. The current archive plan does not authorize retirement.

## Invocation and dependencies

The sole operator will invoke the reviewed Python interpreter with script path,
plan path and separately pinned plan-byte SHA-256. Script SHA-256 must also be
pinned in the dispatch. The sibling `archive-cache.py` is a read-only helper
dependency, pinned inside the script to
`1b585f7616e3856749f9d6457bb494f3283f496f174d14f1ecbfc65965635bb3`.
It is loaded from its exact hashed bytes; its main function is not invoked.

Common plan fields:

| Field | Required value |
|---|---|
| `version` | Integer 1 |
| `mode` | `rename` or `delete` |
| `source` | `/Users/hugues_mini/Library/Caches/JetBrains` |
| `archive_run` | Existing exact private archive run basename |
| `archive_run_identity` | Fresh integer dev/ino/uid/gid/mode/size/nlink/mtime_ns/ctime_ns facts for that archive run; each phase needs fresh facts because adding evidence changes directory timestamps |
| `parent_identity` | `[dev, ino, uid, gid, mode]` for the original cache parent, freshly pinned |
| `attempt` | Unique lowercase alphanumeric/hyphen label, maximum 64 chars |
| `wrapper_name` | Exact `.jev-retired-jetbrains-` plus a pinned lowercase alphanumeric/hyphen label, maximum 64 label chars |
| `inactivity_confirmed` | Boolean true after fresh operator assessment |
| `writer_stop_contract` | Explicit policy keeping IDEs/builds inactive throughout the phase |
| `activity_evidence_path` | Exact absolute repository receipt path under `live-resume-2026-10-11`; traversed without following links |
| `activity_evidence_sha256` | Immutable digest of Root-approved prior activity assessment bytes; verified each phase |
| `archive_result_sha256` | Successful archive `result.json` byte digest |
| `archive_plan_sha256` | Archive run's `plan.json` byte digest |
| `source_before_sha256`, `source_after_sha256` | Archive run's source manifest byte digests; their parsed contents must agree |
| `archive_sha256` | Accepted compressed archive digest; reread and verified each phase |
| `max_depth`, `max_entries`, `max_source_bytes` | Positive bounded source inventory limits |
| `max_archive_bytes`, `max_evidence_bytes` | Positive file-read bounds |
| `max_journal_events` | At least `3 * max_entries + 20` |
| `stderr_bytes` | Positive bound per activity-command stream and native diagnostics |
| `command_seconds`, `total_seconds` | Positive elapsed-time bounds |

Delete mode additionally requires `rename_evidence_name` (exact `rename-<attempt>`
directory), `rename_result_sha256`, and `rename_completion_sha256`. Both successful
receipts must match; presence of `failure.json` refuses deletion. Root must also
review the archive run's successful `completion`/absence of failure where such
records exist; no failed or unsettled archive attempt may supply the evidence.

## Effects and receipts

Each invocation creates an exclusive `rename-<attempt>` or `delete-<attempt>`
evidence directory inside the external archive run. It writes the approved plan,
mount proofs, an fsynced intent/completion journal, phase result and completion
receipt. A result without `completion.json`, or any `failure.json`, requires
review and cannot be treated as completed. Interrupted unlink can leave an intent
without completion; never infer that no deletion happened.

Rename uses macOS `renameatx_np(..., RENAME_EXCL)` with held source-parent and
wrapper descriptors. It permits only the root's observed ctime change and records
that rebind. If the filesystem changes another root fact, it stops with the tree
retained at whichever location the journal proves; no fallback rename occurs.

Delete rehashes the retired tree before mutation, then checks exact path identity
before each entry operation. Known directory child removals intentionally alter
directory timestamps. Known hardlink removals decrement nlink and rebind only the
observed ctime for remaining names of that same inode. Unknown changes stop the
operation. A normal `JetBrains` path recreated during traversal stops deletion;
that new path is never removed. Empty wrapper removal is separately journaled.

Each phase verifies the prior activity receipt bytes against the pinned digest,
then runs fresh `/bin/ps -axo uid=,comm=` and saves executable names, never process
arguments. Known JetBrains IDE names/path labels across all UIDs cause refusal;
signed UIDs such as -2 are valid. An empty or malformed process inventory refuses.
The script also runs fresh `lsof -nP +D <exact-tree>` before each phase's source
inventory. Only exit 1 with both streams empty is accepted. The writer-stop
contract remains a separate Root-reviewed requirement; the script does not start
or stop an IDE. Activity command errors, unexpected output or timeouts stop it.
Executable-name matching is a point-in-time operational assessment, not a complete
detector for custom launchers or proof against future user activity.

The retained archive is held open during each phase. Root/operator must run fresh
capacity checks after completed deletion; the script reports no reclaimed-byte
estimate and never alters release storage budgets.

## Review focus and remaining limits

Review both scripts together, particularly exclusive rename ABI/flag, nofollow
path traversal, source-to-retired manifest mapping, the root ctime rebind,
hardlink nlink updates, journal bounds and activity command settlement.

The inode-check/unlink interval is not atomic; private wrappers do not stop
same-user descriptor-based writers. Inactivity is a mandatory operational
assumption. Filesystem calls can stall beyond checked deadlines. Child processes
are awaited; descendant settlement is not independently proven. Native metadata
backup fidelity remains qualified as in the archive proof. Partial deletion has
no automatic rollback, retry or resume. No generic recursive removal or shell
deletion command is present.

Only source files and local rename API documentation were read while preparing
this draft. No cache/archive/activity operations, mutations, tests or syntax
checks were performed.
