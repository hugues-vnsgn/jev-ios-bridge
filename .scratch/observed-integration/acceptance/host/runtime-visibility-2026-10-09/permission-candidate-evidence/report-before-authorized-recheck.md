# Installed Xcode path policy — author host checks

**Verdict: UNVERIFIED for the required complete host gate.** The permission repair's focused checks pass on both required runtimes. Node26 default check passes; exact24 default check has three failures. Independent review, Root integration/installed proof and live acceptance remain pending. This author report is not acceptance or a final safety review.

Commit:a0e68917dca1816a6ca98315c2fc932a6fd2f2e8. Base:4004ece782fc9448607605bfe3a54702f8622bb0. Branch:fix/installed-xcode-path-policy. Exactly two committed files:src/observed/allocation-config.ts and tests/observed-allocation-config.test.ts. New scratch evidence stays uncommitted for Root's copy. final-ledger.json binds every command, count, hash, timestamp and raw-output association.

Owner oracle: the recorded answer 'Trust local admins for this one path; prepare the narrow repair (Recommended)' permits only canonical /Applications as ancestor of fixed /Applications/Xcode.app, directory/no symlink, uid0/gid80/exact0775. Allocation contract requires installed compatibility; runtime exposure diagnosis remains separate.

The private installed-path helper recognizes that exact ancestor and revalidates strict ownership/write/symlink/type checks on the fresh final leaf stat. Every other ancestor and all leaves retain their strict predicate. Commands, environment, metadata identity/byte/size/link/stamp checks, IDs, roots, budgets and public interfaces are preserved.

| Matrix row | Expected and observed | Result / evidence |
| --- | --- | --- |
| Reported root/admin0775 cutoff | Genuine unchanged-product red, then correct compatibility and permitted production composition | PASS:policy-red-node26/node24 each0/1; final focused suites |
| Normal strict path | Original ownership-only fixture succeeds through both interfaces | PASS:positive regression strict case and unchanged existing tests |
| Fresh leaf mutation | Owner/group-write/other-write changes refuse before unauthorized child/create | PASS:fresh-leaf-red-node26/node24 each4pass/6fail; all10 final cases pass |
| Exact exception negatives | Eleven uid/gid/mode/symlink/type variants refuse through compatibility and production process | PASS:focused suites; zero dispatch assertions |
| Strict descendants/other ancestors | Seven paths x three unsafe variants retain refusal | PASS:21 cases; no unauthorized child/create |
| Alternate/noncanonical metadata | Six command paths refused | PASS:zero child assertions |
| Metadata protections | Hardlink and overlong input refused; original replacement/identity tests preserved | PASS:focused suites |
| Observed ancestor change | After one authorized plist child, world-write ancestor refuses further work | PASS:ordering regression; one authorized child,no create |
| Ancestor identity limit | Different permitted ancestor inode values remain acceptable | PASS:explicit limit regression; permission policy is not atomic ancestor binding |
| Existing focused contracts | Original allocation/config/process tests retained | PASS:78/78 each runtime |
| Complete default gate |1723 assertions plus typecheck/build | Node26 PASS; exact24 FAIL3 cases, detailed below |

| Check | Node26.8.1 | Exact Node24.0.0 |
| --- | --- | --- |
| Frozen allocation-config suite |78/78,0 skips,exit0 |78/78,0 skips,exit0 |
| Typecheck |exit0 |exit0 |
| Focused build |exit0 |exit0 |
| Actual default npm run check,child umask022 |1723/1723,0 skips,exit0;typecheck/build exit0 |1720/1723,3 fail,0 skips,exit1;typecheck exit0,build not reached |
| Precisely3 failed-case diagnostic selection |Not repeated |3/3,0 skips,exit0; filtered selection,not full |

Owned Node26 coverage:78/78,0 skips,exit0; allocation-config.ts97.49% lines/89.90% branches/76.19% functions. Reported uncovered lines55 and186-190 are existing configuration/compatibility syntax; no changed policy line is listed. Existing identity/version mismatch assertions remain present and executed. Raw coverage is owned-coverage-node26/stdout.txt.

## F1 — Confirmed evidence-wrapper umask error, repaired without Source change

