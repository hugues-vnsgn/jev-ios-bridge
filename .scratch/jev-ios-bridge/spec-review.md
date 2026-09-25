# Spec review: `39b4653` → `e4c5ebe`

Reviewed the fixed checkpoint on the **Spec** axis against ticket 07, the release plan, domain boundaries, and usage guide. Findings below concern the preparatory implementation; they do not treat pending owner review or live measurements as code defects.

1. **P1 — Expired-reference recovery cannot recognize vendor errors.** [src/device/index.ts:57](../../src/device/index.ts#L57) treats `envelope.error` as an object with `code`, but MobileBuildMCP 2.7.1 defines that field as `string|null`; recoverable codes such as `SNAPSHOT_EXPIRED` live in `data.uiError.code`. Every such failure becomes `CLI_ERROR`, so the [retry branch at :286](../../src/device/index.ts#L286) never refreshes and rematches. The [release plan:121](release-plan.md#L121) requires: “when it expires, takes a fresh snapshot and matches by identifier or role and label.” An expired ref instead ends the run inconclusively.

2. **P1 — A permitted frozen budget can abort the feasibility run after a paid answer.** [spikes/feasibility/harness.ts:247](../../spikes/feasibility/harness.ts#L247) rebuilds an observation with the default 24,000-byte limit, while evaluation at :207 uses `manifest.maxStateBytes` and validation at :199 permits up to 28,000. A 25,000-byte full observation can reach Jev, then throw `STATE_BUDGET` while scoring, losing the comparison. Ticket 07 requires frozen rendering rules and per-case results ([lines 92, 127](issues/07-feasibility-plan.md#L92)).

3. **P2 — Invalid held-out inputs consume the only run claim.** [spikes/feasibility/cli.ts:95](../../spikes/feasibility/cli.ts#L95) creates the corpus-wide held-out claim before selection validation at :118. A mismatched or incomplete tuning file fails without a Jev call, yet a corrected invocation is then rejected as already claimed. Ticket 07 requires evaluation of the chosen frozen configuration on **all 20** held-out cases ([line 113](issues/07-feasibility-plan.md#L113)).

4. **P2 — Reviewed screen evidence is not bound to approval.** [spikes/feasibility/harness.ts:145](../../spikes/feasibility/harness.ts#L145) accepts absent asset paths, and approval hashes only the normalized corpus and manifest; raw captures and screenshots can change without invalidating the approval. Ticket 07 says each case records “the captured screen” and the owner settles labels against that capture ([lines 45, 54](issues/07-feasibility-plan.md#L45)). Require existing, digest-bound evidence assets before live evaluation.

The 30-case corpus, owner labels, live Jev results, go/no-go decision, Claude Code smoke run, and release artifact are pending gates in the release plan, not findings against this checkpoint. I found no material scope creep in the preparatory code.

## Follow-up at checkpoint prototype 5021c02

The four original findings were fixed in the earlier hardening work: vendor codes come from `data.uiError.code`; scoring reuses the frozen observation limits; held-out selection validation precedes the run claim; asset digests are mandatory and checked before live requests. Their regressions remain in the suite.

The independent checkpoint review found two report gaps. Selecting the current checkpoint from the last observed screen misidentified an already completed checkpoint when the global budget ended between checkpoints. A red/green regression now covers selection from recorded proofs, and earlier checkpoint assertion claims and probabilities are included. Earlier screen excerpts and artifact references still need to be linked into the report from the decisive step event; a coding agent is addressing this without changing the frozen experiment source.

The benchmark review also identified differences between the upstream baseline and bridge host permissions, suggested actions, and Weather build timing. [Benchmark preparation](../../spikes/benchmarks/README.md) now discloses them. No comparison result has been claimed.

The earlier-screen evidence gap is now fixed. The report correlates each checkpoint proof with its preceding recorded step and includes the screen excerpt, screenshot artifact name, snapshot sequence, and device provenance. Missing evidence and output truncation are explicit. Regressions cover Settings-to-Home-to-detail evidence, an interrupted boundary, and oversized output. The coding agent ran `npm run check`: all 93 tests, type checking, and build passed; no frozen experiment source changed.

Runtime calibration, live checkpoint feasibility, the installed Claude Code run, and comparison measurements remain expected gate work. No high-severity contradiction was found in ordered advancement, cancellation, the strict scenario union, or bridge-owned verdicts. The standards review found no documented-standard breach; its remaining event-typing concern is a design suggestion, not a live feasibility result.


## Scripted production review, `39b4653...9f8a25e`

A fresh `gpt-6-sol` reviewer at high reasoning compared the fixed implementation against the current scripted spec, originating tickets, and production plan, separately from the Standards review. No model/device calls or tests were made by the reviewer.

**One confirmed policy race:** ticket 11 requires interruption to end inconclusively. `src/scripted/run.ts:323` only changes a pending passed verdict on cancellation during cleanup. If an assertion already failed and cancellation arrives while cleanup is pending, successful cleanup leaves a failed final verdict. Preserve the failed checkpoint evidence, but make the still-active cancelled run's terminal verdict inconclusive. A focused regression and fix are assigned before release.

A preliminary report-metrics concern was withdrawn after checking ticket 13 and the production plan. Phase timings and reference counters are required in journal events, where they are present. The bounded host report prioritizes decisive evidence and its local journal pointer. The main agent clarified an overbroad sentence in the consolidated spec; no implemented data was removed or requirement weakened.

No other confirmed missing requirement or scope creep was found. Measurement and release gates remain expected outstanding work.
