# Retire one verified regenerable cache

## Status and scope

Design with an unexecuted implementation draft in `retire-cache.py`. No source
mutation, activity check, archive read, or deletion was performed during drafting.
The reviewed input is `cache-archive-draft/jetbrains-plan.json`.
That plan authorizes copying only and explicitly retains the source. A separate
Root-approved retirement plan is required after successful archive review.

First possible source: `/Users/hugues_mini/Library/Caches/JetBrains`.
The archive plan pins root dev `16777233`, inode `34652077`, uid `501`, gid `20`,
mode `040755`; these historical facts must still match the successful archive
manifest and fresh source evidence. No other source or arbitrary descendant is
implicitly in scope.

The purpose is to recover internal space while retaining the verified archive on
Sam. Native metadata in that archive remains best effort; the recovery guarantee
is the already verified cache contents and links. These are regenerable caches.
No perfect filesystem backup requirement is added.

## Minimum implementation

Use two explicit operator invocations, each with immutable plan bytes and a
separately pinned SHA-256. They can be autonomously authorized by Root within the
user's cache-offload instruction; no routine user prompt is needed. Separating
them makes rename and activity evidence reviewable before removal starts.

### Phase A: verify and rename

1. Require successful `COPY_VERIFIED_SOURCE_RETAINED`, no unresolved process
   settlement, and Root-pinned result, archive and source-manifest SHA-256 values.
   Rehash the held nofollow archive descriptor and manifests on the pinned Sam
   mount. Require the successful archive proof to match this exact source.
2. Refresh inactivity evidence covering JetBrains processes and all open files
   beneath the original root. Classify activity-tool exit and permission errors;
   an incomplete or denied scan is not proof of inactivity. Keep the existing
   operational rule that neither agent starts IDEs or builds during retirement.
3. Open and hold the source parent with nofollow traversal. Pin its current
   identity and owner, and verify source root identity. Re-inventory the exact
   source against the archived manifest, including file hashes and link targets.
   Refuse unknown/missing entries, unexpected owners, mount crossings and changes.
4. Create one exclusively named mode-0700 retirement wrapper **in the same
   parent**, e.g. `.jev-retired-jetbrains-<pinned-run-id>`. Retain its descriptor and
   record its identity. A wrapper hides the retained tree from pathname discovery
   without changing the source root's permissions. Do not chmod the cache itself.
5. Move the original root to `source` inside that empty wrapper using held
   directory descriptors and an exclusive same-filesystem rename primitive.
   Implementation must use a reviewed macOS no-replace rename API (for example
   `renameatx_np` with the documented exclusive flag), not a check-then-overwrite
   rename. A preexisting wrapper or destination is a refusal. Never overwrite.
6. Verify the moved root retains the expected dev/inode/owner/mode. Record root
   timestamp changes caused by rename rather than silently ignoring arbitrary
   changes. The original path should now be absent; if a newly recreated cache
   appears there, record it and stop for renewed activity assessment. Never touch
   that replacement. Seal a `RETIRED_SOURCE_RETAINED` receipt and return to Root.

The wrapper name and moved root are recorded externally. A failed phase leaves
the current tree in place; there is no automatic restoration or retry. Rename
does not free disk space and must never be reported as having done so.

### Phase B: verify retired tree and remove exact manifest entries

1. Root reviews phase A and dispatches an exact retirement plan containing the
   wrapper/source identities, archive proof hashes, finite bounds and approved
   entry set. Repeat the fresh activity scan against the **renamed** tree and
   relevant processes. Existing open handles survive rename; absence at the old
   pathname alone is not sufficient. Any result uncertainty stops removal.
2. Reconfirm Sam/archive accessibility and identity. Pin the archive file hash
   verified in phase A; if its size/identity/mtime/ctime changed, rehash and stop
   for review on mismatch. Keep the archive descriptor held during removal.
3. Inventory and hash the retired tree nofollow, translating only its root name
   to the archived manifest's root name. Require complete path/type/byte/link
   equality. Accept only specifically recorded root timestamp effects from the
   rename; descendant identities and metadata used for stability must match.
4. Remove leaves first, only from the manifest. For each parent, retain a nofollow
   directory descriptor and compare its identity. Verify its actual child set
   equals the tracked remaining manifest children. For each regular file, open
   nofollow and compare held and fresh path identity, size and stability facts
   immediately before `unlink(name, dir_fd=parent)`. Compare symlink identity and
   exact link target immediately before unlinking the link itself. Never follow
   it. Unknown entries, changed identities, special files or races cause a stop.
5. After known children are removed, require each directory to be empty and its
   stable dev/inode/owner/mode to match, then `rmdir(name, dir_fd=parent)`. Do not
   compare its original size/mtime/ctime after our own child removals: maintain
   expected remaining entries and record those deliberate changes. Remove the
   retired root and then the empty wrapper through their held parent descriptors.
6. Seal bounded operation receipts with exact removed-entry counts and failures.
   Recheck fresh internal and Sam free-space facts. Report measured recovery,
   not summed logical sizes. Preserve the archive and all evidence. Root then
   decides whether another exact cache or release storage checks should proceed.

There is no recursive wildcard removal, generic `rm -rf`, deletion of newly
recreated normal cache directories, source-path symlink switch, global config
change, or attempt to clear unknown files. Each failure retains remaining data
and requires explicit Root review before any new attempt.

## Bounds and required evidence

The retirement plan must pin source, parent and wrapper paths/identities, source
manifest digest, successful archive receipt/digest, Sam UUID, inactivity evidence,
maximum entries/depth/logical bytes, finite activity-command and overall time
budgets, and bounded diagnostic size. Store large manifests and operation logs
inside the private external archive run; avoid internal evidence growth.

An append-only operation journal should mark intent and successful completion of
each destructive entry operation. A crash between those records remains an
uncertain outcome to inspect, not an automatic retry instruction. Native command
timeouts require actual settlement review before restarting any phase. No tests
are added or run without explicit authorization.

## Residual races and practical limits

- Rename redirects future pathname-based cache writers to the original path;
  it cannot stop a process with existing directory/file descriptors. A private
  wrapper also does not isolate other processes running as uid 501. Fresh scans,
  complete inventory checks and the inactivity contract reduce this risk; they
  cannot prove a hostile or future same-user writer is absent.
- macOS pathname unlink is not an atomic compare-inode-and-delete operation.
  Even with held parent descriptors and immediate checks, a concurrent writer
  could replace a leaf between comparison and unlink. This design is acceptable
  only for these verified inactive regenerable caches. Discovery of a writer
  invalidates the plan and stops the operation.
- Deleting some entries is irreversible from the internal filesystem; the verified
  archive is the retained recovery copy. Failures can leave a partially removed
  retired tree. Do not automatically restore the archive over a newly created
  cache or claim the operation is transactional.
- Hardlinks outside the selected tree, open unlinked files and APFS snapshots can
  reduce or delay recovered space. Only fresh filesystem capacity measurements
  establish whether the release storage gate is satisfied.
- Synchronous kernel filesystem calls can stall despite elapsed-time checks.
  Record actual outcomes and keep retained data on any unresolved settlement.

## Next step

Wait for the archive to succeed and Root to audit it. Obtain independent source
review of the drafted single-cache, two-phase retirement implementation.
No removal is authorized by the current copy-only JetBrains plan.
