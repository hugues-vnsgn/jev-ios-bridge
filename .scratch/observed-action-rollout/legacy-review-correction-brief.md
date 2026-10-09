# Correct the legacy implementation review findings

Status: prepared, not dispatched. Root supplies the sealed Spec and Standards implementation reports before authoring resumes. Candidate4fa9cc99 remains frozen until that dispatch.

## Bound scope

Continue in the existing isolated `fix-installed-cryptex-runtime` checkout from exact4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d. Keep the approved legacy v3 policy SHA14dd5566f99845a4ee6562404c16610c732795f311b7df1e95ecb306dd599492 and existing Applications/Cryptex approvals unchanged. Owned Source paths remain `src/observed/allocation-config.ts`, `tests/observed-legacy-volume-runtime.test.ts` and `tests/fixtures/observed-legacy-volume-runtime.ts`; other440 Source paths, original tests/assertions, public signatures/defaults and all prior evidence remain protected. Write fresh private evidence under `.scratch/installed-legacy-volume-runtime/review-correction/`. No native metadata, account, device, SDK or network work is granted.

## Findings to correct

The independent Spec reviewer classifies two implementation defects. Root binds its exact sealed report in the dispatch; the following is the concrete correction scope.

1. **P1, policy v3:27:** captured enumeration candidate identity is not bound to later metadata conversions. A candidate can start at ino101, remain101 through runtime listing, be observed as202 throughout the Info conversion, then return to101 before profile/final checks. The conversion currently accepts its own stable202 snapshots. Reject the observed mismatch at the affected proof, without waiting for final enumeration validation. Bind every subsequent mounted Info/profile/SystemVersion read and full-path snapshot to the captured candidate; include factory-internal diskutil recursion as well as the caller validator. Checking only a wrapper around the factory does not cover its closed-over recursive calls.
2. **P2, policy v3:23:** cancellation during awaited open or EOF read can still dispatch a later handle.stat. Check the shared signal immediately after awaited file stages. Place the post-open check inside try/finally so the handle closes. After cancellation, close-only cleanup may proceed; no new stat/read/conversion may start.

Extend the shared private boundary. A private context-aware invoker registered against the public production factory can carry an explicit per-call expected snapshot while preserving exported signatures. Keep expectation propagation explicit, including internal recursion; do not introduce a mutable current-proof cache or global anchor. The captured identity is a comparison baseline, not reusable read-only authorization: every required fresh diskutil proof still runs. Preserve child accounting, deadlines, termination and mount rules.

## Genuine regressions and evidence

Before repair, add fresh failing cases in the owned test/fixture files. Reproduce the stable temporary identity change/restoration with unchanged readonly XML and bytes; separately expose a mismatch only inside the production inner conversion while outer snapshots stay stable. Cover both mounted classes and all three metadata leaves. Derive production observation counters from that fixture's actual log, independently of injected-process counts. Ensure valid positive preconditions and record the mismatch window. Preserve all earlier cases and assertions.

Add cancellation regressions for abort after open resolves and after an EOF read returns. Assert rejection, zero later stat/read/conversion effects and exactly one close. Do not increase timeouts or weaken existing assertions. Preserve complete raw red/green receipts and immutable Source vectors on both exact Node26.8.1 and24.0.0.

Freeze the corrected candidate and full443 Source/69 compiled vectors. Run focused coverage, the actual unmodified official defaults/typecheck/build on both exact Nodes, and then independent re-review. Preserve the original4fa Node24 failed default, every diagnostic and both implementation review reports. Later greens establish their own observations; the original lower cause remains unresolved.

## Candidate gates before integration

Policy v3:37 requires the final frozen candidate's clean installed proofs and wrapped startup before Source integration. Run the unchanged `tests/fixtures/observed-packaging/proof.mjs` at the author CWD on each exact Node with fresh private evidence roots. Preserve all37 commands and actual closes,69 compiled payloads at each npm/plugin/build location, archive hashes and Source association. Use the unchanged fixed startup helper and guard in a fresh recorder bound to those candidate installed proofs. No helper or protected fixture repair is granted.

Root integrates only the exact reviewed three-path delta after those candidate gates pass. Root then repeats fresh physical integrated checks, npm/plugin and startup gates before the sole operator's once actual compatibility lookup. Keep all candidate and integrated evidence distinct.

The prepared native guard must preserve the actual registered factory identity when calling compatibility verification; a recording wrapper must not hide the production private invoker. Record actual child work at the recording launch seam and retain any changed trace scope explicitly. Root and reviewers remain coordinators; no native trial is authorized by this brief.

Return the frozen candidate SHA, exact owned/protected/compiled vectors, red/green/default receipts, preservation manifest and candidate installed/startup results. Then return idle for Root's audit and re-review. Live entry, L01-L05 and ticket12 remain unverified.
