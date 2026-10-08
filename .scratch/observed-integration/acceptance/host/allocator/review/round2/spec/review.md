# Spec re-review: BLOCKED — one changed-boundary regression

The five original findings are resolved against the six-file `review-repair/final-source.json` mapping based on `98f7de41baa316f47a65a7bc2160128a72051f3e`. Commit association remains pending.

**P2 — Retirement of active preparation is misreported as storage failure**, `src/observed/allocation.ts:307–310` (and the unconditional executing message at `allocation-schema.ts:69–70`). Allocation-contract:103 says “Retire active … Active: refuse ALLOCATION_BUSY.” Admission correctly returns ALLOCATION_BUSY for a preparing allocation, but the new context validator accepts only executing. The allocator consequently returns STORE_UNAVAILABLE with unknown acceptance despite healthy storage. Reproduction: start fake preparation, pause boot, call retire(allocationId), then release boot. Result is STORE_UNAVAILABLE; the original preparation still completes. Preserve the preparing retirement refusal and describe its actual state without directing cancellation of a nonexistent executing action. Proof: `retire-preparing.test.ts`, `retire-preparing.log` (one genuine failure).

All five original unchanged probes pass **5/5 on Node26.8.1 and exact24.0.0**, zero skips. Source and the owner’s inspected42/42 bounded log support: preflight conflicts for generic observed/preparation/imported identities; verified blocker directory and safe bad-read failures; evidence-failure quarantine with acknowledged stage refusals preserved; executing busy context; immutable historical get/cancel/retire, zero new held bytes, null reason, consistent authority, original historical outcome and current quarantine distinguished from mere busy admission. These match Root’s c8012f40 historical/busy interpretation. No additional scope finding in these repairs.

All6 source/test hashes matched before and after reads/probes; original probes and logs were untouched. Full gates were not independently run or claimed. Candidate source/test snapshot preserved privately. No production/backend/device/live acceptance claim; historical real-backend incident remains UNVERIFIED.

## Evidence appendix

Directory: `/tmp/jev-allocator-spec-recheck-10qe7wtm`.

`manifest.json`, `before-hashes.json`, `after-hashes.json`: exact six-file mapping; only allocation.ts/schema/test changed versus round1.

- allocation.ts SHA256 `8c8fac7e154782c1b2ab10fc641135eb6afe0e88db38e92835dcfddbc22cfcc4`, blob `87964a13e4745937acc5e7e0a72c6a23af083df7`.
- allocation-schema.ts SHA256 `8b98f81eff0d9f94af96f9b526140938e679d9a7cf38d64060d3030a02a37a7e`, blob `554178c9997fdc04802f12c8b785c2532a0947c6`.
- observed-allocation.test.ts SHA256 `930c63928af339ca18ac9cb52c39dce839117d7ceb02f89f6d75946da36dbc37`, blob `da65fe6546d779696a3cf7b8e6be85e1bd17e9fc`.

`node26.json` / `node26.log` and `node24.json` / `node24.log` hold exact commands, versions, exit0 and5/5 outcomes. Command: `<node> --import tsx --test --test-concurrency=1 /tmp/jev-allocator-spec-review-boonbrr6/probes.test.ts /tmp/jev-allocator-spec-review-boonbrr6/evidence-failure.test.ts /tmp/jev-allocator-spec-review-boonbrr6/busy.test.ts /tmp/jev-allocator-spec-review-boonbrr6/historical.test.ts`. Exact24 executable: `/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node`. Childumask0022/evidence0077; TYPESAFE_API_KEY removed.

`retire-preparing-command.json` records the extra bounded command and exit1. No old probe modified. Owner raw final-bounded-green.log42/42 inspected; original typecheck.log failed on an optional test value, then typecheck-corrected-fixture.log passed. That fixture diagnostic is not product red evidence. No claim about unfinished full gates.
