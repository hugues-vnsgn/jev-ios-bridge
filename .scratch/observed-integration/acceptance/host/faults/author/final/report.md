# Ticket09 host-fault candidate

## Outcome

PASS for the mapped isolated host assertions. Complete Root H01–H09/live acceptance remains UNVERIFIED. No product defect or protected fix is pending. Candidate: `08a985805cb442a2404eb9561ae92f69748ae5e0`; exact parent/base: `75d7618167729b9b9a5547eaa468e37eb12b2504`. Original dispatch base: `d0f49f6c12cbaffb4c034217b7e25b96c52c6cb2`. Branch `feat/observed-host-faults`; no merge/push/publish.

## Files

- `.scratch/observed-action-rollout/issues/09-host-fault-suite.md`
- `tests/fixtures/observed-host/early-cli.ts`
- `tests/fixtures/observed-host/case-matrix.json`
- `tests/fixtures/observed-host/allocator-public.ts`
- `tests/fixtures/observed-host/owner.ts`
- `tests/fixtures/observed-host/harness.ts`
- `tests/observed-host-fault.test.ts`
- `tests/observed-public-races.test.ts`
- `tests/observed-crash.test.ts`

## Final checks

All command records/logs are under this private directory. Test processes/children use umask0022; evidence uses0077. TYPESAFE_API_KEY/NODE_OPTIONS/NODE_NO_WARNINGS removed without printing values; exact24 PATH pinned; no warning suppression.

| Command record | Runtime | Exit | Tests/pass/fail/skip | Included phases |
| --- | --- | --- | --- | --- |
| added-final-node26.json | v26.8.1 | 0 | 193/193/0/0 | Three complete added suites |
| added-final-node24.json | v24.0.0 | 0 | 193/193/0/0 | Three complete added suites |
| full-check-node26.json | v26.8.1 | 0 | 1668/1668/0/0 | Actual default npm run check: typecheck/tests/build |
| full-check-node24.json | v24.0.0 | 0 | 1668/1668/0/0 | Actual default npm run check: typecheck/tests/build |

No cancelled/todo tests, no skips, no timing failure or serial fallback. Final added runtime bytes associate with `owned-final-gate-freeze.json`; report-only matrix evidence metadata was frozen before full checks in `owned-before-full-check-freeze.json`; final issue metadata delta only is in `owned-final-candidate-freeze.json`. All108 protected mappings remain identical to advanced base (`protected-final-freeze.json`). Root accepted changes relative to original base are admission-maintenance.ts canonical entry identity, new maintenance-entry tests, and exact Node24 SQLite-notice handling in integration-edge.test.ts; original protected freeze is preserved, not claimed unchanged across dependency advance.

All19 recorded gate attempts, exact commands/exits/durations/counts/log paths: `commands-summary.json`. Earlier bounded probes whose raw logs were not captured are explicitly summarized in `first-failures.txt`; they are supplemental, not substituted for final gates.

## Case mapping

Original362 stable inventory IDs preserved;34 added IDs =>396 final inventory rows. This is distinct from193 executed tests per runtime (original178 plus15). Every row has exact test/assertion locations, test source SHA256, verdict scope and both-runtime raw log/command/fixture archive associations. `artifact-index-node26.json` and `artifact-index-node24.json` each index193 named raw fixture sets. No aggregate test count is treated as per-row proof.

| Host row | Inventory IDs | Mapped assertions |
| --- | --- | --- |
| H01 | 123 | Exact errors; pristine reservation bytes; IDs/paths/guards/UTF8/timeouts |
| H02 | 26 | Seven operations/outcomes; genuine flags; envelopes/exit/isError; no key/network |
| H03 | 27 | CLI/MCP concurrency/conflict; digest/alias identity; parked transfer; legacy exclusions |
| H04 | 90 | Capacity/held bytes; exact receipt/artifact/runtime/storage negatives and phase dispatch counts |
| H05 | 56 | Durable cancellation/signals/TTL/races; real stopped waits/SDK suppression; no replay |
| H06 | 35 | Genuine owner kills; null flags; COMMIT/export faults; explicit recovery; late replies/stale tokens |
| H07 | 20 | Real missing/corrupt/unknown/readonly isolated stores; injected full; exports; healthy read invariance |
| H08 | 19 | Isolated conservative migration/source invariance; read-only IDs; declarations/aliases/raw bypass |

Exact mapping: owned `tests/fixtures/observed-host/case-matrix.json`. Six independent proof gaps and closure assertions/raws: `six-family-closure.json`; original audit `/tmp/jev-ticket09-spec-completeness-esc18h5n/review.md`. F1 exact negative/disposition/counts; F2 actual MCP concurrent prepare/start/conflict/digest; F3 delegated public wait settles WAIT_CANCELLED before owner release, actual aborted signal and synchronized SDK suppression; F4 actual MCP0/true/yes/empty calls/listing; F5 exact parser codes/global pristine bytes/absent12 vs13; F6 both-volume thresholds and precreate/preinstall depletion. Independent static closure is supplemental; final candidate reviews remain Root-owned.

## Preserved failures and limits

- Initial full178 run:168pass/10fail/0skip, original oracle/source at `added-node26-first-source/`, raw `added-node26-first.log`, command/archive record retained. Four legacy/supplied error-oracle mismatches, four public TTL-code mismatches, one alive-MCP/fresh-owner-state synchronization mismatch, one partial JSONL reader race. These were fixture/oracle/proof defects, not product reds. Typecheck's two owned fixture typing errors and correction logs remain. All pre-audit source and earlier green associations remain distinct; old178 greens cannot certify the six closures.
- Initial ordinal tap barrier was wrong; semantic durable null action-authorization flag now gates the actual owner. First ordinal failure/transcribed evidence remains in `first-failures.txt`; no reconstructed raw trace is claimed.
- Startup STORE_UNAVAILABLE wrapper is fixture composition parity only; unchanged production mapping is src/observed/cli.ts:84–87. First genuine missing-store fixture failure/corrected attempts and wrapper bytes are retained separately.
- SQLITE_FULL is injected at the accepted transaction fault hook, not a physically full filesystem. Readonly is actual isolated mode500 directory. No real Admission.open store or migration activation.
- Original transient partial JSONL bytes were not captured. Raw failure/completed archive retained; future nonempty partial snapshots are saved, malformed complete records fail, and final traces must be complete after all owners exit before effect counts are certified.
- Root aliases, conservative migration and stale/duplicate finalization adjuncts use isolated primitives; they do not substitute for genuine CLI/MCP owner kill proofs. Historical live-claim rows prove migration refusal before public authority exists, with explicit transport inapplicability, not skipped public calls.
- The signal wall bound remains6500ms around production5000ms finalization. Ready-commit signal delivery may yield0 or130/143; durable parked ownership is the oracle. Migration declarations do not fence external/old writers. Backend work already issued is counted separately from forbidden successor calls.
- No secrets/.env/device/store/SDK judgment/native-contact/release/live transport/publication claim. No source or producer edits. Applied skills: do-test, diagnosing-bugs, use-git-worktree and relevant Cook/TDD execution workflow. Root owns independent review/integration/host/live acceptance.
