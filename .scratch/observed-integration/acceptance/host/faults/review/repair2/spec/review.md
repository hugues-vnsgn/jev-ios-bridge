# Ticket09 repair2 Spec: PASS for the scoped repairs

Candidate `d0c24bbbef7961a9377d6338fcff140e7373244e`; exact parent `08a985805cb442a2404eb9561ae92f69748ae5e0`. Both final P2 findings are closed; no remaining Spec finding in these repairs. Six earlier closures are preserved.

- **Complete dispatch oracle restored.** `tests/observed-public-races.test.ts:82–85,103–107,125,200` now compares the complete call sequence through actual owner exit. Only explicitly already-authorized create/touch can extend the captured prefix. `tests/observed-crash.test.ts:119,125,135,140` rejects additional calls during cancellation, late settlement, retrieval and exit. The sole producer change records window attempts immediately before the identical rejection.
- **Early signal evidence is current.** `tests/fixtures/observed-host/early-cli.ts:17–42` synchronously records each delegated source/runner/window attempt and actual process exit. `tests/observed-public-races.test.ts:169–187` validates complete records, captured-prefix equality, exit143 and no error records after real owner exit. The stale calls.json oracle is removed. Production owns cancellation/termination; no lifecycle or reply is synthesized.

These satisfy admission-decision:149–151 and public-contract:77 without weakening already-authorized work semantics. All10 commit/current/frozen paths match before/after; exactly6 changed paths,107 protected unchanged plus the authorized window trace.396 stable IDs remain distinct from193 executions. All8 runtime hashes match every gate's before/after mapping.

Read-only evidence checks:30765 regular-file hashes and25 symlink targets verified without following symlinks;84 corrected records (42/runtime), complete traces and actual exit receipts inspected. Original08 BLOCKED reports and lost3176raw/missing48audit remain distinct; no old evidence reconstructed.

**Overall gate remains BLOCKED.** Actual added suites pass193/193 both runtimes. Exact24 default check passes1668/1668 plus typecheck/build. Both Node26 default checks fail1667/1668 solely at unchanged boot-poll test:392 (expected2/actual1); typecheck passes, build is not reached. Root owns separate fixture diagnosis. No product defect inferred; no fallback or budget relaxation accepted.

No tests/build/store/device/network operations performed by this review. This is source/oracle closure, not whole09, H-row, live or ticket12 acceptance.
