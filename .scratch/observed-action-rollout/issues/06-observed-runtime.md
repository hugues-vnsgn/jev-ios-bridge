# 06 — Implement shared observed lifecycle and authoritative evidence

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 04, 05
Owner: Observed-runtime implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, codebase-design, use-git-worktree
Expected commit: `feat: add authoritative observed-action lifecycle`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Seam](../../observed-integration/evidence/seam-decision.md), [public contract](../../observed-integration/evidence/public-contract.md), [admission](../../observed-integration/evidence/admission-decision.md): resolver/terminal rules.

## Write ownership

Allowed writes: `src/observed/service.ts`; `src/observed/schema.ts`; `src/observed/report.ts`; `src/observed/evidence.ts`; `src/experimental/observed-journal.ts`; `src/experimental/observed-tap.ts`; `src/experimental/observed-run.ts`; `spikes/observed-ui/cli.ts`; `tests/observed-service.test.ts`; `tests/observed-schema.test.ts`; `tests/observed-evidence.test.ts`; `tests/observed-journal.test.ts`; `tests/observed-tap.test.ts`; `tests/observed-run.test.ts`; this issue's Status and Comments only.

Protected shared files: `src/device/**`; `src/observed/allocation*.ts`; `src/observed/create-source.ts`; `src/observed/supplied-source.ts`; `src/observed/artifact.ts`; `src/cli.ts`; `src/mcp/**`; `src/service.ts`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement strict action schema/canonical digest, shared service start/inspect/wait/cancel/close and durable authoritative renderer with injected integrated store/session and allocator interface. One consume/start, fresh guards, bounded polling/finalization; preserve four outcomes and nullable crash flags. Persist private absolute evidence and provisional versus postcommit terminal export; postcommit export failure cannot rewrite terminal. Adapt historical journal/runner/spike to the same resolver; raw-device execution requires a bound prepared allocation or safe migration-required refusal. Do not independently prepare or relaunch. Allocator interface is structural/injected, so 07 runs disjointly.

## Acceptance and stop criteria

H01/H03/H05/H06/H07/H08 lifecycle subsets: repeated start retrieval/conflict, read invariance, no tap for already-satisfied/refused, one tap under reply loss/stale/late cancel, restart never replays, no provisional success authority, exports reflect committed records, imported records remain read-only. Targeted observed tests and typecheck.

Completion: Both adapters can use one service implementation; imported/spike paths cannot bypass admission. Return allocator injection requirements to Root for integration with 07. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

### Execution and case matrix — 2026-10-08

Root dispatched implementation at `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181` in the clean linked `feat/observed-runtime` worktree. Execution: implementing. Cook uses the reviewed handoff and authorized autonomous progression; TDD exercises the shared service with real isolated admission and explicitly fake driver dependencies. No production/device/secret operations. Simplify is unavailable; Root supplies independent review.

| Cases | Host rows | Expected surface |
| --- | --- | --- |
| Strict version/fields/size/defaults/UUID/digest; changed bound input | H01/H03 | Safe operation errors, immutable request identity, zero effects |
| One start; identical/concurrent retrieval; retained-device/cross-device exclusions | H03/H05/H08 | One consumed claim and one input; committed resolver |
| Fresh guards, already-satisfied, unmet/ambiguous/invalid/stale/unsupported target | H01/H05 | Four honest outcomes, no input on refusal |
| Lost reply, deadline, early/late/cross-process cancellation, abort-ignoring backend | H05/H06 | At most one input, no later dispatch/promotion, nullable crash flags |
| Read/wait invariance; abort wait; unavailable owner/recovery/imported action | H03/H06/H08 | Consistent non-mutating read, no replay/adoption, live owner preserved |
| Request/capture/provisional persistence faults; finalization before/after commit; export failure | H06/H07 | No provisional success authority; committed result independent of export |
| Historical journal/run/tap/spike adaptation and raw-device refusal | H01/H03/H08 | Shared resolver, prepared allocation only, no prepare/relaunch |

