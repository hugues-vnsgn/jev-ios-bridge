# Ticket 03 allocation-store verification

Verdict: PASS for the ticket's store seam, pending Root's independent review. Broader public-interface and live acceptance remains UNVERIFIED.

Base: dc31c577a30b2aca0c8638f03420fd05b611dce7. Worktree: /Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocation-store. Branch: feat/observed-allocation-store.

Oracle: accepted allocation, admission and public contracts linked by ticket 03. Tests cross Admission and its module-owned reservation/claim/session interfaces, use temporary real SQLite stores and fake effects. Child processes use isolated stores and a key-free environment. No live devices, production store, real migration, app sources, credentials or protected claims were accessed.

| Matrix row | Cases and expected result | Evidence | Result |
| --- | --- | --- | --- |
| H03 identity/read/transfer | Immutable global action/preparation/source binding; duplicate reads preserve database bytes; parked preparation process exits; two independent consumers yield one driver/effect; active-owner listing is non-mutating | coverage-green.log, process-park-green.log | PASS |
| H04 reservation/budget/exclusion | Count/bytes limit at allocations eight/nine; concurrent identity and capacity reservation; artifact/free-space boundaries; both create/supplied sources; four protected UUIDs; retained-success exclusion | coverage-green.log | PASS |
| H04 unknown creation | Guard committed before fake create; malformed, uncertain and protected-device collision receipts retain guard/capacity; guard rejects new legacy/supplied/ready work; existing owner still operates; receipt write failure closes local reservation | coverage-green.log, creation-revocation-red.log, creation-revocation-green.log | PASS |
| H05 cancellation/TTL | Real ready/cancel and TTL/start process races; reserved cancellation; action cancellation while tap pending; no later dispatch; late settlement cannot promote terminal or known flags | coverage-green.log | PASS |
| H06 crash/fencing/authority | 16 real SIGKILL milestones before/after reservation, create authorization/receipt, admission, park, consume, terminal and export commits; recovery requires expected abandoned owner; duplicate admission preserves live owner | coverage-green.log, resume-red.log, resume-green.log | PASS |
| H07 evidence/fail closed | Persisted nullable flags, idempotent capture counts, running/finalizing/terminal separation, immutable terminal plus separate export failure/recovery; failed capture/terminal writes revoke local capabilities | coverage-green.log, local-revocation-red.log, local-revocation-green.log, evidence-revocation-red.log, evidence-revocation-green.log | PASS |
| Dependency blast radius | All admission-core and offline-migration tests, including storage fault/permissions/alias/history preservation, plus allocation tests | coverage-green.log, node24-green.log | PASS |
| Compilation | Typecheck and package build | typecheck-final.log, build-final.log | PASS |

## Suite results

Node 26.8.1: 134 passed, 0 failed, 0 skipped; 20.83 seconds with coverage. Exact Node 24.0.0: 134 passed, 0 failed, 0 skipped; 20.06 seconds. Both commands exit 0. Typecheck/build exit 0.

Changed-file line/branch coverage: admission-allocation.ts 100%/100%; admission-sqlite.ts 97.46%/89.74%; admission.ts 98.63%/89.68%. Remaining uncovered new branches are defensive malformed-record checksum rejection, known-device admission collision after reservation, imported action projection, export before a committed action, and identity collision with an existing non-allocation attempt. Existing core/migration suites cover corrupt store refusal, protected/imported identity retention and prior admission behavior; these percentages do not certify downstream runtime behavior.

## Commands and evidence

- `node --import tsx --experimental-test-coverage --test-coverage-include='**/src/device/admission*.ts' --test tests/admission-core.test.ts tests/admission-migration.test.ts tests/admission-allocation.test.ts` → `coverage-green.log`.
- `npx --yes --package=node@24.0.0 node --import tsx --test tests/admission-core.test.ts tests/admission-migration.test.ts tests/admission-allocation.test.ts` → `node24-green.log`.
- `npm run typecheck` → `typecheck-final.log`; `npm run build` → `build-final.log`.
- Initial predecessor red/green logs copied unchanged from `/tmp/jev-allocation-*.log` into this directory. They cover the earlier reservation/create/park/cancel TDD slices.
- `resume-red.log` reproduces duplicate preparation admission and inconsistent success publication; `resume-green.log` proves both repairs.
- `park-deadline-red.log` / `park-deadline-green.log`: settled preparation cannot park after its overall deadline.
- `active-list-red.log` / `active-list-green.log`: startup discovery through a read-only interface, with explicit separate recovery.
- `process-park-red.log` exposed the old test-fixture mismatch; `process-park-green.log` verifies a real preparer child exits after parking.
- `node24.log` and `coverage-final.log` preserve a caught regression: duplicate create rejection unnecessarily revoked a valid reservation. `creation-regression-green.log` verifies duplicate rejection and storage-failure revocation together; final runtime logs supersede those failed runs.
- `typecheck.log` preserves the initial fixture optional-property error; final typecheck omits the absent optional clock field and passes.

