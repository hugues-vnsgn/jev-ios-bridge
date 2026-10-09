# Installed Xcode path policy: author host checks

**PASS for bounded final host gates on both required runtimes.** The first exact Node24 default run failed three existing cases. Its failure and the selected diagnostic remain preserved; the cause is **UNCONFIRMED**. Independent review, Root integration, installed workflow proof and live acceptance remain pending.

- Commit: `a0e68917dca1816a6ca98315c2fc932a6fd2f2e8`
- Base: `4004ece782fc9448607605bfe3a54702f8622bb0`
- Branch: `fix/installed-xcode-path-policy`
- Committed files: `src/observed/allocation-config.ts` and `tests/observed-allocation-config.test.ts`
- Evidence stays uncommitted under this private scratch directory. `final-ledger.json` binds commands, raw outputs, counts, timestamps and hashes.

## Repair and oracle

The owner answered: "Trust local admins for this one path; prepare the narrow repair (Recommended)". The recorded decision allows only canonical `/Applications` as an ancestor of the fixed `/Applications/Xcode.app` tree: directory, no symlink, uid 0, gid 80, exact permission bits `0775`.

The private path helper applies that exception and repeats strict owner, write, symlink and type checks on the fresh final leaf stat. Other ancestors and every leaf keep their strict predicate. Commands, environment, metadata identity/bytes/size/link/stamp checks, IDs, roots, budgets and public interfaces retain their existing behavior.

| Regression | Observed evidence |
| --- | --- |
| Strict success and approved exception through compatibility and production composition | Original source red on both runtimes: 0/1; final focused suites pass |
| Fresh leaf owner/group-write/other-write mutation | Before final-leaf repair: 4 pass/6 fail on both runtimes; all 10 final cases pass |
| Wrong `/Applications` owner/group/mode/special bits, symlink or file | 11 variants refuse through both interfaces; no unauthorized child or create |
| Unsafe other ancestors and descendants | 7 paths × 3 variants refuse; no unauthorized child or create |
| Alternate or noncanonical metadata paths | 6 paths refuse before child dispatch |
| Metadata hardlink and oversize | Refuse; existing identity/version/byte assertions retained |
| Ancestor becomes world writable after one authorized plist conversion | Refuses further operations; no create |
| Permitted ancestor inode replacement | Explicit limit test remains accepted: these checks do not atomically pin ancestor identity |

The final allocation-config suite passes **78/78** on both runtimes, including all existing assertions. Owned Node26 coverage passes 78/78: `allocation-config.ts` has 97.49% lines, 89.90% branches and 76.19% functions. Reported uncovered lines `55` and `186-190` predate the repair; no changed policy line is listed.

## Commands and attempts

The executables were checked directly: Node `v26.8.1`, exact Node `v24.0.0`, npm `11.19.0`. Each default gate used the selected Node executable followed by `/opt/homebrew/bin/npm run check`. No skip, concurrency, warning or timeout flags were added.

| Attempt | Result | Receipt directory |
| --- | --- | --- |
| Initial Node26 default, erroneous child umask 077 | Exit 1; 1719/1723, 4 failures, 0 skips | `full-check-node26` |
| Four unchanged failing cases, child 077 | Exit 1; 0/4 | `umask077-repro-node26` |
| Same four cases, child 022 | Exit 0; 4/4 | `umask022-repro-node26` |
| Corrected Node26 default, child 022 | Exit 0; 1723/1723, 0 skips; typecheck/build pass | `full-check-node26-umask022` |
| First exact24 default, child 022 | Exit 1; 1720/1723, 3 failures, 0 skips; typecheck pass, build not reached | `full-check-node24-umask022` |
| Precisely three failed cases, unchanged selected diagnostic | Exit 0; 3/3, 0 skips; **filtered selection** | `three-failures-node24` |
| One Root-authorized unchanged exact24 default recheck | Exit 0; 1723/1723, 0 skips; typecheck/build pass | `full-check-node24-umask022-recheck` |

Separate frozen focused typecheck/build commands pass on both runtimes. Their receipts, genuine TDD red/green receipts and coverage output appear in the ledger.

### Confirmed wrapper umask error

The evidence runner initially passed its private umask 077 to child tests. That masked deliberately unsafe SQLite sidecar `0644` and migration destination `0755` modes. The same four tests failed under 077 and passed under 022. Root acknowledged correcting only the child umask to 022 while retaining parent/evidence 077. Source, assertions and timeouts stayed frozen. The initial Node26 count is also recorded in a separate parser receipt bound to the unchanged raw output.

### Unresolved exact24 intermittence

| Original failure | Selected diagnostic |
| --- | --- |
| `admission-allocation.test.ts:236`: parked preparation exits normally then two new processes yield one action driver attachment. `STATE_UNAVAILABLE`, "database is locked", effects 0; child code 0. | Pass; no recurrence |
| `observed-crash.test.ts:50`: H06.02 cli killed public action owner at `evidence:terminal:1`. Milestone not reached. | Pass; owner reached milestone then requested SIGKILL |
| `observed-public-races.test.ts:68`: H05.01 cli durable external preparation cancel at `backend:list:2` fences successors. Milestone not reached. | Pass; owner reached milestone and exited 2 after cancellation/release |

The diagnostic retained both public fixture archives under `failure-traces-node24/`. Relevant child stderr contains standard SQLite ExperimentalWarning; command exits match the unchanged assertions. Milestone records have pid/key, no transaction timing. The allocation-store worker has no archive hook. Original full-run fixture trees were cleaned, so their missed milestones and lock timing cannot be inspected.

Ranked hypotheses:

1. Full parallel scheduling/storage contention is compatible with nonrecurrence in the smaller selection, but **UNCONFIRMED**. Existing SQLite busy timeout is 250 ms; milestone deadline is 7000 ms. No CPU/IO trace or accepted-baseline comparison establishes causation.
2. Earlier child failure was absent from diagnostic traces; it cannot be ruled out for the original missed milestones.
3. Candidate path-policy interaction is unsupported by the filtered result and static call paths, but no accepted-baseline comparison establishes its absence.

The authorized final default recheck used the same command, environment keys and child 022. `HOST_EVIDENCE_DIR` was not added to the comparable default because copying fixture archives changes its work. The passing recheck does not explain or erase the first failure. No further full retry ran.

## Freeze and limits

All **437** accepted files were hashed before and after the final defaults. The **435** protected paths match the accepted reference; the two owned files match the frozen candidate. Earlier 430/428 tracked-file counts are a separate inventory. All **68** compiled JavaScript files match across both focused builds and both final default gates. Git retains exactly the two-file commit and only this scratch directory untracked.

First dependency setup failed because npm rejected `/dev/null` as both config files. Locked `npm ci --ignore-scripts` succeeded using distinct empty private config files. Package and lock bytes stayed unchanged. Wrappers remove `TYPESAFE_API_KEY`, `NODE_OPTIONS` and `NODE_NO_WARNINGS`; existing worker-specific warning behavior stays unchanged. No credential file was read or copied.

Report/raw/receipt files are mode 600 and directories mode 700. Tool-managed dependency cache and preserved fixture modes remain under private 700 roots. Pre-recheck report/ledger copies preserve the earlier UNVERIFIED assessment.

This author report does not certify installed compatibility or atomic path binding. The administrator trust decision remains explicit. No Cryptex/runtime discovery support, device operation, production store/config/journal/lease change, secret access, integration, merge, push or publication occurred. Root owns independent Spec/Standards reviews and installed/live proof.