Initial default Node26:1719/1723,0 skips,exit1. The runner incorrectly inherited its private umask077 into child tests, masking deliberately public0644 SQLite sidecars and0755 unsafe migration destination to private modes. The same four unchanged tests fail0/4 under077 and pass4/4 under022. Root acknowledged restoring only child022, retaining parent/evidence077. Original failure, one-variable diagnosis and final gates are separate records. No product/test/assertion/timeout change occurred. The initial default spec summary is parsed separately because its first recorder recognized only TAP summaries; raw output and original receipt are unchanged.

## F2 — Exact24 full gate fails three existing cases; cause unresolved

Raw command: verified exact24 node /opt/homebrew/bin/npm run check, normal child022, no additional warning/skip flags. Result:1720/1723,3 fail,0 skips,exit1. Source437 before/after remains frozen.

| Failed case | Observed full run | Unchanged selected diagnostic |
| --- | --- | --- |
| admission-allocation.test.ts236:parked preparation exits normally then two new processes yield one action driver attachment |STATE_UNAVAILABLE:database is locked;effects0,child code0;test2264.54ms |PASS606.64ms; no recurrence |
| observed-crash.test.ts50:H06.02 cli killed public action owner at evidence:terminal:1 |7000ms fixture milestone absent;test9728.32ms |PASS1562.25ms;retained owner reached terminal milestone then requested SIGKILL |
| observed-public-races.test.ts68:H05.01 cli durable external preparation cancel at backend:list:2 fences successors |7000ms fixture milestone absent;test8096.25ms |PASS1230.40ms;retained owner reached list:2 then exited2 after cancellation/release |

The precisely3-case command/name selection and3/3 counts are in three-failures-node24/command.json. HOST_EVIDENCE_DIR retains both public host-fixture archives under failure-traces-node24/. Their relevant child stderr has only standard SQLite ExperimentalWarning; surrounding public command exits match assertions. Milestone records contain pid/key,not transaction timing. The separate allocation-store worker has no archive hook; its diagnostic result is the unchanged successful test/raw output. Existing worker-specific warning behavior is untouched; top-level wrappers remove TYPESAFE_API_KEY,NODE_OPTIONS and NODE_NO_WARNINGS.

Ranked hypotheses: (1) full parallel scheduling/storage contention is supported by nonrecurrence under the smaller selection but remains UNCONFIRMED; unchanged SQLite busy_timeout is250ms and milestone deadline7000ms. No CPU/IO trace or baseline/default-load comparison establishes the cause. (2) earlier child failure was not observed in diagnostic traces; the original full run had no retained fixture archives,so original missed milestones cannot rule it out. (3) candidate path-policy interaction is unsupported by the filtered result/static call paths,but no accepted-baseline comparison was run. Do not infer a scheduling cause from durations alone.

Root authorized precisely the3-case diagnostic and requested return idle. No repeated full exact24 retry, concurrency flag, skip, timeout/assertion relaxation or Source/test edit was used. Closing F2 requires Root-led accepted-baseline/default-load comparison,confirmed cause and a complete exact24 default gate. These failures are not promoted to PASS by the filtered diagnostic.

Dependency setup: first npm ci failed because npm rejects /dev/null used for both user/global config. Retry with distinct empty private config files succeeded using locked dependencies and ignore-scripts. Package/lock files remain unchanged. Both runtime versions were executed and preserved. No credential/environment file was loaded or copied.

All435 protected paths in accepted437 correspondence match; only the owned two differ and match frozen candidate copies. Earlier430/428 tracked audit is a separate inventory. All68 compiled JS files match across both focused builds and final Node26 default gate; exact24 failed before its full-gate build. Committed write set stays exactly two files; only own scratch is untracked. Raw/report/receipt evidence files are600 and directories700; tool-managed dependency cache and original fixture-tree modes are retained beneath private700 roots.

Root owns trust documentation,integration,installed workflow proof and independent Spec/Standards review. This repair supplies no matching iOS27 runtime bundle proof,Cryptex support,native/device acceptance,production lease/store/config change,secret access or publishing action. The pathname checks do not pin ancestor identities atomically; the owner-approved administrator trust assumption remains explicit.
