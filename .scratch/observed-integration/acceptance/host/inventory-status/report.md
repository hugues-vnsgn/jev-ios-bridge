# Selected inventory availability — author handoff

Outcome: PASS for bounded host checks; independent review and integration pending.
Base: `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181`.
Candidate: `b53a184df02f9c87dac5faa0a4b271b8186efe7d`.
Author: Root. Worktree: `feat-observed-inventory-status`.
Write set: `src/device/index.ts`, `tests/admission-driver.test.ts`.

The typed preparation driver exposes `inventoryStatus(signal, timeoutMs?)`, returning selected `{state, isAvailable}` or undefined when absent. It lists only through the existing admitted vendor dispatch. UUID/state validation remains in the common envelope parser; a private additional validator requires one unambiguous selected identity and boolean availability before successful or error-receipt settlement. No direct command, legacy listing behavior, allocation lifecycle or store interface changes.

## Evidence

| Check | Result | Raw evidence |
| --- | --- | --- |
| Missing capability red / valid selected availability green | 0/1 then 1/1; first red is missing method, not a malformed-payload reproduction | availability-red.log / availability-green.log |
| Malformed inventory error receipt red / green | Receipt initially acknowledged despite missing availability; after correction unconfirmed, no later boot, retained lease | error-receipt-red.log / error-receipt-green.log |
| Final Node26 full check | 1208/1208, zero skips, typecheck/build, exit0 | full-check-serial.log and JSON |
| Final exact Node24 combined16 suites | 422/422, zero skips, exit0 | node24-serial.log and JSON |
| Two unchanged allocation race cases isolated | 2/2 each Node26/exact24, zero skips | allocation-race-isolated-node26.log / allocation-race-isolated-node24.log |
| Checked source/test hashes | Unchanged through complete sequential gates | checked-blobs.json |

Twelve new cases cover true/false/missing/empty availability, selected lowercase identity, malformed availability values, duplicate selected identity, malformed error receipt, durable cancellation before listing and lost reply with late valid settlement retaining the lease. Existing legacy listing behavior and all prior tests remain.

The original parallel full checks failed unchanged SQLite race fixtures: Node26 1206/1208 and Node24 421/422, with database-locked errors. The two failed cases passed in isolation; unchanged full checks then passed sequentially. This supports scheduling sensitivity but does not certify the absence of all contention faults. Original full-check.log/node24.log and command JSONs are retained; no source, assertion or timeout was changed for this rerun. SQLite's existing 250ms busy policy is unchanged.

Skills: Cook and its reviewed-plan execution, TDD at approved preparation-driver/store/system-effect seams, existing use-git-worktree/Orca workflow. Simplify is unavailable; independent maintainability review remains pending.

Limits: this is a host-only capability check with explicit fake runner/opener and real isolated store. It does not make an unavailable or absent device eligible, perform allocation, certify metadata readiness, install iOS27, run live acceptance or resolve the earlier driver baseline incident. No production store, secret or device effect is invoked. Full H01-H09 remain pending.
