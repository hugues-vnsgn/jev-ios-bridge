# Offline spike protocol: can Jev ground a plan step? (ticket 03)

Status: **approved by the owner on 2026-10-01** (decision D0), with the revisions listed under "Owner decisions" at the end. The files listed under "What gets frozen" are hashed before the run, and the run happens once.

Ticket: [`.scratch/jev-drives/issues/03-offline-spike-can-jev-ground-a-step.md`](../../.scratch/jev-drives/issues/03-offline-spike-can-jev-ground-a-step.md). Earlier protocols this one follows: the v3 checkpoint corpus ([`../feasibility/corpus-v3/README.md`](../feasibility/corpus-v3/README.md)) and the scripted assertion plan ([`.scratch/jev-ios-bridge/scripted-evaluation-plan.md`](../../.scratch/jev-ios-bridge/scripted-evaluation-plan.md)).

## What is tested

Claude has written a plan. The bridge is on one screen, and one plan step is current. The spike asks two things:

1. Does Jev pick the action that performs the step, often enough and confidently enough to act on?
2. Does Jev ever pick a wrong action confidently? This must never happen.

Each case also records whether Jev's "step done?" answer would have been right. That answer never advances a step on its own (C4), so it is reported but does not gate.

## Inputs

- **Cases:** [`cases.json`](cases.json): 29 public cases across 7 apps and both platforms. BFSOne was dropped from the spike (owner, 2026-10-01): the tool must not depend on any one app, and every case must be rerunnable by anyone.
- **Screens:** the captures under [`captures/`](captures/README.md). Jev's screen text is the capture's own file, byte for byte. On iOS that is `jev-screen.txt`, the bridge's `parseSnapshot` plus `renderAssertionState(…, 'ios')`. On Android it is `capture-jev.txt`, the CLI's `--jev` output.
- **Candidate actions:** [`candidates.ts`](candidates.ts) builds them from the same capture and the step's plan values:
  - `tap:<ref>` for each visible, enabled element that can be tapped.
  - `type:<ref>:<valueKey>` only for values the plan supplies to this step.
  - `scroll:up`, `scroll:down`, `back`, `step_done` (the step is already done; no action) and `none_fits` (hand back to Claude).

  The list is deterministic and capped at 255. On these captures it holds 5 to 59 options. The builder's header comment lists its known blind spots. Cases that hit a blind spot are labelled `none_fits`. The test [`tests/jev-drives-candidates.test.ts`](../../tests/jev-drives-candidates.test.ts) checks four things for every case:
  - Every labelled key exists among the case's candidates.
  - The builder gives the same result twice.
  - The request stays within budget.
  - Destructive steps are labelled `none_fits`; already-done steps are labelled `step_done`.

## The request (one per case)

Model `jev-1.13.0` and `@typesafe-ai/sdk` 0.6.0. The run sends 29 requests, one per case, and makes no retries.

`state` is a JSON object:

```json
{
  "goal": "<the plan's goal, one sentence>",
  "current_step": "<the step, as Claude wrote it>",
  "done_when": "<the step's visible evidence>",
  "plan_values": { "<valueKey>": "<value>" },
  "recent_actions": ["<0 to 2 plain-language lines, oldest first>"],
  "screen": "<the capture's Jev text, byte for byte>"
}
```

`questions` holds two independent questions:

```ts
next_action: choice(
  { question: 'Which one action performs the current step on this screen? Choose step_done if the current step is already done on this screen. Choose none_fits if no listed action performs it, or if the screen is not what the step expects.',
    current_step, done_when },
  { [candidate.key]: candidate.description, ... }   // from candidates.ts, in its order
)
step_done: noul(
  { question: 'Does the visible evidence on this current screen show that the current step is done?', done_when }
)
```

Jev never receives any of these:

- The step's permitted effect. That is a bridge rule, and sending `destructive` would give away the label.
- The expected answers, the trap tags or the rationales.
- Any future step.

Request keys are neutral. The harness must have a test proving that none of these fields reach the request.

**Budget**, the same as the scripted judge's: the state plus the longest question must fit in 28,000 bytes, and the whole request in 56,000 bytes. The largest case (NetNewsWire 11) is about 20 KB. If a case goes over, that counts as a failure in its denominator. Nothing is trimmed.

