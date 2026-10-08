---
date: 2026-10-08
scope: observed iOS action live validation
base_commit: f91ada48058bfc44bbf574d4fd011e7e36870bb0
---
# Test Report — 2026-10-08 — observed iOS action live validation

**Final verdict: PASS for the patched experimental driver on this fixture.** The original target commit `f91ada4` failed: its semantic tap was acknowledged but did not navigate. The coordinator's integration fix passed all three requested live scenarios on the same fixture without app-side instrumentation, with the lost-reply case correctly ending inconclusively and quarantining its device. The supervisor verified the source hash below and is committing that exact source with this evidence.

**Under test:** `runObservedExperiment` and `MobileBuildMcpDriver.tapOnce`; base `f91ada48058bfc44bbf574d4fd011e7e36870bb0`; visible oracle: `spikes/observed-ui/README.md`, `.scratch/observed-ui/spec.md`, and issue 04. The final candidate source is the worktree version of `src/device/index.ts` (SHA-256 `17f6ed4d901824219d9f95c06e3f53d10dd407e1c3c1a09bf06743ae9beb4022`), identified by its source hash at validation time.

## Matrix

| # | Scenario | Expected | Surface | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Base commit: Home → Details through `observed-tap-v1` | One action submission and visible Details | Real MobileBuildMCP response, snapshots, screenshots, terminal journal | FAIL | [`ordinary/result.json`](ordinary/result.json), [`observation-1.jpg`](ordinary/observation-1.jpg), [`observation-19.jpg`](ordinary/observation-19.jpg) |
| 2 | Candidate patch: ordinary navigation | One action submission and visible Details | Raw backend command/response, snapshots, screenshots, terminal journal | PASS | [`ordinary/harness-outcome.json`](final/ordinary/harness-outcome.json), [`touch response`](final/ordinary/backend/04-ui-automation-touch---json.json), [`before`](final/ordinary/observation-1.jpg), [`after`](final/ordinary/observation-2.jpg) |
| 3 | Candidate patch: already satisfied at Home | Zero action submissions | Raw backend command count, screenshot, terminal journal | PASS | [`already-satisfied/harness-outcome.json`](final/already-satisfied/harness-outcome.json), [`Home screenshot`](final/already-satisfied/observation-1.jpg) |
| 4 | Candidate patch: controlled lost reply, then successor after process restart | Inconclusive; one submission maximum; successor refused before input | Raw backend response, post-action screenshot, durable journal, fresh process command count | PASS | [`lost-reply/harness-outcome.json`](final/lost-reply/harness-outcome.json), [`touch response`](final/lost-reply/backend/04-ui-automation-touch---json.json), [`after reply drop`](final/lost-reply/reply-drop-after.jpg), [`successor outcome`](final/successor/harness-outcome.json) |

The base-commit run made one semantic `tap` request, then collected 19 observations without seeing Details. The runner returned `inconclusive`, `actionAttempted=true`, `actionAcknowledged=true`, `observations=19`, and `DEADLINE_OR_CANCELLED`. Screenshots 1, 2, and 19 all show Home and Open details; the durable journal quarantined that device. Raw stdout for this first tap was not persisted by the original CLI runner, so its acknowledgement is evidenced by the runner result rather than a saved vendor JSON envelope.

A separate fresh-device AXe probe reproduced the no-op with raw output: `axe tap --id open.details --element-type Button --udid 2FE383F2-2D0F-4286-8797-D3ACEFCD6220` exited 0 and reported a completed tap at `(201.0, 527.1666666666667)`, while the next real MobileBuildMCP snapshot and screenshot still showed Home. The same fixture, button frame, and center on another fresh simulator succeeded with one MobileBuildMCP `touch` down/up request; its raw response reports `didError=false`, `status=SUCCEEDED`, `x=201`, `y=527`, and `details.heading` in the post-action capture. See [`AXe output`](axe-semantic/axe-tap.stdout.txt), [`AXe before`](axe-semantic/before.jpg), [`AXe after`](axe-semantic/after.jpg), [`vendor touch response`](vendor-touch/touch-response.json), [`vendor touch before`](vendor-touch/before.jpg), and [`vendor touch after`](vendor-touch/after.jpg).

## Candidate case counts and journal results

Counts below are real MobileBuildMCP child-process invocations recorded by the `CliRunner` harness. `touch` and `tap` count action commands only; observations include a snapshot and screenshot request each.

| Case | Total backend commands | Launch | Snapshots | Screenshots | Touch | Semantic tap | Runner result / terminal record |
|---|---:|---:|---:|---:|---:|---:|---|
| Ordinary | 6 | 1 | 2 | 2 | 1 | 0 | `outcome_observed`, completed |
| Already satisfied | 3 | 1 | 1 | 1 | 0 | 0 | `already_satisfied`, completed |
| Controlled reply loss | 6 | 1 | 2 | 2 | 1 | 0 | `inconclusive`, uncertain/quarantined |
| Successor process after restart | 0 | 0 | 0 | 0 | 0 | 0 | Refused: `Device is quarantined`; no successor intent admitted |

