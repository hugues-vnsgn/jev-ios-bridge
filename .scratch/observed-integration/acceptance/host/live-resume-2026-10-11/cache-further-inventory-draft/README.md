# Further cache inventory — unexecuted draft

Only the sole operator may run this reviewed source. No host/cache queries,
execution, syntax checks or tests were performed while preparing it. Root must
pin both script hashes and review the exact commands before dispatch.

Fixed context: integration checkout, Node
`/opt/homebrew/Cellar/node/26.8.1/bin/node`, account 501:20. Directory must already
be owner 501 mode0700; both scripts must be mode0600. The imported recorder fixes
all receipt output to this exact `cache-further-inventory-draft` directory.
No output-directory parameter or arbitrary source argument is accepted.

The only enable argument is `--read-only-once-after-root-review`; without it the
entry refuses. `inventory-claimed.json` is an exclusive once marker. Each native
command also creates an exclusive claim, raw stdout/stderr and actual-close
receipt. Do not rerun after a failure or remove markers; review settlement first.

## Fixed command order

1. Shallow `.konan` names and nofollow lstat facts, maximum512 children. No file
   contents read; record symlink leaves without following them. Root and ancestor
   identities are checked, with the root directory held open during enumeration.
2. `/usr/bin/du -k -d 1 -P -x /Users/hugues_mini/.konan`
   —180seconds,128KiB combined output.
3. `/bin/ps -axo uid=,comm=` —30seconds,1MiB. Executable names only, signed UIDs
   accepted. Java presence is recorded without attributing it to a cache.
4. `/usr/sbin/lsof -nP -F0pcfn +D /Users/hugues_mini/.konan`
   —180seconds,2MiB. No link-following option. Clean empty exit1 means only
   `NO_MATCH_OBSERVED`; valid nonempty exit0 means `OPEN_FILES_OBSERVED`. Both are
   retained observations. Any diagnostics, unknown shape, truncation or unsettled
   outcome stops the sequence.
5. `/usr/bin/du -sk -P -x` with these **eight exact arguments**,180seconds,128KiB:
   - `/Users/hugues_mini/.gradle/caches/build-cache-1`
   - `/Users/hugues_mini/.gradle/caches/9.6.1`
   - `/Users/hugues_mini/Library/Caches/org.swift.swiftpm`
   - `/Users/hugues_mini/.npm/_cacache`
   - `/Users/hugues_mini/.cache/uv`
   - `/Users/hugues_mini/.cache/bazel-repo-contents-cache`
   - `/Users/hugues_mini/.cache/bazel-repo-cache`
   - `/Users/hugues_mini/.cache/huggingface`

No `lsof` calls for those eight roots yet. Missing roots, permissions refusals and
other nonzero `du` outcomes remain failures with retained receipts; there is no
fallback or automatic scope change. All native commands use shellfalse and an
explicit clean environment; they drain both pipes and await direct-child close.
Timeout/overflow triggers TERM then250ms KILL escalation. Descendant settlement
is unobserved. Filesystem metadata calls are awaited; kernel stalls are not
claimed cancellable. Concurrent namespace races are qualified in the result.

`commands.mjs` reuses the accepted readiness-v2 recorder, changing only its
evidence directory, renaming its local account-home variable, and avoiding
retaining empty chunk objects once an output cap is exceeded.

No archive, removal, configuration read, secret read, device operation, build or
process termination other than a bounded recorder-owned child on exhaustion is
included. Allocated totals and no-match observations do not authorize retirement.
