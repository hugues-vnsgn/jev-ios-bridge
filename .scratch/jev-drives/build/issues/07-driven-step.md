# The driven step loop

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: 01, 05, 06

## What to build

`src/driven/step.ts`: `runDrivenStep(ctx)` for one `do` step, called from one new `kind === 'do'` branch in `src/scripted/run.ts` (the only edit there; v1 paths untouched). The loop, per the spec's fixed rules:

1. Observe (reuse the previous action's settled screen as the run does). Ask Jev (Issue 05) unless the step is `localOnly` (then hand back).
2. `stepDone` → the step is complete only if the Noul on this fresh observation is ≥ 0.90 (record it), next step.
3. `accept(action)` → act through the driver (Issue 01 actions included), log `action` with `decidedBy: "jev"`, the choice, confidence and the chosen key, then loop.
4. `handBack(reason)` → first the **target search** (E9) when the reason is `NONE_FITS` or `LOW_CONFIDENCE`; then the **stuck rules** (E10); then call `ctx.handback(packet)` — an injected function (Issue 08 implements it; here a fake) that returns Claude's answer: perform it with `decidedBy: "claude"`, or `revise`/`stop`.
5. Budgets: 8 Jev decisions per step; each action counts toward `maxSteps`.

Log new events (`decision`: options count, choice, confidence, done Noul, tokens, latency; `search`; `handback`: reason, pauseId; `handback_answer`: kind) without screen text beyond what `step` events already log. Add the reason codes from the spec to `vocabulary.ts` with descriptions.

## Acceptance

- Scenario tests with a fake driver, fake Jev and fake hand-back: a straight Jev run; step done; search finds the target after 2 scrolls; search exhausted → hand-back; each stuck rule; the 8-decision budget; risky word; destructive step; localOnly; Claude's tap/type/scroll/back/tapAt answers; `revise`; `stop` → `STOPPED_BY_CLAUDE`; a checkpoint after `do` steps fails the run when false (only checkpoints fail).
- v1 goldens unchanged.

## Comments

- 2026-10-01, coordinator, from Issue 04: `src/driven/candidates.ts` declares a local `CandidateAction` (tap, type, scroll, back) because Issue 01's `Action` change wasn't merged yet. Once 01 is in, point it at `Action` so the shapes live in one place.
- 2026-10-01, coordinator, from Issue 01 (merged `2a97bcb`): `Action` now has `back`, `scroll {direction}` (content direction), `tapAt {x, y}`; `DeviceDriver.actPath()` says how the last back/scroll was done (`back-button`+ref, `edge-swipe`, `back-key`, `scroll-within`+ref, `screen-middle`) — log it on the action event. Point `CandidateAction` in `src/driven/candidates.ts` at `Action`.
- 2026-10-01, coordinator, from Issue 05 (merged `cb961fb`): use `prepareDecision`/`DrivenJudge` from `src/driven/decide.ts` and `acceptDecision`/`doneVerdict` from `src/driven/policy.ts`; `tests/fixtures/driven-judge.ts` has `fakeDrivenJudge`. Rule order: low confidence is checked before the risky-word net, so a low-confidence risky pick still triggers target search; a confident risky pick hands back `RISKY_ACTION`. Destructive steps always hand back (`DESTRUCTIVE_STEP`) — skip the Jev call for them. Step completion on a fresh observation (C4) is yours: `doneVerdict(decision.done) === "yes"`. `topChoices(probabilities, 3)` is for the hand-back package.

- 2026-10-01, coordinator, from Issue 06 (merged `4ed6473`): `DoStep` is in `src/scripted/contracts.ts`; `runScriptedScenario` currently refuses `do` steps (and `start: attach`) right after parsing with a plain Error — replace the `do` refusal with your branch; leave the `attach` refusal (Issue 11 owns attach). The loop iterates `scriptedSteps`.
