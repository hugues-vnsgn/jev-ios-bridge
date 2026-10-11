# L04 receipt oracle correction — 2026-10-11

The earlier planning rows required attempted true / acknowledged false after withholding the successful real touch reply. That expectation conflicts with the accepted durable contract. The corrected public expectation is attempted null / acknowledged null, committed inconclusive / UI_ACTION_UNCONFIRMED, and quarantine.

This changes three planning rows only: the validation matrix, remaining execution brief and next-work table. Exactly one real touch, retained successful raw bytes, pre-acknowledgement reply withholding and zero backend commands for retrieval/repeat/conflict/refused legacy successor remain required. Diagnostic recorder evidence must never write or promote the authoritative flags.

## Evidence inspected

- `evidence/public-contract.md:67`: null means durable evidence cannot determine the flag; inspection returns persisted flags rather than projecting provisional evidence.
- `src/device/admission-sqlite.ts:619–620`: committed dispatch authorization grants permission, not proof of backend entry; both flags become null.
- `src/experimental/observed-tap.ts:80,94`: successful returned tap records true/true; unknown receipt maps to UI_ACTION_UNCONFIRMED.
- `tests/observed-service.test.ts:145–160`: existing lost-input-reply test requires null/null, quarantine and no replay after reconstruction.
- `tests/observed-crash.test.ts:41–46,110–125`: existing interrupted/late reply coverage preserves unknown flags.

Root and independent reviewer `/root/sam_setup_review` both concluded that this is a planning documentation inconsistency, not a product defect. Product files and accepted test results are unchanged. Tests were inspected, not rerun. The new recorder/controller remains unimplemented or under preparation, disabled until independent implementation review and storage/build acceptance. L04 remains unverified.
