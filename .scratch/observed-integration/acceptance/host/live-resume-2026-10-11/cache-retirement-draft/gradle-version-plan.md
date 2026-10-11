# Exact old Gradle cache retirement draft

`retire-gradle-version.py` is a separate, unexecuted and untested source draft.
It does not modify the frozen JetBrains script or archive helper. It copies the
reviewed algorithm from JetBrains script SHA-256
`8ecbc0828c56c639aa09b0da0f0089902a994ac65677016bdb7f9e347e0c9cef`,
with the following narrow differences.

## Exact source mapping

| Accepted source | Manifest root | Required private wrapper prefix |
|---|---|---|
| `/Users/hugues_mini/.gradle/caches/8.13` | `8.13` | `.jev-retired-gradle-813-` |
| `/Users/hugues_mini/.gradle/caches/9.7.1` | `9.7.1` | `.jev-retired-gradle-971-` |

One source per plan and invocation. The script rejects every other source,
including whole `.gradle/caches`, `9.1.0`, shared modules and wrapper distributions.
There is no generic descendant matching. The source parent is always exactly
`/Users/hugues_mini/.gradle/caches`. Wrapper labels append 1–64 lowercase letters,
digits or hyphens to the mapped prefix. Existing destinations are never reused.

## Plan and evidence

Use the fields and two-phase process in `retirement-plan.md`, substituting only
the exact source, mapped root/wrapper, parent identity and matching archive run.
The invocation names `retire-gradle-version.py`. Both script digest and each
immutable plan digest need Root approval. No runnable plan is supplied here.

Every rename/delete phase requires fresh parent/archive-run facts, successful
archive result and matching source-manifest hashes, a reread matching archive
SHA-256, pinned activity evidence path/digest, explicit writer-stop contract,
finite bounds and a new attempt name. Delete additionally pins the successful
rename result/completion and rejects a failure receipt. Fresh activity evidence
must specifically cover the selected old version; snapshots for a sibling version
or shared modules cannot establish its inactivity.

The normal version directory must remain absent after rename and during removal.
If a tool recreates it, removal stops and leaves that new directory untouched.
Only manifest-matching entries under the private retired root are removed.

## Activity policy difference

Fresh `/bin/ps -axo uid=,comm=` is still bounded, recorded and parsed, including
signed UIDs. Java, Gradle or IDE executable presence alone does **not** identify
which Gradle version cache is in use, so this script does not reject a process
solely by its executable name. Active Gradle 9.1.0/shared-module work is outside
its scope and must not be interrupted.

Fresh exact-root `lsof` must still finish with the reviewed clean no-match result
before each source inventory. Before rename it scans the original selected root;
before delete it scans the renamed root. A complete SHA-256/identity inventory
must agree with the archive immediately before mutation. Both agents must avoid
starting work that uses these old versions throughout retirement. This is an
operational inactivity assessment, not proof against future writers.

## Unchanged safeguards and limits

Exclusive native descriptor-relative rename, recorded root ctime rebind, held
archive descriptor, nofollow traversal, exact child sets, per-entry identity
checks, intentional hardlink nlink/ctime updates and fail-stop behavior are
unchanged. There is no retry/resume or generic deletion
command. Partial deletion requires Root review; archive recovery remains retained.
All residual races and metadata qualifications in `retirement-plan.md` apply.

## Journal batching for larger manifests

This Gradle variant writes every journal event immediately but fsyncs every 256
events, at `phase_started` before source effects, before and after exclusive
rename, and before successful result/completion receipts. On caught failure it
attempts a final journal fsync and records any sync error in the failure receipt.
The frozen JetBrains script keeps its original per-event fsync behavior.

A crash can lose the unsynced journal tail, including records of completed
removals. Absence of a journal completion is therefore not evidence that a file
remains. Even after a caught failure, any intent/completion discrepancy requires
Root to inspect actual state against the retained archive; there is no automatic
retry or resume. Batching does not change any source identity check or permit
deleting an unlisted entry. The verified archive remains retained throughout.

This draft was prepared by editing and reading repository source only. No host
activity checks, cache/archive reads, source mutations, tests or syntax checks
were performed. Independent review is required before either phase can run.
