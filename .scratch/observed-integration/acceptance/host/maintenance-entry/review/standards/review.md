# Standards — PASS

Exact candidate `535973ed85ef206ab8a613105e9b24b620753c98`; sole parent `c1577abbd6933aa133b7b2007a442c2a18c7b4cc`. Exactly `src/device/admission-maintenance.ts` and `tests/admission-maintenance-entry.test.ts` changed. Both candidate blobs/SHA256 hashes match the frozen manifest, immutable copies and current files before/after review; no drift. Exact commit association is PASS.

## Documented standards

No documented breach against AGENTS/domain, the glossary, ADR0005/0008 or Root’s narrow maintenance scope. `admission-maintenance.ts:50–54` compares resolved filesystem identities instead of spelling-sensitive paths; missing/nonfilesystem importing entrypoints stay inert. The complete help string and exported maintenance function are byte-identical to the parent. Declaration validation, fixed destination, migration dispatch, safe error output and exit semantics are untouched. The repair grants no store override or new operational authority.

`admission-maintenance-entry.test.ts:29–57` exercises canonical entry, a true file symlink, a true directory alias, and imports with absent/missing host entry. Its child helper supplies no migration invocation, removes key/warning overrides, and bounds subprocess lifetime. The tests create only temporary host path fixtures. No device/store mutation is introduced by these help/import cases.

## Heuristic smells

No new named Fowler smell found. The small entrypoint identity guard is concrete and local; there is no unnecessary abstraction or unrelated refactor. Tooling-enforced checks excluded.

## Evidence and limits

Read and privately preserve original same-oracle 3/5 red logs on Node26/exact24: both alias cases printed empty stdout. Repaired logs show 5/5 on both, zero skips; receipt hashes map to the reviewed source. The oracle test hash is identical across red/green. I ran no tests/build/coverage/packing, migration, backend/device or secret operations and edited only private review artifacts. This Standards association does not infer ticket12, safety, live or full-gate acceptance.
