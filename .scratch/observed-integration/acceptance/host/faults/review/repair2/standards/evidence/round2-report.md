# Ticket09 repair2 — BLOCKED full gate

Candidate `d0c24bbbef7961a9377d6338fcff140e7373244e`; exact parent `08a985805cb442a2404eb9561ae92f69748ae5e0`. Branch `feat/observed-host-faults`, worktree `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/observed-host-faults`. Original candidate08, parent75, dispatch base and dependency provenance remain distinct and preserved. No merge, push, publication, base advance or protected timing-fixture edit occurred.

## Verdict and executed gates

Mapped isolated host assertions: **PASS** on both complete added suites. Overall default gate: **BLOCKED/pending Root diagnosis** of the unchanged protected boot-poll fixture. Root/live acceptance and final independent reviews: **UNVERIFIED**.

| Durable unique run | Command | Exit | Tests/pass/fail/skips | Typecheck/build |
| --- | --- | --- | --- | --- |
| round2-typecheck-node26 | npm run typecheck | 0 | — | PASS / not requested |
| round2-added-node26 | node26 --import tsx --test three owned suites | 0 | 193/193/0/0 | separate typecheck / not part of command |
| round2-added-node24 | exact24 --import tsx --test three owned suites | 0 | 193/193/0/0 | full24 gate below / not part of command |
| round2-check-node26 | actual default npm run check | 1 | 1668/1667/1/0 | PASS / not reached |
| round2-check-node24 | actual default npm run check | 0 | 1668/1668/0/0 | PASS / PASS |
| round2-check-node26-rerun | ONE Root-authorized unchanged actual default npm run check | 1 | 1668/1667/1/0 | PASS / not reached |

All runs have0cancelled and0todo. Node versions are26.8.1/exact24.0.0. Test children use0022; evidence parent0077. TYPESAFE_API_KEY/NODE_OPTIONS/NODE_NO_WARNINGS removed without printing; exact24 PATH pinned. No warning suppression, serial fallback, changed parallelism, budget or assertion relaxation. Root reclaimed the sole heavy window after the final command ended; no further09 tests are authorized/running.

Both default26 failures are solely `tests/observed-allocation.test.ts:392:86`: list timestamp count expected2/actual1 under unchanged bootTimeoutMs1100. Test SHA256 `0b0358c4d031f24aef59cb0bf70a5bab7be2dd999fd168295cd6a5b48d7e794f` matches exact parent. First log SHA256 `699ac20c5dea5e4745658e47f2d1cc6324de24adc38b9d3c71bfb83988240d75`, excerpt `b14c52777b721c09f295392462486eb2fc9c0c3f63dda55874ffe23ce28e1ae2`; rerun log `485f13b5d7061e9999c4916eac838916f1d2a782f30f77766b6eed6de1b1a43b`, excerpt `759b552429697e0abaf3be135914942b0742c2c2c224b8ff120bcedc34933b2f`. Classifications and exact raw errors preserved. First metadata typo (bootCalls/fixed1150) is retained alongside accurate classification-v2 (list timestamps/1100); Source/raw never changed. No product defect inferred. Root owns this protected fixture diagnosis and pending default26 acceptance.

## Focused proof corrections

- H05.01, both transports,24 executions: public-races:82/85 compares the complete call sequence to the actual pre-barrier prefix; ONLY the `afterCommit:startCreation:1` durable authorization permits one create afterward. Every other gate permits no suffix. Final actual owner exit is checked, so list/capture/screenshot/window/stop/cleanup/successor effects fail.
- H05.02, both transports,8 executions: public-races:103/107 permits only one already-authorized touch at semantic `durable:tap-authorized:1`; touch already issued at backend/provisional gates is counted in the captured prefix. All successor operations forbidden. Duplicate retrieval and owner exit preserve complete sequence.
- H05.03/.06, SIGINT/SIGTERM,4 executions: public-races:125/200 preserves complete call sequences through actual production130/143 exit (ready-commit race still permits ordinary0). Existing durable/read invariants/budgets unchanged.
- H06.05/.06, MCP/CLI,2 executions: crash:119/125/135/140 retains exactly one already-issued touch and no additional operations after cancel, ignored-abort late reply, reads, refused legacy successor and confirmed owner exit.
- H05.12,4 early CLI executions: early-cli initializes and synchronously appends/fsyncs every real delegated source/runner/window attempt; production owns signals/process.exit. Public-races:185–187 compares actual complete attempts to the held-phase prefix after exit, requires actual143/null-signal, one final143 process-exit record and no error records. No stale calls.json or fabricated final snapshot.