## Exported interface for 05/06/07

`Admission.reserveAllocation(input)` returns a module-owned `AllocationReservation`, immutable duplicate record, or refusal. Validate/canonicalize preparation requests, then call `readAllocationForAction(actionId)` before current configuration, artifact, source or device probes when retrieving an existing preparation. Reservation captures config digest, effective budgets, source and inspected content. Runtime validation and physical free-space rechecks belong to the allocator/adapters.

`AllocationReservation`: `identity`, initial `snapshot`, `stage(StagedArtifact)`, `create(effect)`, `admit()`, `fail(reason, evidenceRefs?)`. Creation authorizes and commits its guard synchronously before invoking the effect; accepted receipt binds one canonical UUID. `admit()` returns `PreparationClaim`.

`PreparationClaim`: inherited `bindDriver(backend)`, `cancel()`, `finalize(candidate)` plus `park(readinessEvidence, evidenceRefs?)`. Dispatch kinds `boot`, `install`, `launch`, `readiness` journal the preparation stages. The driver must await actual underlying settlement, interpret acknowledgments, and complete local cleanup before park; park synchronously revokes the preparation handle and commits attachment removal/TTL. Remove the parked job from process-owned active jobs.

`Admission.consumeAllocation(ActionBinding)` atomically binds the first action request/digest, transfers parked token/generation, and returns one `ObservedClaim` with one fresh attachment. Exact duplicates retrieve. `ObservedClaim` adds `recordObservation(refs)`, `recordActionReceipt({actionAttempted,actionAcknowledged})`, `beginFinalization()`. Observed UI input uses dispatch kind `tap`; ordinary legacy multi-step actions remain a separate driver concern. Receipt/progress failures close the local action handle; finalization remains callable for conservative quarantine.

`Admission.readAllocation(id)`, `readAllocationForAction(id)`, `readAction(id)`, `listActiveAllocations(): AllocationRecord[]` are non-mutating. The listing returns only preparing/executing records, including durable owner identity and current flags; it does not infer liveness. `cancelAllocation(id)` and `retireAllocation(id)` never operate a device. `quarantineAbandonedAllocation(expected: AllocationOwner)` is explicit expected-owner recovery, conditional on positive dead-owner evidence; parked records cannot be recovered as active jobs. `cancel({kind:'observed',id})` orders action cancellation against dispatch.

`claim.finalize(TerminalCandidate)` commits attempt terminal and allocation/device disposition together. An observed success payload must identify `outcome_observed` with true/true flags, or `already_satisfied` with false/false flags, null reason and durable observation evidence. `recordActionExport(actionId,{status:'complete',terminal}|{status:'failed'})` changes only export metadata; committed outcome stays immutable. `readAction` resolves the allocation, attempt terminal and current admission in one read transaction, and also returns imported historical records.

No downstream SQL, general release method, unknown-creation clearing, automatic replay or retained-device reuse is exported.

## Limits and handoff

- Schema version is now 2. Unknown/older initialized schemas fail closed; no production migration or automatic schema upgrade was attempted. Root's planned offline activation creates the integrated schema.
- The store trusts typed driver/adaptor receipts and evidence pointers; it does not inspect apps, evaluate visible predicates, write image files, or certify native release. Those are downstream responsibilities.
- Stage-specific deadlines, free-space rechecks, request canonical hashing, app compatibility, readiness polling and actual command acknowledgment interpretation belong to 04/05/06/07. This ticket persists their bindings and provides durable permission transitions.
- Minimum-runtime and host seam checks do not substitute for installed public CLI/MCP gates or live acceptance. Root will run the integrated full suite; unrelated tests were not run here.
- Simplify was unavailable; it was not run. Root supplies independent Standards and Spec reviews. Shared planning/journal documents were not edited because ticket ownership permits only its own comments/status.
- Evidence intentionally remains untracked and visible at Root's request. Only six owned product/test/ticket files belong in the focused commit.