The reply-loss harness called the real patched driver and MobileBuildMCP process, saved its successful action response, then deliberately threw at the wrapper boundary before returning to `runObservedTap`. It made one additional read-only observation after that command to save the visible Details screen; those two backend calls account for the lost-reply case's second snapshot and screenshot. The runner recorded `actionAttempted=true`, `actionAcknowledged=false`, and `CONTROLLED_REPLY_DROP_AFTER_REAL_MOBILEBUILDMCP_RESPONSE`; it did not replay. A new process using the default durable journal was refused with zero MobileBuildMCP commands.

This simulates a withheld reply after the real driver received a successful backend response. It does not sever the MobileBuildMCP CLI transport before the driver receives bytes, and it does not model native contact/release settlement. The result validates no replay and durable successor refusal under an uncertain runner outcome, not transport-layer loss or native ownership.

## Confirmed failure and candidate fix

**F1 — Semantic tap did not activate SwiftUI navigation (product code on iOS 27.0).** Repro: on fresh iPhone 17/iOS 27.0 with the fixture at Home, run the base commit request for selector `role=button, identifier=open.details`, guard `home.heading`, and postcondition `details.heading`. The driver acknowledged one MobileBuildMCP semantic tap, but 19 total observations (18 after submission), each with a screenshot, remained Home until deadline. A standalone AXe semantic selector tap resolved to the screenshot-confirmed button center and also left Home visible. On a second fresh device, MobileBuildMCP touch down/up at the same element reference and center produced the visible Details screen. That is the cause-flipping evidence. The candidate patch changes experimental `tapOnce` to one MobileBuildMCP touch request with `down=true`, `up=true`, and `delay=0.05`, requires both tap and touch capabilities, and does not change legacy `act`; the candidate ordinary case then passed live.

The integration fix and targeted regression changes belong to the coordinator. These probes identify a working alternative, not the exact internal OS cause of the semantic-tap no-op. I made no edits to `src/` or `tests/`.

## Runtime and provenance

- Worktree base commit: `f91ada48058bfc44bbf574d4fd011e7e36870bb0`.
- Candidate `src/device/index.ts` SHA-256: `17f6ed4d901824219d9f95c06e3f53d10dd407e1c3c1a09bf06743ae9beb4022`.
- Experimental sources used: `observed-run.ts` `dcfb8df14008973aa460a373d710952ee9296d647e8a3b1244bb1735b93a0e92`; `observed-tap.ts` `9f7a6b236126699a1988ed7d9b39380db35992266670c59988788753bb9a7b33`; `observed-journal.ts` `46789f9d4eafa7a6b135cdbbf577b3f80ee72d7027305a640e82a48f5c55e38f`.
- Real-command recording harness SHA-256: `1f50a8b132ea2f28aefce3f6fc7dde25f06546b3524509d390552e08a13344a2` (`recorded-runner.ts`).
- App: local Debug build of the unmodified two-screen SwiftUI fixture, bundle `dev.jevbridge.observedfixture`. It declares no short version or build number; executable SHA-256 `7a962edaf8c1306cb02e3649cbba616a38898671665e1876847c9ce099353966`; fixture source SHA-256 `6242ce3f6e867de570049c71e6f1f807a8f11d8c11bef007493f09b5ced7093d`.
- Device: iPhone 17 simulator, UDID `6A8C5F93-F59A-456B-B157-10642209B734`, iOS 27.0 runtime build `24A434`; Xcode 27.0 build `27A266a`; Node `v26.8.1`; MobileBuildMCP `2.7.1`; bundled AXe `1.8.0`.
- The driver used the explicit owned UDID despite the checkout's default simulator setting. No Jev API key or `.env` was used.

## Suites and limits

I did not run the automated suite from this worker. The coordinator reports the candidate full `npm run check` passed with 965 tests and two reviews with zero findings; those coordinator-owned results were not independently rerun here. The live cases above use real MobileBuildMCP responses and screenshots.

An initial read-only snapshot immediately after app launch twice hit `Timed out creating the simulator remote automation session`; a subsequent read-only retry on the same owned simulator succeeded. This startup transient did not affect the final cases. The experiment establishes visible outcome and at-most-one bridge action submission, not causal proof that the action caused the state or proof of native contact release.

## Retained devices and artifacts

Three fresh simulators were allocated and none was shut down, erased, deleted, reset, or released:

- `73997430-DB8A-48C8-8146-12320CE6AEFE`: retained booted; base-commit attempt did not observe its postcondition; journal quarantine and device lease file retained.
- `2FE383F2-2D0F-4286-8797-D3ACEFCD6220`: retained booted after the standalone AXe no-op; operator-quarantined and not reused.
- `6A8C5F93-F59A-456B-B157-10642209B734`: retained booted after controlled reply loss; journal quarantine and device lease file retained.

The historical unresolved UDID `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7` was not used. Allocation details and retained claims are recorded in [`allocation.md`](allocation.md). The evidence links above omit derived-data folders, generated Xcode project files, and build caches.

## Recommendations and open limits

The validated driver source is committed alongside this report; the original target commit remains a failed historical baseline. Keep the three uncertain allocations and their claims retained until separately reconciled. No evidence here establishes causal proof or native input release; the controlled reply drop was injected after the real CLI response reached the wrapper.