## How each answer is scored

Each case has an expected action. For a few cases the label also lists `alsoRight` keys. These are taps that perform the same step, such as the title text inside a row button. For a destructive step, `alsoRight` holds the destructive target itself. Picking it counts as right, but the bridge never accepts it.

The "right set" is the expected action plus the `alsoRight` keys.

| Term | Rule |
| --- | --- |
| **Right pick** | Jev's top choice is in the right set. |
| **Accepted** | The top choice is not `none_fits`, the step's effect is not `destructive`, and the Choice confidence is at least the threshold for the step's effect: **0.80 for `none`, 0.90 for `test_write`**. A `step_done` choice is accepted only if, in addition, the `step_done` Noul is a yes (≥ 0.90); otherwise it is a hand-back. |
| **Wrong accepted** | Accepted, but not in the right set. **Must be 0.** |
| **Hand-back** | Not accepted: `none_fits`, low confidence, or a destructive step. Claude would act. |
| **Step done** | Noul ≥ **0.90** means yes, ≤ **0.10** means no, anything in between is uncertain. |

Jev-eligible decisions are the cases Jev should settle without Claude. There are 22 of them:

- **Action cases (19).** The expected action is a tap, type, scroll or back. Jev handles one when its pick is accepted and right.
- **Already-done cases (3).** The step is already done, so the expected action is `step_done` and the expected done is yes. Jev handles one when `step_done` is accepted. An accepted `step_done` on a screen where the step is not done counts as a **wrong accepted pick** (the old premature-"done" failure).

**Hand-back cases (7)** are cases where Claude must act: a permission prompt, an unplanned dialog, a destructive step, or content Jev can't read. They never count toward Jev's share. Their only test is that no action gets accepted, so an accepted pick there counts as wrong.

## Metrics, per app, per platform and overall

- Right picks out of all cases.
- Accepted picks, and accepted picks that are wrong (must be 0).
- **Jev-handled share** is handled decisions divided by Jev-eligible decisions. **Target: at least 70%.**
- Hand-backs that were correct: hand-back cases where no action was accepted.
- **Riskier steps under the stricter threshold:** the 4 `test_write` action cases (nnw-03, lm-02, nia-02, fc-02), reported apart from the rest. The 2 destructive cases are also listed, to confirm the bridge never accepted them.
- **Step-done accuracy:** decisive and correct answers out of 29. Also reported: false "yes" answers (done ≥ 0.90 when the label is no), uncertain answers, and the 3 done-yes cases on their own.
- Request, parse and budget failures, input tokens and latency. The run costs about 29 × 7k tokens, under $0.01.
- **Comparison with v3** (17/20 right, 10/20 accepted, 0 wrong accepted). v3 asked Jev to plan toward a checkpoint, and this spike only asks it to ground a step. The two task framings differ, so the comparison is directional.

The 22 eligible decisions per app:

| App | Platform | Cases | Jev-eligible | 70% means |
| --- | --- | ---: | ---: | --- |
| ReadMe | iOS | 5 | 3 | 3/3 |
| NetNewsWire | iOS | 5 | 3 | 3/3 |
| KotlinConf | iOS | 3 | 2 | 2/2 |
| KotlinConf | Android | 2 | 2 | 2/2 |
| ListMaker | Android | 4 | 4 | 3/4 |
| Now in Android | Android | 4 | 3 | 3/3 |
| Fossify Calendar | Android | 6 | 5 | 4/5 |
| **iOS** | | 13 | 8 | 6/8 |
| **Android** | | 16 | 14 | 10/14 |
| **All** | | 29 | 22 | 16/22 |

## Thresholds and why

The thresholds come from the three earlier held-out runs: v1, v2 and v3, 60 cases in all. The results are in `spikes/feasibility/results*/heldout/heldout.json`.

