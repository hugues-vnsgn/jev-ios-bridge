# Test report, 2026-09-24: evidence and host integration

**Verdict: UNVERIFIED.** The offline evidence and host checks pass after two fixes. A live CLI run on the dedicated simulator remains behind the owner-reviewed feasibility corpus.

**Under test:** `src/log`, `src/report`, `src/watch`, `src/service.ts`, `src/mcp`, and `src/cli.ts`. Oracles: tickets 13 through 15, `docs/usage.md`, and the shared contracts.

## Matrix

| # | Scenario | Expected | Surfaces | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Two starts at once | Distinct run IDs, one live watch server, separate verdicts | service, logs, watch URL | PASS | Integration test 1 |
| 2 | Cancel a pending judgment | Cleanup precedes an inconclusive verdict | service, log, driver | PASS | Integration test 2 |
| 3 | Prepare or cleanup fails | Recoverable handle, error, inconclusive verdict | service, log, report | PASS | Integration test 3 |
| 4 | Screenshot copy fails | Later error and verdict still append | JSONL | PASS | F1 regression test; service also preserves run handle |
| 5 | Final record is partial | Earlier records readable; report inconclusive | JSONL, report | PASS | Integration test 5 |
| 6 | Middle JSONL record is corrupt | Reader rejects instead of reporting pass | log reader | PASS | Integration test 6 |
| 7 | Private value and HTML appear | Value redacted; watch renders evidence as text | log, report, HTTP | PASS | Integration test 7 |
| 8 | Start races with close | No job starts after shutdown begins | service lifecycle | PASS | F2 regression test |
| 9 | CLI report reads existing run | Output from journal without device or key | CLI stdout, exit | PASS | Integration test 9 |
| 10 | MCP stdio registration | Tools available; generic error for missing run | JSON-RPC | PASS | `tests/mcp.test.ts` in earlier suite |
| 11 | Watch image access | Token and safe basename required; bytes and MIME preserved | HTTP, copied artifact | PASS | New image integration test |
| 12 | CLI runs a real scenario | Launch, observe, judge, act, report on the dedicated simulator | CLI, device, Jev, JSONL | UNVERIFIED | Simulator is reserved for the feasibility corpus |

## Red reproductions and fixes

### F1: failed screenshot copy poisons the log queue

Before the fix, `npx tsx --test tests/integration-edge.test.ts` failed row 4. `append('step', { screenshotPath: missing })` rejected with `ENOENT`, then `append('error', ...)` rejected with the same error because the queue stayed rejected. `createRunLog` now keeps the failing write's rejection for its caller and recovers the queue for later writes. The unchanged reproduction passes, and the service-level test records an error and inconclusive verdict when screenshot copy fails.

### F2: start can outlive shutdown

Before the fix, the same command failed row 8 with `Missing expected rejection`. The test calls `service.close()` inside `createDriver`, after `start` checks `stopping` and before it registers the job. `start` now rechecks shutdown before registration; the unchanged reproduction rejects and passes.

## Suites and limits

Initial `npx tsx --test tests/integration-edge.test.ts`: 7 passed, 2 failed, 0 skipped. Final run after fixes and an image-access row: 11 passed, 0 failed. `npm run check` passed typecheck, all 45 tests with zero skips, and build. No lint script is configured.

Node's coverage run over the evidence, service, integration, and MCP tests passed 16/16. Coverage for the main-owned files: log 96.5% lines and 92.9% branches; report 100% and 96.7%; service 93.3% and 85.2%; MCP 91.4% and 85.7%; watch 98.4% and 75.0%. CLI measured 82.5% lines and 63.6% branches because its report and MCP checks execute in child processes outside this coverage process; the live `run` path remains unverified. The suite asserts CLI report output and MCP negotiation directly despite that measurement limit.

## Unverified

| Row | Why | What closes it |
| --- | --- | --- |
| 12 | The simulator belongs to ticket 08's corpus preparation, and its reviewed labels precede live Jev evaluation. | Run the packaged CLI/MCP scenario after the owner reviews and freezes the corpus, then inspect the report, JSONL, screenshot, and watch page for the same run. |

## Checkpoint implementation follow-up

`npm run check` now passes type checking, all 90 tests, and the build. Added coverage includes ordered checkpoint proofs, values restricted to the active checkpoint, global step and wall limits, cancellation between checkpoints, missing-key rejection before device work, bounded MCP report waiting, and withholding screen evidence from running MCP replies. Device lifecycle tests require terminal acknowledgement before unlocking after cancellation or a transport failure.

The default-device regression first failed with `Missing expected rejection`: `defaultUdid: 'booted'` could bypass scenario UUID validation. The adapter now validates the resolved device ID before locking or issuing any CLI command. The unchanged regression passes; all 21 device tests pass.

These are scripted checks. The two live feasibility evaluations remain no-go results. Ticket 19's checkpoint corpus is awaiting final audit and owner review; the complete installed Claude Code scenario and comparison measurements remain unverified.

Independent review then reproduced a report defect at a checkpoint boundary: after checkpoint one passed at the global step limit, the report still named it as current. The regression failed against the previous renderer and passed after selecting the next checkpoint from recorded proofs. Completed checkpoint claims and probabilities now appear in the report. All seven affected evidence/service tests and type checking passed. [CI on commit 5021c02](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/35975854774) passed all 91 tests with zero failures or skips on Node 24, plus type checking and build.
