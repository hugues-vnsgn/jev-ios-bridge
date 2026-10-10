# Standards

Reviewed `b8c4a50942551bdf95d00036a6d2f7bb6142ff43...a3e6c4e3cbecd0bba345c3ac2004ff4530141e3a` within the assigned code/package paths. Sources: AGENTS.md, domain guidance/glossary, architecture boundaries, ADR-0002/0005/0007/0008/0009, and all twelve smell heuristics. Tool-enforced issues excluded.

## Documented-standard conflict

- **P2 — Reconcile Simulator presentation with durable admission.** `src/device/index.ts:815` now dispatches `window` through admission and the lease ledger; line 817 throws when the deadline or uncertain failure closes issuance. ADR-0007:24 promises “If `open` fails or takes more than 10 seconds, the run gets a warning and carries on”; line 27 explicitly excludes presentation from the ledger. The accepted ADR-0008 admission policy explains conservative fencing, but the changed ADR-0007 still only adds the creation cross-reference. Amend its presentation rules to describe the accepted fenced behavior, including timeout/uncertainty. This is a hard documentation/implementation conflict; it does not justify bypassing admission.

## Judgment calls

- **P3 — Possible Duplicated Code / Shotgun Surgery.** `src/device/admission-migration.ts:28` and `src/device/admission-sqlite.ts:47` independently declare the same four `protectedDevices`. Migration quarantine and runtime acquire/create/supplied refusal depend on separate copies. A future exclusion change can update one policy path while missing another. Extract one immutable definition.
- **P3 — Possible Duplicated Code.** `src/observed/schema.ts:48` and `src/observed/allocation-schema.ts:37` both export `canonicalJson` for immutable request digests. Their implementations already differ: the former filters undefined object fields, while the latter serializes every key. Current validated inputs do not demonstrate a replay bug, but maintaining two canonicalization policies risks identity drift. Share the JSON canonicalizer while keeping request normalization separate.

## Evidence and limits

Read the preserved Node 24/26 final raw check logs and verified their hashes against the supplied root audit: each records 2,258 passing tests and the build. Read raw npm/plugin installation command records and stdout/stderr; installation acceptance remains qualified by `npm_config_maxsockets=1`. Historical default npm stalls remain unresolved. No commands were executed to test, install, access account authority, or operate devices. L01–L05/native/account acceptance remains deferred.

Three findings: one documented conflict (worst P2), two heuristic judgments (P3).
