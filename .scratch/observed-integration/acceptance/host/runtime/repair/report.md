# Ticket06 Spec repair handoff

Verdict: PASS for the authorized fake host repair matrix; source stopped for independent re-review.

Original frozen candidate: `c751a73df7931107af23619c350d2ca406ac55db`. Repair candidate: `a898e80bf3d0d5af7b17618f9fcec56695174289`.
Accepted dependency base: `98f7de41baa316f47a65a7bc2160128a72051f3e`; original dispatch base: `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181`.

Exact repair files: `src/observed/service.ts`, `tests/observed-service.test.ts`, `.scratch/observed-action-rollout/issues/06-observed-runtime.md` (Comments only). No other source/test files changed.

## Findings and mechanisms

- **P1:** validate action identity, synchronously revoke/abort the existing local owned job, then read authority. A failed initial read still returns STORE_UNAVAILABLE. No durable cancellation or takeover is invented. The regression hides only the isolated testing DB; confirms synchronous revocation, one pending fake snapshot only, no late persisted observation/input, false input flags, durable markerfalse and unresolved/null/unconfirmed authority when finalization cannot commit.
- **P2:** the completed observation deadline no longer applies during the independent5000ms finalization budget. Confirmed650ms close preserves already_satisfied after observation before500ms. Both local controller cancellation and fresh durable cancellation are checked before candidate commit, including after provisional persistence. Prolonged close AND provisional persistence with failed durable cancel writes assert markerfalse before release, then committed CANCELLED/quarantined with markertrue only when accepted03 claim.finalize commits its local cancellation flag jointly. Null input uncertainty, closefailure/closepending and postcommit export semantics remain strict.
- **P3:** HOST_CREATION_UNRESOLVED reads the BLOCKING allocation through accepted Admission.readAllocation and verifies identity, live guard and persisted absolute directory. The refusal includes that exact directory, never a requested-action path or invented file. Throwing/missing/relative/wrongidentity/notblocking read cases return STORE_UNAVAILABLE, preserve no acceptance/no effects, guard/ready binding/capacity and DBbytes. The older synthetic nonexistent-blocker fixture now persists a real unresolved creator and asserts its directory; case count and zeroattachment assertions retained.

## Reproduction and preserved failures

`original-candidate/` contains the exact three c751 files before edits; `original-evidence/` preserves the original15-file manifests, raw logs and report. `probes.test.ts`/`probes.log` retain both original independent genuine failures, and `host-guard.test.ts`/`host-guard.log` retain the third independent failure. Own service-boundary genuine reds: `p1-red-node26.log`, `p2-red-node26.log`, `p3-red-node26.log`; corresponding greens and final affected/focused logs prove fixes.

`local-finalization-original-red.log/.json` ran the additional close/provisional failed-write tests against exact c751 service bytes, restoring the repair source in finally: close passes, provisional is genuine red (unconfirmed rather than committed CANCELLED). Final strict cases both pass.

Two honest fixture diagnostics remain retained: `boundaries-node26.log`8/10 incorrectly expected markerfalse after a legitimate jointfinalize; `affected-node26.log`24/25 named a nonexistent blocker yet expected a verified pointer refusal. Corrected accepted-store oracles and real persisted blocker strengthened the tests. Neither diagnostic is claimed as product red/green evidence. The early P1 shell footer used a reserved zsh variable after the test; its raw test failure is retained, independent probe also confirms the genuine failure.

## Frozen final checks

| Gate | Node | Result | Exit / skips | Seconds |
|---|---|---|---|---|
| affected-final-node26 | v26.8.1 | 25/25 | 0 / 0 | 17.19 |
| affected-final-node24 | v24.0.0 | 25/25 | 0 / 0 | 17.15 |
| focused-final-node26 | v26.8.1 | 136/136 | 0 / 0 | 32.85 |
| focused-final-node24 | v24.0.0 | 136/136 | 0 / 0 | 32.36 |
| full-check-final | v26.8.1 | 1268/1268 | 0 / 0 | 53.48 |
| spike-typecheck-final | v26.8.1 | PASS | 0 / 0 | 0.19 |
| coverage-final | v26.8.1 | 136/136 | 0 / 0 | 32.74 |
| diff-check-final | v26.8.1 | PASS | 0 / 0 | 0.03 |

Every exact command/version/exit/count is in its same-name JSON; raw output is in the same-name log. Full npmcheck includes typecheck/build. Coverage136/136: **98.93%lines /91.48%branches /96.36%functions** across original changed modules; repaired service **100%lines /92.63%branches**. No service uncovered lines. Standalone spike strict compile passed.

`final-source.json` is the distinct repair15-file SHA256/gitblob pin; only service.ts and its owned test differ from c751. `final-hash-check.json` verifies15/15 unchanged after every final gate. No source/test edits followed the pin. `frozen-repair.patch` preserves exact product/test diff, `case-matrix.md` maps P1/P2/P3 and existing uncertainty/cancellation/finalization cases to H01/H03/H05/H06/H07/H08. Window released to Root immediately after final process/hash audit, before metadata edits.

## Limits and provenance

Bounded fake host only: explicit Admission.forTesting and injected fake runner/opener; no production store/backend/device/secrets/cleanup/migration operations. Migration43cases preserved and retested on26/exact24; no migration source/fixture changes in repair. No protected source, goldens or shared integration changes. Admission remains borrowed; reads/construction/polling remain nonmutating.

Original Node24 warning-handling fixture failure125/126 remains separate from product red evidence. The pre-warning original manifest was reconstructed from the known one-line warning fixture edit; that provenance is retained in copied `original-evidence/manifest-provenance.txt`, `source-before-warning-fixture.json` and `warning-fixture.patch`. The repair did not modify warning handling. Enabled spike production composition remains host-unexecuted; its uncovered11–12/19–23/26 usage/production/error glue was reviewed and typechecked. Simplify unavailable and not run. Independent re-review and Root integration remain pending; no unresolved repair ownership/interface blocker.

`checked-revisions.json` confirms committed source/test blobs match all15 frozen entries, parentc751, exact3-file repair scope, and clean tracked tree.
