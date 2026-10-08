# Standards — PASS

Candidate `2c6c41845e9db05de451d7b10d1674fc9136b891`, sole parent `535973ed85ef206ab8a613105e9b24b620753c98`; only `tests/integration-edge.test.ts` changes. Candidate SHA256 `96ee8f46f3dc86a4546a6e934ecc1e26f9d331fb36472ac097ea86d6bc62120f` and blob match frozen/author/current bytes. Earlier two-file repair blobs and its private review remain unchanged before/after. Exact commit association is PASS.

## Documented standards

No breach against AGENTS/domain, ADR0005/0008, or the narrow fixture transfer. The diff is confined to `CLI report reads persisted evidence without a device or key` (`tests/integration-edge.test.ts:223–245`). Its local helper accepts only the anchored complete SQLite runtime notice and exact trace-hint line. Missing/incomplete/other/prefixed notices remain; any program diagnostic after an accepted notice also remains and fails the unchanged empty-remainder assertion.

Existing failed-report exit1, both report stdout assertions, absent-key setup and persisted-event assertion are untouched. No production/runtime suppression, golden change, timing change, alternate store authority or migration invocation is introduced.

## Heuristic smells

No new named Fowler smell found in this one-file change. The deliberately local, exact fixture rule stays within its authorized test scope; no broader helper/refactor is required. Tooling-enforced checks excluded.

## Evidence and limits

Read preserved exact24 current-parent and pre08 baseline logs: the same original test bytes fail solely on the same runtime notice. Frozen original/current files independently match their commit bytes. Selected repaired TAP logs pass1/1 on Node26/exact24, zero skips. The first Node26 count-reader/reporter mismatch is separately preserved as a result-reader failure, not behavioral red.

No tests/heavy gates, product/tracker edits, backend/store/device/key or secret operations performed. Private hash mappings, diff and raw-log copies accompany this report. This dependency Standards verdict does not imply ticket12, safety/live or full acceptance.