Final checks: focused observed suites on Node 26 and exact Node 24, typecheck/build/full check, changed-module coverage, zero skipped assertions, final source/test blob manifest. Raw evidence is private and untracked under the runtime acceptance directory.

### Root fixture and behavior authorization — 2026-10-08

Read-only readiness identified old tests requiring mutating journal reads, healthy-owner quarantine, retained-device reuse and cross-device action-ID reuse. These behaviors conflict with the accepted public/admission/allocation contracts. The runtime owner may update its owned journal/runner/tap tests to assert non-mutating reads, global immutable action identity, retained-device exclusion and bound ready-allocation consumption. Preserve equivalent uncertainty, provisional-evidence, one-input and restart assertions; do not weaken or skip them. Existing golden files remain protected. Ticket05 owns the preceding isolated-store conversion of `observed-touch-integration.test.ts`; any later repair there returns to Root.

All runtime fixtures use explicit isolated admission stores and fake backends. No test may infer production storage from a lock/evidence root or operate a real device. The integrated store and driver interfaces govern implementation; request any missing capability from Root instead of writing shared device files.

### Root fixture ownership transfer — 2026-10-08

Root authorized fixture-only edits to `tests/admission-migration.test.ts`: replace retired raw-root journal writer calls with a local direct historical-disk fixture, preserving all existing formats, assertions and case counts. Completed, in-flight and uncertain fixture records were compared against the original writer before retirement; correspondence evidence is `runtime/historical-correspondence.log` (random claim tokens normalized). No migration/store source changes. Full migration suite joins both Node-version gates.

### Source handoff — 2026-10-08

Execution: source-complete; stopped for Root’s independent review. Original dispatch base `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181`; Root safely advanced the preserved worktree to accepted dependency base `98f7de41baa316f47a65a7bc2160128a72051f3e` before final gates. One focused implementation commit follows; its full SHA is recorded in the private `runtime/report.md` and implementer response.

The shared `ObservedActionService` owns start/inspect/wait/cancel/close and delegates allocator preparation/read/cancel/retire rendering unchanged through the agreed structural interface. Only a consumed full immutable `ActionBinding` attaches. Identical/retrieved/refused paths never attach or probe. The explicit `enabled:true` dependency is required for preparation/start; the spike uses exactly `JEV_EXPERIMENTAL_OBSERVED=1`. Reads/cancellation/retirement remain available with enablement off.

Construction, retrieval, inspection and waiting are non-mutating; owner recovery is the separate explicit `recoverAbandoned()` operation, fenced by the stored expected token/generation and independent store liveness verification. `readAction` supplies the only terminal authority. Local failed-finalization diagnostics cannot override a verified committed result. Nullable receipts preserve interrupted authorization. Evidence files are private absolute immutable projections; provisional success cannot publish an outcome, and export failure cannot rewrite a committed result.

Shutdown synchronously revokes/cancels/aborts every locally owned action, invokes allocator close immediately, then concurrently bounds both groups at 5000ms. Parked preparation is outside action ownership. The injected Admission capability remains usable: it has no public close method, and bounded SQLite connection lifetime stays inside each accepted store operation. Structural allocator methods remain `prepare(raw)`, `get(id,{waitMs?,signal?})`, `cancel(id)`, `retire(id)`, synchronous `consume(fullBinding)`, and memoized `close()`; allocation wire rendering belongs to ticket07.

Historical journal writes are retired, the journal reads through the shared resolver, and the original experimental request spelling resolves only matching prepared bindings/imported read-only identities. No raw-device adoption or independent preparation/relaunch is present. The authorized migration fixture replacement preserves all 43 cases and assertions; completed/in-flight/uncertain correspondence was captured before retiring the original writer.

Final gates after the last test edit: Node26.8.1 focused 126/126; exact Node24.0.0 focused 126/126; `npm run check` 1258/1258 plus typecheck/build; strict standalone spike typecheck; coverage 126/126, 98.77% lines / 90.32% branches across changed product modules; all exits0 and skips0. Final SHA256/git-blob audit verified all15 source/test files unchanged through these gates. Raw command/exit/count evidence and final source manifests are private under `.scratch/observed-integration/acceptance/host/runtime/`.

