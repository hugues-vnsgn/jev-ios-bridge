# Ticket 05 shared-driver verification

Outcome: provisional FAIL at independent review of pinned candidate `2ec78bd`. Historical host checks below reported passing results, but the two independently reproduced findings below remain unresolved. Source is frozen pending Root's bounded repair dispatch. Initial harness incident side effects remain UNVERIFIED in a separate row below.

Commit: `2ec78bdcc01a6f5a809022a921faf3fc2766e445`.
Base: `b70a7ab3883dfb1530918f16cc39324b1662f91e`.
Worktree: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-shared-driver`.
Branch: `feat/observed-shared-driver`. Source edits stopped for review; only this permitted untracked evidence directory remains outside the commit.

Oracle: ticket 05 and the accepted admission, allocation and seam decisions linked from the implementation handoff. Skills applied: Cook with the supplied reviewed plan/autonomous authorization; TDD at the real Admission/driver/factory seams; diagnosing-bugs for red reproductions and fixture failures; use-git-worktree for linked-isolation verification; do-test for this matrix/checks/coverage; codebase-design for the narrow typed interfaces. Root supplies independent Spec/Standards reviews. Simplify was unavailable and did not run; inline maintainability review checked dispatch locality, lifecycle gates and the authorized diff.

## Matrix

| Row | Expected and observed assertion | Evidence | Result |
| --- | --- | --- | --- |
| H03 shared ownership | Real isolated SQLite admission blocks competing observed/preparation/legacy owners in both directions. Lowercase UUID aliases contend. Losing legacy preparation emits zero backend calls; normal confirmed close permits a successor. | admission-driver ownership tests; device.test.ts alias/competition tests; ownership-red-fake.log and ownership-green.log | PASS |
| H03 parked transfer (historical check; review disputed) | Typed preparation uses its existing claim; boot/install/launch/readiness settle before park. A fresh consumed driver attaches without boot/install/launch/window. A real child consumes parked ownership, captures only once, closes local resources and commits already-satisfied. | preparation-red.log, preparation-green.log, transfer-green.log, focused-node26.log; factory-boundaries-node26.log and factory-boundaries-node24.log; independent finding R1 below | REVIEW FAIL |
| H04 host guard | Unknown creation prevents new legacy attachment before launch/list/window; no source fallback or independent authority. Store dependency tests exercise supplied/ready blocking and retained eligibility. | admission-driver host-guard test; full-suite.log | PASS |
| H05/H06 cancellation | Caller/deadline abort closes issuance; abort-ignoring list/window/launch/snapshot/stop and every preparation phase cannot issue a continuation or park. Late acknowledgments cannot stop/unlock, promote success or clear quarantine. Underlying promises and their durable settlement remain tracked after the abortable waiter rejects. | cancellation-baseline-red.log, cancellation-green.log, expanded-green.log, focused-node26.log, focused-node24.log | PASS |
| H05 one observed input | tapOnce validates capabilities/freshness, authorizes kind tap and sends one touch; second submission, stale reference, missing capability and late touch never refresh/retry/fallback. Ordinary acknowledged legacy stale-reference retry still passes. | admission-driver single/late-touch tests; observed-touch-integration.test.ts; observed-tap.test.ts; device.test.ts existing retry cases | PASS |
| H06 malformed capture / listing | Invalid snapshot content rejects inside admitted dispatch, forbids stop/follow-up and retains quarantine. Invalid selected-device listing closes dispatch before window/launch; valid missing identity retains the existing warning. | capture-shape-red.log, capture-shape-green.log; simulator-window.test.ts; focused-node26.log; independent finding R2 below | REVIEW FAIL (listing shape gap) |
| H08 compatibility lease | iOS dead/malformed holders cannot be reclaimed or dispatch. Exact legacy lease shape stays compatible. Android dead-holder recovery, agent/adb fencing and lease serialization remain unchanged. | device.test.ts, device-lease.test.ts, lease.test.ts; full-suite.log | PASS |
| Test transport authority | Test `test authority rejects the real runner or real presentation before backend access` explicitly rejects: production/default runner plus test store; runner-only injection plus test store; actual `deviceWindowOpener(false,{})` plus test store; the actual production opener inserted into fakeBackend; missing fake window dependency; fake backend without explicit admission. The fake runner's body fails if reached. No storage is derived from lockRoot. | real-backend-rejection-node26.log, real-backend-rejection-node24.log, factory-boundaries-node26.log, factory-boundaries-node24.log | PASS |
| Missing authority / lazy startup | Initialized store with missing database refuses before effects, without alternate-root fallback. Existing Android factory/startup cases run independently of iOS migration/production storage. | admission-driver missing-authority test; device-factory.test.ts; full-suite.log | PASS |
| Frozen compatibility | Legacy scripted/device/report/CLI/MCP golden assertions and all Android regression tests pass. Fixture-only changes use explicit fake transport/test admission and synthetic device identities; no golden changed. | full-suite.log | PASS |
| Initial baseline incident | Planned fakeBackend was passed before the old constructor supported it; the old default backend attempted launch on a synthetic UUID, followed by its diagnostic list path. Raw vendor output was not retained; side effects cannot be certified. Original harness output is preserved unchanged. No cleanup/investigation device operation followed. | ownership-red.log; unintended-baseline.md | UNVERIFIED |

## Provisional independent review findings

Root supplied these findings on the immutable candidate; the author has not rerun or changed source in response. Spec review is still completing. These findings supersede the associated historical PASS claims above.

| Finding | Reproduction and consequence | Raw review evidence | State |
| --- | --- | --- | --- |
| R1 Standards: separate-process transfer fixture | An unused factory import was copied into the eval child at tests/admission-driver.test.ts:318. Its relative `../src` resolution escapes the worktree; the separate-process transfer exits 1. The historical suite logs remain preserved, but do not establish transfer correctness for this pinned candidate. | `/tmp/jev-driver-standards-review-transfer.log` | Provisional FAIL; source frozen |
| R2 Spec: selected simulator state validation | A selected simulator entry with `state: 123` is accepted by list validation, converted to undefined, emits a warning and then launches. The required malformed-terminal fence must reject this payload and issue zero launch calls. Existing malformed-list assertions do not cover this selected-entry shape. | `/tmp/jev-driver-spec-review-0Bt64I/repro.mjs`; `/tmp/jev-driver-spec-review-0Bt64I/repro.log` | Provisional FAIL; source frozen |

Root will supply the bounded repair dispatch after both independent reviews finish. No source repair or additional test execution occurred while their pinned source was under review. Root's integrated full check remains outstanding.

## Commands and results

All listed passing commands exited 0; every suite reports zero failures and zero skips.

| Command | Runtime / result | Raw evidence |
| --- | --- | --- |
| `node --import tsx --test` with the eleven owned/authorized driver fixture suites named below | Node 26.8.1, 201/201, 14.12s | focused-node26.log; runtime-node26.log |
| `npx --yes --package=node@24.0.0 node --import tsx --test` with the same eleven suites | exact Node 24.0.0, 201/201, 11.30s | focused-node24.log; runtime-node24.log |
| `npm test` | Node 26.8.1, full suite once, 1166/1166, 23.15s | full-suite.log |
| `node --import tsx --experimental-test-coverage --test-coverage-include='**/src/device/index.ts' --test-coverage-include='**/src/device/lease.ts' --test-coverage-include='**/src/device/factory.ts' --test` with the eleven suites | Node 26.8.1, 201/201, 11.21s; secondary coverage thresholds pass | coverage-final.log |
| `node --import tsx --test --test-name-pattern='preparation parks\|test authority rejects' tests/admission-driver.test.ts` | Final factory/production-opener boundary assertions, Node 26.8.1, 2/2 | factory-boundaries-node26.log |
| Same boundary command via `npx --yes --package=node@24.0.0 node` | exact Node 24.0.0, 2/2 | factory-boundaries-node24.log |
| `npm run typecheck` | Passed on the final test/interface revision | typecheck-handoff.log |
| `npm run build` | Passed; source unchanged through commit | build-final.log |
| `git diff --check` | Passed before commit | captured tool result |

The eleven suites are `tests/admission-driver.test.ts`, `device.test.ts`, `device-lease.test.ts`, `device-factory.test.ts`, `lease.test.ts`, `observed-touch-integration.test.ts`, `simulator-window.test.ts`, `device-driven-actions.test.ts`, `start-attach.test.ts`, `scripted-run.test.ts`, and `observed-tap.test.ts` (all under tests/).

All three product source files were unchanged between the full/focused/coverage checks and commit. Exact blob hashes are in checked-revisions.json. The full-suite admission-driver test blob is `e0e60a92af97f9d440bceb0391b3153712ea955c`; final is `ff15e8f80ea88a1c2d64845275a2a926a89e87cc`. post-full-assertions.patch records the later production-opener assertions and the switch of the existing preparation/observed case to the typed factories. Those two cases were retested on both runtimes; the entire full suite was not repeated after this assertion-only change. Root will run the integrated final check.

Genuine red commands exited 1: ownership-red-fake.log (legacy bypassed the existing observed claim), preparation-red.log (missing typed attachment), cancellation-baseline-red.log (abort left the old caller wait pending), capture-shape-red.log (malformed snapshot permitted cleanup/availability). Each has a corresponding passing fixed-candidate command. Earlier driver-first.log failures encode intentionally corrected cancellation/late cleanup/dead-PID expectations; fixture-check.log exposed the stale scripted diagnostic fixture. The valid empty simulator-list fixture correction preserves DEVICE_ERROR/vendor-code assertions. Typecheck-second.log records two generated fixture literal-comparison typing errors; they were corrected and the final compile gates pass.

## Coverage and limits

Changed product source coverage: factory.ts 88.24% lines / 77.78% branches; index.ts 93.77% / 83.73%; lease.ts 99.67% / 90.83%. The default secondary bar is 80% lines / 70% branches. Uncovered source ranges include type/interface/comment mapping, existing parser/geometry defensive paths, default real subprocess/window execution, and defensive attachment/timeout error paths. Real transport execution is deliberately outside fixed-candidate host fixtures. The final typed-factory case is additionally checked after the coverage run. Percentages do not certify public adapters, real migration, installed workflows or native settlement/release.

Production activation remains lazy until effectful iOS preparation; no production admission store or migration was accessed. No `.env` or key was read/copied/printed; no app, protected claim, shared admission/observed/CLI/MCP source or golden file changed. Fixed-candidate checks use private temporary SQLite stores and explicit fake transports. Child umask remains the normal 022 so permission-rejection fixtures retain their deliberately unsafe modes; evidence is private 0700/0600.

Stage/overall deadlines, verified immutable artifact/context selection and readiness polling policy belong to the allocator. The driver accepts module-owned preparation/observed capabilities, never raw owner tokens. External claims remain owned/finalized by their module; driver close performs only local settlement/lease cleanup for them, with no stop/relaunch. A caller supplies the separate bounded finalization signal, normally 5000ms. Runtime records observation/receipt progress and terminal authority through the integrated store; late driver callbacks do not write those progress facts.

No public/live acceptance is claimed. Independent review and Root integration/checks are outstanding. The initial backend invocation's missing raw vendor output and side effects remain UNVERIFIED; this report neither certifies them nor substitutes a cleanup operation.

## Files and ownership transfer

Committed exact ticket write set: `src/device/index.ts`, `src/device/lease.ts`, `src/device/factory.ts`; `tests/device.test.ts`, `device-lease.test.ts`, `device-factory.test.ts`, `lease.test.ts`, `observed-touch-integration.test.ts`, `admission-driver.test.ts`; the five authorized fixture extensions `device-driven-actions.test.ts`, `simulator-window.test.ts`, `start-attach.test.ts`, `scripted-run.test.ts`, `observed-tap.test.ts`; ticket 05 Comments only. Status remains ready-for-agent.

Transfer shared driver source ownership to Root now. The two provisional review failures above require repair; 06/07 must wait for Root's reviewed integration. The untracked shared-driver evidence directory is intentionally visible and excluded from the source commit.
