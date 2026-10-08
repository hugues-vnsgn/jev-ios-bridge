# Fixture-only maintenance dependency — Spec PASS

Candidate `2c6c41845e9db05de451d7b10d1674fc9136b891`, sole parent `535973ed85ef206ab8a613105e9b24b620753c98`, changes only `tests/integration-edge.test.ts`.

No findings. The named CLI report test alone removes the exact complete, anchored two-line SQLite runtime banner before its original empty-stderr assertion. Incomplete, other, malformed and prefixed warnings remain intact; a diagnostic following the recognized banner is retained. Negative assertions exercise these boundaries. Exit1, both stdout assertions, persisted evidence length and removal of the key from child environment remain unchanged. No production, runtime flag, golden or timing changes occur.

Read the preserved original Node24 failures on both accepted pre08 and parent code (0/1 each) and verified their original test bytes are identical to both committed versions. Independently ran the selected repaired case on Node26.8.1 and exact24.0.0:1/1 each, zero skips. Reporter-harness failure is documented separately from the original product-boundary red.

Before/after audits confirm final SHA256 `96ee8f46f3dc86a4546a6e934ecc1e26f9d331fb36472ac097ea86d6bc62120f`, blob `157301d4b63e122c78f6ce8e37aa66fa8ff5e405`, matches current, committed and frozen source. Both files from the earlier maintenance repair retain their exact reviewed hashes/blobs in this child. Original evidence was preserved and copied privately; no previous report was changed.

## Evidence and limits

`association.json`, `before-hashes.json`, `after-hashes.json` contain exact associations and all three mappings. `node26.json`/`node24.json` record commands, runtime versions and exits; corresponding logs contain raw results. Command: `<runtime> --import tsx --test --test-reporter=tap --test-name-pattern="^CLI report reads persisted evidence without a device or key$" tests/integration-edge.test.ts`. Child umask0022; private evidence0077.

Only the selected offline persisted-report fixture ran. No store migration, backend/device operation, secret access, full/heavy gate or packaging run. This is dependency fixture review, not ticket12 or live acceptance.
