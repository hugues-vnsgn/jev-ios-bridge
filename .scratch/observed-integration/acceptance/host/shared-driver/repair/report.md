# Ticket 05 bounded review repair

Outcome: PASS for the bounded fake-only host repair matrix. Independent repair review and Root integration are pending. The initial baseline backend incident's missing raw vendor output and side effects remain UNVERIFIED; the original report and incident records are unchanged.

Commit: `6f0ad209d4255713d36da52ccc6b278c2ebac98a`.
Repair parent: `2ec78bdcc01a6f5a809022a921faf3fc2766e445`.
Original product base: `b70a7ab3883dfb1530918f16cc39324b1662f91e`.
Worktree: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-shared-driver`; branch `feat/observed-shared-driver`.

Source edits stopped at the repair commit. The working tree is clean apart from the permitted, visible untracked shared-driver evidence directory. Root resumes ownership of the shared driver source for independent review and integration.

## Changes and confirmed causes

- R1: removed only the unused factory import inside the eval child. The test module's typed-factory import remains. The child import used `../src` from the worktree root and failed module resolution outside the worktree. Original post-full-assertions.patch shows that import was introduced after the original full-suite run; that historical green did not certify the later pinned child revision. The existing separate-process transfer test reproduced red before the repair and now proves one capture, zero preparation/presentation effects, committed terminal authority and retained allocation.
- R2: terminalPayloadMatches now validates every simulator-list entry's used identity and state fields before admitted dispatch can acknowledge the command. Identities must be UUID strings (case-insensitive); states must be nonblank strings. The list must be an array. Malformed success or error receipts remain unacknowledged and revoke issuance. No new authority, SQL, source fallback or driver deadline API was introduced.
- C1: clearSignalListeners centralizes local attach-listener cleanup for park, finishAdmission and close completion, including failed close for externally owned claims. It neither certifies backend settlement nor releases a quarantined lease. Native AbortSignal listener observations on isolated real preparation and observed claims went red before the repair and green afterward.

Exact changed files: `src/device/index.ts`; `tests/admission-driver.test.ts`; `tests/simulator-window.test.ts`; ticket 05 Comments only. Status remains ready-for-agent. No other product, test, shared admission, Android, public adapter, golden, app or protected file changed.

## Verification matrix

| Scenario / oracle | Assertion | Evidence | Verdict |
| --- | --- | --- | --- |
| R1 independent Standards reproduction | Current fake-only separate-process transfer fails module resolution before fix; after fix it commits from a fresh process with calls exactly `[snapshot-ui]`. | transfer-red.log (exit 1, 0/1); transfer-green-node26.log and transfer-green-node24.log (exit 0, 1/1 each); final focused/full logs | PASS |
| R2 independent Spec numeric-state reproduction | `{simulatorId: selected, state: 123}` must reject inside dispatch and issue no launch/window/stop. Reviewer replay with explicit existing runner/window plus fakeBackend now records only list, rejected true, quarantined admission. | listing-red.log (exit 1, twelve failing new cases); spec-repro-green.log (exit 0); final focused/full logs | PASS |
| R2 malformed entries and payloads | Fifteen cases cover selected numeric/missing/null/empty/blank state; numeric/missing/malformed identity; missing/null/nonarray list; null/array/string entry; malformed unselected entry. Each rejects without acknowledged settlement, forbids observe/close effects and retains quarantined admission. | final-specific-node26.log; focused-node26.log; focused-node24.log; full-check.log | PASS |
| R2 malformed error receipt | A didError simulator-list with invalid selected state cannot gain the acknowledged-error envelope or authorize cleanup. Calls remain only list. | final-specific-node26.log; final focused/full logs | PASS |
| Compatibility | Valid lowercase UUID and existing missing-selected warning behavior remain; added valid empty list warns, launches and performs known settled stop. Existing acknowledged opener warning and ordinary legacy stale-reference retry remain. Android regressions/goldens unchanged. | listing-green.log; final focused/full logs | PASS |
| C1 uncertain external close | Real isolated preparation and observed claims each start with one attach abort listener. After command cancellation and uncertain close there are zero listeners while the fake backend remains pending. Same lease bytes remain after late settlement; no follow-up commands occur. | listener-red.log (exit 1, 0/2); listener-green.log (exit 0, 2/2); final focused/full logs | PASS |
| C1 successful park / observed close | Existing typed-factory preparation/park/consume case now asserts listener removal after successful park and after known settled observed close. Attachment still makes zero boot/install/launch/window calls. | final-specific-node26.log; final focused/full logs | PASS |
| Final authority / transport blast radius | All eleven affected suites and the complete repo gate pass on final source/test blobs. Test-authority real runner/opener rejection assertions are preserved. No storage is inferred from lockRoot. | focused-node26.log; focused-node24.log; full-check.log; final-hash-check.log | PASS |
| Historical baseline incident | Vendor launch/diagnostic invocation and missing raw vendor output are recorded in the original incident record. No side-effect certification or device cleanup/investigation is attempted by this repair. | ../ownership-red.log; ../unintended-baseline.md | UNVERIFIED; outside repair PASS |

## Commands, counts and exact runtime

Every passing command below exited 0. Every test invocation reports zero failures and zero skips. Raw files contain exact arguments, actual subprocess exit code and elapsed time; the capture wrapper's own exit is not used as the test verdict.

| Command | Final result | Evidence |
| --- | --- | --- |
| `node --version` | v26.8.1 | runtime-node26.log |
| `npx --yes --package=node@24.0.0 node --version` | v24.0.0 | runtime-node24.log |
| `node --import tsx --test` with eleven suites below | 220/220; 23.17s wall | focused-node26.log |
| `npx --yes --package=node@24.0.0 node --import tsx --test` with same suites | 220/220; 23.32s wall | focused-node24.log |
| `npm run typecheck` | exit 0 | typecheck-final.log |
| `npm run build` | exit 0 | build-final.log |
| `npm run check` | typecheck + full suite 1185/1185 + build; exit 0; 35.33s wall | full-check.log |
| `node --import tsx --experimental-test-coverage` with includes for index.ts/lease.ts/factory.ts and the same eleven suites | 220/220; 29.79s wall; thresholds pass | coverage-final.log |
| `git diff --check` | exit 0 | final-diff-check.log |
| Exact current product/test blobs compared to checked-revisions.json | equality asserted, exit 0 | final-hash-check.log |

Suites (under `tests/`): admission-driver.test.ts, device.test.ts, device-lease.test.ts, device-factory.test.ts, lease.test.ts, observed-touch-integration.test.ts, simulator-window.test.ts, device-driven-actions.test.ts, start-attach.test.ts, scripted-run.test.ts and observed-tap.test.ts. Exact full arguments are preserved in each raw log.

Final focused Node 26/24, coverage, typecheck/build and full check used identical product/test blobs. No product or test edits followed those checks. Exact blobs are in checked-revisions.json: index.ts `5a95c306a9a9444c16e156ac4cab238bb6aee291`; admission-driver.test.ts `7cc3c380872dce229421f1ba8970785ea136bf90`; simulator-window.test.ts `7ca98ced53c457c9fbced0ce421bb55887d7edce`. Factory/lease remain the pinned parent blobs. Ticket comment additions only record final gate results. There is no final-test drift.

Coverage: index.ts 94.65% lines / 84.29% branches; factory.ts 100% / 81.82%; lease.ts 99.67% / 90.83%; aggregate 95.84% / 85.39%. These pass the skill's secondary 80% lines / 70% branches bar. Uncovered lines include existing defensive/parser paths, declaration mappings and real transport execution. Percentages do not certify native/device settlement, process-wide leak absence or public/live acceptance.

## Preserved originals and limits

Original reviewer repro.mjs/repro.log and Standards transfer output are copied byte-for-byte to review-spec-original.mjs, review-spec-original.log and review-standards-original.log. Their SHA256 values are recorded in checked-revisions.json; originals at `/tmp/jev-driver-spec-review-0Bt64I/` and `/tmp/jev-driver-standards-review-transfer.log` are untouched. The replay spec-repro.mjs adds explicit existing runner/deviceWindow options alongside fakeBackend; its assertion and malformed payload match the reviewer scenario.

Evidence is private (directory 0700, files 0600), untracked and intentionally visible. Test child umask stays 022, preserving deliberately unsafe permission fixtures. Fixed-candidate repair checks use temporary isolated test stores and explicit fake command/window dependencies. No production admission store, migration, live device, key/.env, app or backend operation was used in this repair. No cleanup/investigation device call, merge, push, publish or new agent was invoked.

Cook uses Root's reviewed bounded plan and authorization; TDD and diagnosing-bugs supplied the captured red/green loops; do-test supplied this matrix and coverage audit. Simplify remains unavailable and did not run. Inline maintainability inspection confirms local dispatch validation and listener cleanup; Root supplies independent Spec/Standards repair review.

Readiness total stage budget still depends on the shared caller-supplied deadline signal across internal calls. Root requested no driver deadline API expansion. No unresolved ownership/interface blocker remains in this repair; acceptance awaits Root's review and integrated check before 06/07 proceed. Historical baseline incident remains UNVERIFIED independently of this bounded repair PASS.
