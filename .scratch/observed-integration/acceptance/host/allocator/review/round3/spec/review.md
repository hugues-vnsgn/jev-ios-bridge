# Spec round3 recheck: PASS — frozen source, commit association pending

All five original ticket07 findings and the preparing-retirement regression are closed against round3/final-source.json, based on `98f7de41baa316f47a65a7bc2160128a72051f3e`. No remaining finding within the requested repairs and changed boundaries.

The narrow change in `src/observed/allocation.ts:309–312` accepts verified preparing state only for retirement; busy cancellation still requires executing. `allocation-schema.ts:69–73` describes preparation and directs allocation cancellation for preparing retirement, while executing responses direct action cancellation. This satisfies allocation-contract:103 and Root’s `459dafc252c5c43e4674d8f8265f8427b75c601b` interpretation. Invalid IDs, state, evidence paths or unavailable context still fail safely without inventing authority or cancellation targets. Retirement does not cancel the pending preparation.

Independently replayed **all six unchanged probes:6/6 Node26.8.1 and6/6 exact24.0.0**, zero skips, exit0. The original global conflict, guard evidence, diagnostic failure, executing busy context and historical lookup cases remain green. The previously failing preparing-retirement probe now returns ALLOCATION_BUSY with preparing state, actual identities/evidence, acceptanceyes, and allocation-cancellation guidance; releasing its fake boot permits the original job to complete normally.

Read the owner’s **16/16 bounded green** log and inspected the added strict negative context tests and byte/call invariance assertions. All six current files and immutable round3/source copies match the manifest before and after reads/probes. Other three files remain identical to round2. Original probes/results are preserved. Final commit association remains pending; no final heavy-gate or live acceptance claim.

## Evidence appendix

Directory `/tmp/jev-allocator-spec-round3-6hf4xs97`; `manifest.json`, `before-hashes.json`, `after-hashes.json` record the exact six-file mapping.

- allocation.ts SHA256 `0233ea8d8d571761596287e9369f7801bd693edfe6d95c459a950e4c3b943041`, git blob `972dd0468cfc9361feac2aef327db6a2fc0f0b4c`.
- allocation-schema.ts SHA256 `f48809598c4db4f8609f565659d89bc5438370d1d68b6229f97e8e40a8e6b3ca`, blob `31fece6fc2cde32e8a55a6c323163573186be3af`.
- observed-allocation.test.ts SHA256 `0b0358c4d031f24aef59cb0bf70a5bab7be2dd999fd168295cd6a5b48d7e794f`, blob `a63386a67cb6b843a8fe93a691ad794d20c19772`.

Exact command arrays/runtime/exit receipts: `node26.json`, `node24.json`; raw `node26.log`, `node24.log`. Both use `--import tsx --test --test-concurrency=1`, the four original files in `/tmp/jev-allocator-spec-review-boonbrr6` (`probes.test.ts`, `evidence-failure.test.ts`, `busy.test.ts`, `historical.test.ts`) and unchanged `/tmp/jev-allocator-spec-recheck-10qe7wtm/retire-preparing.test.ts`. Node26 executable `node`; exact24 executable `/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node`. Cwd allocator worktree; childumask0022/evidence0077; TYPESAFE_API_KEY removed. `probe-hashes.json` confirms unchanged files.

No product edits, full-suite execution, production stores/backend/device or secret access. Historical real-backend incident remains UNVERIFIED; broader acceptance remains Root-owned.
