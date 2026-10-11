# Cache archive copy and verification draft

## Status

Disabled design draft. No cache was inspected, copied, moved or deleted by this
draft. No tests or native host commands were run. No candidate is selected.
This document is not an execution authorization. Root must pin a concrete plan
and the sole operator must satisfy its fresh gates before implementation runs.

The destination proposed by Root is
`/Volumes/Sam/jev-ios-bridge-release-2026-10-11/archive/`.
The user reports creating the private parent; operator verification is pending.
Copying alone does not free internal storage. Source removal is a separate,
unimplemented stage that needs its own exact scope and verification decision.

## Candidate boundary

Only these absolute roots may be considered; this list selects none:

| Candidate root | Proposed destination label |
|---|---|
| `/Users/hugues_mini/.gradle/caches` | `gradle-caches` |
| `/Users/hugues_mini/.gradle/wrapper/dists` | `gradle-wrapper-dists` |
| `/Users/hugues_mini/Library/Caches/JetBrains` | `jetbrains-caches` |
| `/Users/hugues_mini/Library/Caches/org.swift.swiftpm` | `swiftpm-caches` |
| `/Users/hugues_mini/.npm/_cacache` | `npm-cacache` |
| `/Users/hugues_mini/.cache/uv` | `uv-cache` |
| `/Users/hugues_mini/.cache/bazel-repo-contents-cache` | `bazel-repo-contents-cache` |
| `/Users/hugues_mini/.cache/bazel-repo-cache` | `bazel-repo-cache` |
| `/Users/hugues_mini/.cache/huggingface` | `huggingface-cache` |

No glob expansion, automatic discovery, symlink switching, environment changes,
tool configuration changes or fallback candidate is permitted. Account state,
CoreSimulator, release evidence, source checkouts and credentials are excluded.

## Facts required before code can be enabled

1. Exact selected candidate roots and stable root identities, authorized by Root.
2. Fresh operator proof of Sam's mount identity, ownership enforcement, remaining
   space and private-parent identity: nonsymlink directory, uid 501, gid 20,
   mode 0700. Pin the exact current mount; a path with the same name is insufficient.
3. Inactivity evidence covering the tools that use every selected cache. An
   instantaneous open-file listing cannot prove that no writer will start later.
   Root must state how those writers stay stopped during the complete operation.
4. Finite candidate inventory including owner, type, flags, ACLs, xattrs, hardlink
   topology, allocated and logical sizes, and path spelling. Explicit per-root
   entry, byte, path-depth and elapsed-time limits must be selected from this
   inventory, not guessed or increased automatically after a refusal.
5. The copy primitive's locally available documentation and its behavior for the
   metadata actually found. No `ditto` invocation or preservation claim is pinned
   in this draft: the source metadata and installed tool contract are not known.

## Minimal implementation shape

Use one reviewed script and one immutable plan. Process one selected candidate at
a time, serially. It must contain **no source deletion function**.

```text
require a Root-pinned plan digest, supported plan version and exact candidate list
require each root to equal an entry in the table above
require preexisting inactivity evidence and explicit writer-stop contract
verify mount and private parent against pinned facts
walk source through held directory descriptors without following links
  reject special files, symlinks, owner != 501, mount crossings and unreadable data
  reject unsupported metadata and destination-name collisions
  enforce pinned entry/byte/depth/time bounds throughout
  hash every regular file through an O_NOFOLLOW held descriptor
  compare lossless fstat before/after and fresh path identity
seal source-before inventory outside the source
require destination absent; create fresh mode-0700 archive child exclusively
run exactly one finite, shell-free copy for this candidate
  save exact argv, bounded raw stdout/stderr and actual direct-child settlement
  timeout/output overflow -> terminate, escalate kill after bounded grace, await close
  any failure or unobserved settlement -> stop; leave partial destination recorded
inventory and hash destination without following links
inventory and hash source again under the same rules
require source-after == source-before including bytes, identities and metadata
require destination path set, types, bytes and supported metadata == source-before
require mount and private parent identities unchanged
seal receipt: COPY_VERIFIED only; source retained; no freed-space claim
```

Before copying, reject nesting/overlap among selected source roots and any source
or destination alias. A source root that is absent is a refusal, not an empty
archive success. Do not merge into an existing destination, resume a partial copy,
overwrite, retry automatically or clean up on failure. Preserve receipts for
failed attempts. Do not treat receipt-file creation as proof that copying settled.

## Verification limits and rejection rules

| Property | Required handling |
|---|---|
| Contents | Compare SHA-256 and exact byte length for every regular file; compare the complete relative path set. Hash through held nofollow descriptors. |
| Identity | Use lossless integer dev/inode/uid/gid/mode/size/time facts; never round through a JavaScript Number. Recheck directory identities and entries after traversal. Destination inode numbers are naturally different. |
| Source races | Reject any changed identity, content, entry list or supported metadata. Endpoint equality cannot establish absence of a transient writer; inactivity is an independent mandatory gate. |
| Symlinks | Reject in this minimal implementation. A cache containing them needs a separately reviewed extension; copying referents is forbidden. |
| ACLs | Fail closed until a native ACL reader and comparison are implemented. Mode bits and `listxattr` alone do not establish ACL equivalence. Simplest first scope: proven ACL-free sources and destinations. |
| Extended attributes | Inventory names and raw values, including resource forks. Reject all nonempty xattrs in the minimal scope unless exact preservation and destination comparison have been implemented and reviewed. Never log secret-bearing raw values; store hashes and lengths. |
| Hardlinks | Reject regular files with link count other than 1 in the minimal scope. Flattening hardlinks changes topology and storage requirements. |
| Sparse files | Reject sparse allocation in the minimal scope unless the selected copy primitive preserves holes and verification measures them. Logical bytes must bound destination capacity even if the source consumes fewer blocks. |
| Flags | Reject nonzero source flags until explicit preservation is reviewed. Do not clear immutable or other flags to make copying succeed. |
| Ownership/mode | Require uid 501; pin allowed group and modes from inventory. Preserve and verify supported modes/groups. Reject setuid/setgid or unexpected ownership. Destination wrapper remains 0700. |
| Timestamps | Record source nanosecond precision losslessly. HFS+ may reduce timestamp precision; pin observed filesystem granularity and an explicit accepted conversion before copying. Do not claim full metadata equality when rounding occurs. Ignore atime only by explicit plan rule, since reading may change it. ctime/birthtime are not assumed reproducible. |
| Names | Check destination case and Unicode normalization behavior before selecting roots. Reject collisions or unsupported names; do not rename entries to make them fit. |
| Capacity | Use conservative logical bytes plus metadata/headroom; sampled free space does not reserve storage. Recheck after each candidate. Never sum overlapping `du` totals as reclaimable bytes. |
| Durability | Successful copy and readback prove current readable contents, not survival across power loss or physical-media failure. Any later removal policy needs its own durability requirement. |

## Concrete blocker and next step

An executable safe copy draft cannot presently choose a preservation strategy or
finite bounds: **there is no selected candidate, no candidate metadata inventory,
no pinned inactivity contract and no verified destination identity in this task**.
Implementing a general-purpose archive engine to guess those facts would expand
the release scope substantially.

The narrow next step is for Root to select one candidate after operator inventory
and inactivity assessment. Prefer a candidate that satisfies the minimal regular
file/directory scope above. Then implement its single bounded copy invocation and
inventory comparison against a pinned plan, review that code, and dispatch it to
the sole operator. Keep deletion entirely separate and absent from the script.