The original exact24 focused run was 125/126 because a child’s known SQLite ExperimentalWarning preceded its JSON stderr; that harness failure and its tested mapping are retained separately. Only the child fixture warning handling changed, with strict JSON/error/no-effects assertions preserved. The earlier manifest had already been updated when Root requested immutable pre-fix preservation, so its exact old blob mapping was reconstructed by reversing that one edit; provenance is explicit, not claimed as untouched preservation. No product/test edits followed the new pin.

Limits: bounded fake host behavior only. Enabled spike production-store composition and live devices are unexecuted; the disabled spike gate and its delegated ready/imported/refusal lifecycle are covered. Source-map uncovered service line93 is a closing brace; uncovered spike11–12/19–23/26 contains usage/production/error-composition glue, reviewed without production execution. Shared 07/08 integration, packed/plugin/live acceptance and independent review remain Root-owned. Simplify is unavailable and was not run. No production store/backend/device/secret operations or protected claim changes occurred in this implementation.

### Root-authorized Spec repair handoff — 2026-10-08

Execution: source-complete; stopped again for independent re-review. Root authorized only three reproduced findings on original frozen `c751a73df7931107af23619c350d2ca406ac55db`: P1 local cancellation revocation before an initial authoritative read, P2 separate observation/finalization deadlines with explicit cancellation retained, P3 persisted blocker evidence directory on host-creation refusal. Repair writes only service.ts, its owned service test and these Comments. Full repair SHA is recorded in private `runtime/repair/report.md` and implementer response; accepted dependency base remains `98f7de41baa316f47a65a7bc2160128a72051f3e`.

P1 now validates then synchronously revokes/aborts an existing owned job before awaiting authoritative inspection. Unavailable reads cannot allow a pending capture to authorize input, nor invent durable cancellation or terminal authority. P2 preserves observation success through confirmed bounded local close, while both local controller and fresh durable cancellation remain checked through provisional persistence. Failed cancel writes during prolonged close/provisional persistence leave the markerfalse until a verified accepted03 jointfinalize commits cancellation and CANCELLED/quarantine; initial-read/unconfirmed-finalization leaves unresolved/null authority. The separate5000ms close/evidence budget and nullable crash flags remain conservative. P3 verifies the blocker’s actual persisted allocation identity/guard/absolute directory through Admission.readAllocation, returning that pointer or safe STORE_UNAVAILABLE with no attachment/binding/guard/capacity mutation. No allocation/store/device API changed.

Original candidate files/manifests/logs and independent probes were preserved before edits in private `runtime/repair/`. All three independent and own service regressions were genuine red→green; additional original-source failed-write/provisional regression retained. Two fixture diagnostics are explicitly separated: legitimate jointfinalize commits a previously local cancellation marker, and the old synthetic nonexistent blocker now uses a real persisted unknown creator. Assertions/case counts were preserved and strengthened; no timeout/skip weakening.

Final distinct repair15-file manifest pinned before unchanged sequential gates: affected25/25 on Node26.8.1/exact24.0.0; complete06focused136/136 each; npmcheck1268/1268 plus typecheck/build; coverage136/136 (98.93%lines /91.48%branches; repairedservice100%lines /92.63%branches); standalone strict spikecompile/diffcheck/hash audit pass. All exits0/skips0 and15/15 blobs unchanged after every gate. Original43 migration cases remain preserved. Only the two allowed product/test blobs differ from c751. Large window released immediately after gates, before this metadata.

Original Node24 warning harness125/126 and reconstructed pre-warning manifest provenance remain explicitly retained; no warning fixture edits in repair. Enabled spike production composition remains unexecuted. Simplify unavailable; independent reviews remain pending. No real backend/device/production store/secrets or protected-source operations, and no unresolved repair blocker.
