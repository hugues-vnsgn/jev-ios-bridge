# Ticket06 runtime test and source handoff — 2026-10-08

**Outcome: PASS for bounded host behavior. do-test verdict: SHIP within this scope; independent review pending.**

Candidate: `c751a73df7931107af23619c350d2ca406ac55db` (one focused commit). Dispatch base: `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181`. Accepted dependency base: `98f7de41baa316f47a65a7bc2160128a72051f3e`.
Worktree: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime`; branch `feat/observed-runtime`; linked git-dir `/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.git/worktrees/feat-observed-runtime`.
Oracle: ticket06 and accepted public/seam/admission/allocation decisions, ADR0002/0005/0007/0008/0009. Cook/TDD/codebase-design/worktree/do-test/diagnosing-bugs applied. Simplify unavailable; Root supplies independent review.

## Changed files

- `src/observed/service.ts`, `schema.ts`, `report.ts`, `evidence.ts`.
- `src/experimental/observed-journal.ts`, `observed-tap.ts`, `observed-run.ts`; `spikes/observed-ui/cli.ts`.
- `tests/observed-service.test.ts`, `observed-schema.test.ts`, `observed-evidence.test.ts`, `observed-journal.test.ts`, `observed-tap.test.ts`, `observed-run.test.ts`.
- Root-authorized fixture-only `tests/admission-migration.test.ts`; own ticket06 Comments.

No device/admission/allocator/public/shared source or goldens changed. The migration fixture transfer replaces only production-writer fixture calls and adds its local fixture helper; all43 assertions/cases/aliases and historical record formats remain.

## Matrix and evidence

| Rows | Scenario / expected | Surface checked | Verdict / evidence |
| --- | --- | --- | --- |
| H01/H03 | Strict version, fields, 64KiB, selector/guard bounds, uppercase UUID, default-filled recursively canonical immutable digest | Safe errors, frozen independent request, digest equality/conflict | PASS; schema19 cases, final focused logs |
| H03/H05/H08 | Consume once; concurrent duplicate/retrieval; changed full binding; retained inventory/global identity exclusion | Store binding/state, zero additional attach/probe/input | PASS; service51 cases, full-binding red/green and final focused |
| H01/H05 | Fresh guards; already-satisfied/unmet/ambiguous/disabled/unsupported/expired target; exactly one touch and fresh captures | Four outcomes, receipt flags, command args/count, durable observations | PASS; final focused; capture-policy-green.log |
| H05/H06 | Lost reply, local/external/deadline cancellation, abort-ignoring capture/input, cancelled write, late receipt | Null crash flags, quarantine, same retained lease, no late dispatch/promotion | PASS; cancel-write-red/green.log, final focused |
| H03/H06/H08 | Non-mutating construction/retrieval/wait, abort wait, healthy/dead owners, explicit recovery, imported records | SQLite/source byte invariance, exact owner capability, no replay | PASS; final focused + migration43 cases on both nodes |
| H06/H07 | Evidence faults; begin-finalization / before-/after-COMMIT uncertainty; provisional success; export failure | Immutable committed authority, unresolved/null outcome, private artifacts, export metadata | PASS; finalization-red/green.log, renderer-validation-red/green.log, final focused |
| H01/H03/H08 | Historical writer retirement, original request spelling, matching ready allocation, imported resolver, raw-device refusal | Shared lifecycle, no preparation/relaunch/adoption | PASS; historical-raw-red.log / historical-green.log / final focused |
| H01/H08 | Approved spike gate off | Child strict JSON error, no stdout/store open/device effect | PASS; warning-handling fixture correction, both final focused |

Test counts: service51 + schema19 + evidence4 + journal1 + runner4 + executor4 + migration43 =126. No skipped/todo/cancelled assertions.

## Final gates

All commands ran under parent0077, child0022, after the last test edit; exact commands/exits/durations are in the adjacent JSON/log pairs.

| Gate | Result | Raw evidence |
| --- | --- | --- |
| Node26.8.1 focused: `node --import tsx --test --test-concurrency=1` and all seven named suites |126/126, exit0, skips0,29.34s | focused-final-node26.log / .json |
| Exact Node24.0.0 focused: pinned `/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node` with same arguments |126/126, exit0, skips0,29.73s | focused-final-node24.log / .json |
| `npm run check` |1258/1258, exit0, skips0; typecheck + build pass;47.48s | full-check-final.log / .json |
| Strict standalone spike TypeScript check |exit0,0.21s | spike-typecheck-final.log / .json |
| Final coverage: same126 suites, `--experimental-test-coverage` + changed runtime/spike includes |126/126, exit0, skips0;98.77%lines /90.32%branches;29.97s | coverage-final.log / .json |
| `git diff --check`; SHA256 and git blob audit |exit0;15/15 unchanged source/test blobs | diff-check-final.log / final-hash-check.json / final-source.json |

Coverage audit: the mapped service uncovered line93 is a closing brace. Spike75%lines/33.33%branches has uncovered11–12/19–23/26: usage, enabled production-store composition and generic error glue. Those lines were inspected and spike separately typechecked; enabled production operations are intentionally outside authorized host execution. All changed product files are included in aggregate coverage. Source-map percentages supplement the explicit matrix and do not certify live behavior.

## Genuine red/green and diagnostics

- Schema immutable snapshot:18/19→19/19 (`schema-red/green.log`).
- Retired raw-root writer:0/1→1/1 (`historical-raw-red.log`, final journal case).
- Executor bound-allocation refusal:2/4→4/4 (`tap-boundary-red/green.log`).
- Begin-finalization failed close:2/3→strict passing reproduction (`finalization-red/green.log`).
- Full canonical payload mismatch:0/1→1/1 (`full-binding-red/green.log`).
- Cancel-write failure allowed a later touch→only the original capture (`cancel-write-red/green.log`).
- Disabled preparation delegation, synchronous shutdown ordering, cancellation during provisional persistence, renderer validation, attachment reason: corresponding `*-red/green.log` and final cases.
- Private absolute screenshot source:3/4→4/4 (`evidence-red/green.log`).

The initial service root-fixture and fake runner operation-classification failures are harness diagnostics, not product red/green proof. Some early filenames contain “green” despite a failing diagnostic run; their contents remain raw, and no final claim derives from those names.

The first exact24 full-focused run was125/126: its spike child stderr included Node24’s SQLite ExperimentalWarning. This proves a fixture warning-handling issue, not a store-open/finalization regression. Original logs and exact tested mapping are retained as `focused-node24-warning-red.*`, `focused-node26-before-warning-fix.*`, `source-before-warning-fixture.json`; the one-line fixture change is `warning-fixture.patch`. The fixture now suppresses precisely the ExperimentalWarning class and keeps strict JSON/error assertions. The original manifest had already been repinned before Root requested immutable pre-fix preservation; its exact old mapping was reconstructed by reversing the sole known edit. `manifest-provenance.txt` documents that distinction. New final filenames and all complete reruns use the frozen new mapping.

Completed/in-flight/uncertain fixture correspondence against the original historical writer was captured before retirement in `historical-correspondence.log`: identical names/records/modes, random claim token normalized. The migration suite retains43 cases in both final node runs.

## Interface handoff and limits

`ObservedActionService<Result>` takes explicit borrowed Admission, runsDir, bridgeVersion, backend, createDriver, optional allocator/evidence/liveness and explicit enabled:true for start/preparation. No hidden environment gate. Public module methods: start, inspect(waitMs0–45000/signal), cancel, close; allocation delegation prepareAllocation/getAllocation/cancelAllocation/retireAllocation preserves allocator rendering. Structural allocator: prepare(raw),get(id,{waitMs?,signal?}),cancel(id),retire(id),consume(fullActionBinding) sync,close memoized. Ticket07 owns lifecycle projections.

Wire snapshot: `ObservedActionSnapshotV1` (`ObservedActionSnapshot` alias). Schema: `ObservedActionRequest`, parseObservedAction, observedActionRequestSchema, ObservedOperationError.toJSON. Renderer/exit/summary: renderObservedAction, observedActionExitCode, observedActionSummary. Production observedDriverFactory fixes full screenshots, fresh post-input capture, no action-capture reuse/agreement fallback and no app stop.

Construction/reads/retrieval never recover. Explicit recoverAbandoned passes stored exact token/generation after conservative liveness; store independently verifies death. Only consistent readAction establishes committed authority. A local failed-finalize diagnostic cannot override a fresh committed terminal. Postcommit export failure cannot rewrite outcome/disposition.

close synchronously revokes/cancels/aborts owned action gates and immediately invokes allocator.close, then bounds both groups concurrently5000ms. Parked preparations remain outside action jobs. Admission has no public close API and remains usable after module shutdown; its SQLite connection lifetime is internally bounded per operation.

No outstanding ownership/interface blocker for this bounded implementation. Root07/08 integration, independent reviews, packed/plugin and live acceptance remain pending. No real backend/device/production store/.env/key/app operations, merges/publishing, protected claim cleanup or investigation occurred. This work does not resolve or certify side effects from the earlier old-constructor incident.
