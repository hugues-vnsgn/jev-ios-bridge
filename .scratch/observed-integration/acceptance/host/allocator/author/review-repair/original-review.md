# Spec: BLOCKED — five findings

Reviewed frozen six-file mapping against base `98f7de41baa316f47a65a7bc2160128a72051f3e`; candidate commit pending. Normative documents pinned at `eede916d23c5a30cfaf0c30779ee7771b87e0972`. All findings independently reproduced with isolated stores and explicit fake transports.

1. **P2 — Global conflict checked after probes**, `allocation.ts:68–70`. Allocation contract:14 specifies the shared global action namespace; validation H03:30 requires “retrieval/conflict zero backend calls.” An existing observed Admission claim without a new allocation causes nine plist probes before ACTION_ID_CONFLICT. Invalid prerequisites can also mask the conflict. Read global identity before prerequisite work. Proof: `probes.test.ts`, first case / `probes.log`.
2. **P2 — Guard refusal loses evidence**, `allocation.ts:169–170`. Public contract:103 requires the creation-unresolved reason to “point to its allocation evidence”; allocation:107 requires ID and evidence. Unknown-create blocker followed by another prepare returns blockingAllocationId but no persisted evidenceDirectory. Proof: second case in those files.
3. **P2 — Evidence failure commits settled refusal**, `allocation.ts:245–251`. Allocation:101 requires “evidence failure | Quarantined.” Only local-close rejection affects terminalReason; rejected diagnostic persistence is ignored. Acknowledged install failure plus an existing directory at source-diagnostics.json commits retained/refused INSTALL_FAILED despite losing diagnostics. Directory projection does not certify missing evidence. Proof: `evidence-failure.test.ts` / `.log`.
4. **P2 — Busy cancellation omits action context**, `allocation.ts:283`. Public:79 requires “ALLOCATION_BUSY plus actionId/current state and directs explicit action cancellation.” Prepare→consume→cancel returns only allocationId and a generic refusal. Proof: `busy.test.ts` / `.log`.
5. **P2 — Historical allocation IDs appear missing**, `allocation.ts:269–270`. Allocation:52 assigns historical records “read-only allocation IDs”; H08 requires conservative readable imports. After isolated historical migration, Admission resolves the imported allocation but allocator.get returns ALLOCATION_NOT_FOUND. Proof: `historical.test.ts` / `.log`.

No unasked implementation scope found. Source/test hashes match before/after reads and five probes; original snapshot preserved. No large suite independently run, production operation or live acceptance claim.

## Checks and evidence appendix

Directory: `/tmp/jev-allocator-spec-review-boonbrr6`. Each command JSON records exact command and exit. All five probes failed their intended strict assertion, zero skips, Node26.8.1, child umask0022/evidence0077, TYPESAFE_API_KEY removed. `probes.test.ts` has two cases; other three files have one each. Run shape: `node --import tsx --test /tmp/jev-allocator-spec-review-boonbrr6/<file>.test.ts`, cwd the allocator worktree. No product edits; test-created isolated directories alone cleaned by fixture teardown.

Exact candidate mapping: `manifest.json`, `before-hashes.json`, `after-probes-hashes.json`, `after-hashes.json`; all six matched. `frozen-source/` preserves inspected files; contract snapshots preserve pinned clauses. allocation.ts SHA256 `8473502a4acc9f8cafcb5c7c708bc54a4464a438f181e59da6bbe0509d97cb9f`, git blob `344b2fc97ba5d9629da31aec2a070b93b5606ba8`. Final commit association pending.

Read repaired owner raw logs: focused520/520 Node26 and exact24 (zero skips), full1319/1319 plus typecheck/build, coverage99.04% lines/88.98% branches. They miss these five boundaries. Do not substitute older516-case evidence for this mapping. Read original interrupted coverage267.85s, cancellation-store READY regression, known-stage/two-filesystem-delay10.53s failure, and repaired bounded9/9 and10/10 logs. The snapshot timeout fixture repair preserves the target30ms and guards its barrier against early completion. Full-gate evidence does not resolve the reported failures.

Live installed-host compatibility, source execution and public-adapter acceptance remain outside these fake probes. Historical real-backend incident remains UNVERIFIED.