The durable Spec report identifies the two original oracle/evidence counterexamples; these are proof gaps, not product reds. Contract basis: admission-decision:149 revokes future command issuance, :151 forbids app stop/further device cleanup; public-contract:77 denies later authorization; validation-matrix:56 requires forbidden-effect evidence. Earlier six-family closure/assertions remain unchanged in runtime Source. Skills applied: diagnosing-bugs for immutable counterexamples/classification, TDD for regression-oracle repair at real delegated seams, do-test for complete executed verdicts; existing Root-assigned isolated worktree verified under use-git-worktree.

## Inventory, raw mappings and hashes

396 inventory IDs = original362+34 prior honest additions; repair2 adds0IDs/tests.193 actual executions per added run =178original+15prior additions. Matrix per-ID assertions and testSourceSha256 link to shared/family fixture artifact sets for both added runs and all actual full runs. Sharing does not imply396 unique executions. Each full26 record is explicitly FAIL; a bounded row PASS cannot certify default full acceptance.

`round2-raw-index.json` preserves **30765 regular files +25 symlink records** across all5 suite runs, SHA256 `d267aaa0d859db7de5bfd805231019b3663efd12622452dc23166533b932615f`. All regular paths/sizes/content SHA and symlink targets recorded; no symlink targets followed. `round2-gate-summary.json` records before/after10 Source hashes, counts, exits and commands. `round2-fresh42-trace-audit.json` associates84 actual corrected-case records (42/runtime) with final complete traces, call counts, actual owner exit flags and early-source attempts. Its final counts supplement the executed actual-prefix assertions; no fabricated before snapshot or unavailable prior48trace audit is substituted.

Executed Source freeze: `round2-static-freeze.json`. Final manifest: `round2-final-freeze.json`, SHA256 `59a5b4e0a8036d5cd5f8829d51063efc372d4823e39857743e3bf21596224310`. ALL8 runtime test/fixture paths, including producer trace, remain identical before/after every gate and in this commit. Only own issue comments and case-matrix evidence/verdict metadata were finalized after execution; these2 metadata paths are explicitly different from gate-time bytes. Complete10-file copies in `round2-final-source/`; candidate/tree/per-path hashes in `round2-commit-association.json`. Per-ID test Source SHA in matrix matches executed runtime bytes.

Original108 protected mappings: **107 unchanged + exactly ONE Root-authorized producer trace delta** at observed-cli-server:76. It synchronously records fake window attempt immediately before the identical assert.fail; no hooks.before, timing/scheduling hook, rejection message or lifecycle changes. Original blob/hash/source/minimal diff: `round2-producer-transfer.json`, `round2-original-producer.ts`, `round2-producer-minimal.diff`. Full protected final audit: `round2-final-protected-audit.json`. Actual child diff contains6 allowed changed paths, within10-path authorized scope. Canonical issue Status ready-for-agent; execution ledger remains Root-owned.

## Preservation and limits

`round2-original08/` preserves original9 candidate Source hashes/bytes and final Spec report. `round2-evidence-loss.json` truthfully records unavailable original3176indexed raw files and previous48trace audit after /tmp clearing; neither recreated nor recertified. Root durable survivor copies preserve66top regular files and readiness/closureSources; old /tmp references in historical metadata are associations, not currently available raw proof. Original transient partial JSONL bytes were not captured; old completed/error raw archives are now unavailable. New harness retains encountered partial milestone bytes, rejects malformed complete records, and requires final traces complete after all owners exit; new early trace reader also requires complete final newline/records.

Startup STORE_UNAVAILABLE wrapper proves fixture composition parity only; unchanged production mapping cited separately. SQLITE_FULL is injected at accepted hooks; readonly uses an actual isolated mode500 directory. Migration/primitive alias/stale-token checks are supplemental isolated host proofs, not actual live fencing. Fake window attempt counting is not real/native presentation. No real device/store, Admission.open, migration activation, SDK judgment, keys/.env, replay, release/publication operation. Root H01–H09/live/Ticket12 acceptance remains unverified.

Needed Root action: protected boot-poll fixture diagnosis/default26 gate completion, plus fresh Spec/Standards reviews of exact child including the narrow producer transfer. No protected runtime source fix requested by these two oracle repairs.