| Evidence from v1 to v3 | Value |
| --- | --- |
| Wrong tap, type or swipe picks | 8. Highest confidence 0.67 (v2, duplicate "Noah" rows) |
| Wrong picks at confidence ≥ 0.80 | 2. Both were early `stop-goal` choices on unsaved forms (v3, 0.88 and 0.90) |
| Right tap, type or swipe picks accepted at 0.80 / 0.90 | 22/34 (65%) / 16/34 (47%) |
| v2's frozen threshold of 0.60 | accepted 2 wrong picks (0.67 and 0.60) |
| `goalReached` when truly done: at least 0.90 | 10 of 14 |
| `goalReached` when not done: at most 0.10 / at least 0.90 | 33 of 46 / 0 of 46. Unsaved forms reached 0.74 and 0.79 |

- **0.80 for steps with `none` effect.** It sits above every wrong action pick seen so far, which topped out at 0.67. It would have kept about two thirds of the right ones. The only wrong picks above 0.80 were premature "done" stops. This spike's Choice has no stop option: "done" is a separate Noul that never advances a step.
- **0.90 for `test_write` steps.** A wrong accepted write costs more than a wrong tap, so the bar is stricter (C21). It gives up about a fifth of the coverage that 0.80 keeps. The one older wrong pick at exactly 0.90 was again a stop choice.
- **`destructive` steps are never accepted from Jev**, at any confidence (C21).
- **Step done: yes at 0.90, no at 0.10.** These are the bounds of ADR-0004 and the scripted judge. On the earlier runs, no not-done screen reached 0.90. The unsaved forms landed in the uncertain band, which is the safe place for them.

Coverage is the risk. At these thresholds the earlier runs accepted about 65% of right action picks, below the 70% target. This spike passes only if grounding a single plain step is easier for Jev than v1 to v3's planning task was. That is what the spike measures. Lowering the thresholds after seeing results is not allowed.

## Go / no-go (as the ticket states)

**Go to the live prototype (ticket 10)** if both hold:

1. There are **zero wrong accepted picks**, over all 29 cases.
2. **Jev handles at least 70% of decisions on each app.**

Otherwise it is a **no-go**: the map closes toward Claude driving through an interactive mode.

A go authorizes a live prototype only, never a release (C1). Zero wrong picks among roughly 20 accepted ones still allows a wrong-action rate of up to about 13% (one-sided 95% bound).

**Per-app numbers are directional.** Each app has only 2 to 4 eligible decisions. At those sizes "at least 70%" means every decision on 5 of the 7 apps, and all but one on ListMaker and Fossify. One miss decides an app. The rule is applied as written. The report also shows per-platform and overall shares, so the owner can see whether a miss is a pattern or noise.

## Run rules

- **One run, no tuning.** There is one configuration: this wording, these thresholds and this candidate builder. No configuration search, and no rerun of the same cases as fresh evidence. If a defect turns up before the run, fix it, regenerate and re-freeze. Once querying starts, nothing is relabelled, re-worded or re-thresholded, and failures are kept.
- **Every case stays in its denominator.** That includes request, parse, budget and observation failures. A failure counts as not handled and not accepted.
- **No device.** The run reads frozen captures only.
- **Secrets.** Load the key by path per `AGENTS.md`, and never print it. Results hold no key and no request headers.
- **Outputs:** `spikes/jev-drives/results/` holds per-case JSON (choice, confidence, probabilities, done Noul, tokens, latency) and a `results.md` with the metrics above.

## What gets frozen

At approval, record SHA-256 hashes of these files here:

- `cases.json`
- every capture file the cases name
- `candidates.ts`
- the harness source
- this protocol

The harness refuses to run if any hash differs.

## Owner decisions (2026-10-01)

Approved with these revisions (D0):

1. **Labels approved**, with: a separate `step_done` option (rm-03, nnw-05, lm-04 now expect it); kca-02 stays `scroll:down` only; rm-01's inner row texts stay right; kc-03's `back` is no longer counted right until ticket 06 verifies back on Compose Multiplatform iOS; nia-02, rm-05 and nia-04 as labelled.
2. **BFSOne dropped** from the spike; **fc-06 added** (Fossify Settings, scroll down to Default duration) so the scroll trap has 3 cases: rm-02 up, kca-02 down, fc-06 down.
3. **Thresholds approved:** 0.80 for `none`, 0.90 for `test_write`, never for `destructive`; step done at 0.90 / 0.10.
4. **Denominator approved:** the 22 Jev-eligible decisions; the 7 hand-back cases are scored only on "no action accepted".
5. **The effect is not sent to Jev.**
