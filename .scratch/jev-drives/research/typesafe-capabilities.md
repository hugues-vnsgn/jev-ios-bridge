# Can Jev drive a mobile test? TypeSafe capabilities and a driver-loop assessment

Researched 2026-10-01. Primary source: the live TypeSafe docs (`https://docs.typesafe.ai/llms.txt` and the pages below, fetched as `.md` that day) and the installed `@typesafe-ai/sdk` 0.6.0 type declarations (`node_modules/@typesafe-ai/sdk/dist/index.d.mts`). Repo evidence is cited by path. No API call was made, and no device was touched.

## Short answer

- Jev offers three question types: **Choice** (pick one of up to 255 options, with a probability for each), **Score** (a position on ordered levels) and **Noul** (probability of yes). It does **not** generate strings or numbers. To get a value out of it, code supplies the candidates and Jev picks one.
- "Which of these N elements should I tap to move toward goal G?" fits a single **Choice** whose options are the candidate actions, plus a `none` option. "What text goes in field F?" works only when the text is already in a list of candidates (from the test plan or the screen), and Jev picks among them.
- Jev keeps **no state between calls**. Every request carries `model`, `state`, and `questions`, so the bridge must send any history it wants Jev to use.
- The bridge calls Jev in one place today, `src/scripted/jev.ts`. It sends one Noul per assertion claim against a text rendering of the accessibility tree and gets back one probability per claim.
- **This repo already tried Jev-chosen actions three times, and all three missed the bar** (v0.1 tickets 08, 18, 19; ADR-0003). Correct top-1 actions were 15/20, 16/20 and 17/20 on held-out single screens. At about 85% per step, a 10-step flow finishes cleanly about 20% of the time unless the loop can recover. Any new attempt should change the task, not just reword it. The best candidate: Claude writes **plain-language steps**, and Jev **grounds each step to an element** and judges whether the step is done. Jev then never plans.

## 1. Call shapes, SDK functions, limits, price

**Endpoint.** A single endpoint, `POST /v1/systemone`. The request is `{ model, state, questions }`. The response is `{ model, answers, usage: { input_tokens, output_tokens } }`, with answers keyed by your question ids ([API reference](https://docs.typesafe.ai/api.md); [Models](https://docs.typesafe.ai/models.md)).

**Question types** ([Primitives](https://docs.typesafe.ai/primitives.md)):

| Type | Asks | Answer fields | Notes |
| --- | --- | --- | --- |
| Choice | which of these options | `choice`, `probabilities` (summing to 1), `confidence` | At most 255 options ([API](https://docs.typesafe.ai/api.md), line "maximum of 255 options per Choice"). Each option's key and description are sent to the model ([Choice](https://docs.typesafe.ai/primitives/choice.md)). |
| Score | which level on an ordered scale | `score` (can fall between levels), `legend`, `probabilities`, `confidence` | Not for reconstructing exact numbers ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md), "Math and Numbers"). |
| Noul | is this true | `noul` (a probability from 0 to 1) | 0.5 means yes and no are equally likely, not "medium" ([Primitives](https://docs.typesafe.ai/primitives.md)). |

"Every answer is constrained to the options you supplied … never a value outside them" ([Primitives](https://docs.typesafe.ai/primitives.md)). There is **no extraction or free-text output**. The docs say "`jev-1.13` is not trained to generate text … it is better to extract possible options using regex or a generative model and let `jev-1.13` pick the correct extraction" ([jaggedness, Generation](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)). Ranking comes from sorting Choice `probabilities` or per-item Nouls or Scores ([Re-ranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md), [Skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion.md)). Extraction means selecting from code-found candidates ([Pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook.md)).

**JS SDK (`@typesafe-ai/sdk` 0.6.0, installed).** Signatures from `dist/index.d.mts`:

```ts
noul(instructions?: EntryType, criteria?: NoulQuestion["criteria"]): NoulQuestion
choice<const T extends ChoiceCriteria>(instructions: EntryType, criteria: T): ChoiceQuestion<T>   // criteria: { [option]: description | null }
score<const T extends ScoreCriteria>(instructions: EntryType, criteria: T): ScoreQuestion<T>     // criteria: ordered array, >= 2 levels (0.6.0 breaking change)
client.systemOne<Q>(request: { model, state, questions: Q }, options?: { signal, ... }): APIPromise<SystemOneResult<Q>>
client.models.list()
```

`EntryType` is a string or a JSON structure, so instructions and criteria can be structured objects ([Advanced: structure](https://docs.typesafe.ai/primitives/advanced.md)). The answer types are `NoulResponse { noul }`, `ChoiceResponse { choice, confidence, probabilities }` and `ScoreResponse { score, confidence, probabilities, legend }`. Changelog: 0.6.0 (2026-09-15) made Score criteria an ordered sequence ([JS changelog](https://docs.typesafe.ai/sdk/javascript/changelog.md)).

**Limits, latency, price** ([Models](https://docs.typesafe.ai/models.md), live 2026-10-01):

- Model `jev-1.13.0`. The aliases `jev-latest` and `jev-preview` both point to it. The repo pins the versioned id.
- Context: 64k tokens per request (state plus all questions), and 32k for state plus the single longest question. **A Choice's option descriptions count toward that question's size.**
- Price: $0.042 per million input tokens, with output free. Measured cost in this repo is about $0.0002–$0.0008 per scripted run (`docs/research/scripted-benchmarks.md`).
- Rate limits: **now 100K tokens/s and 40 requests/s**, "adjusting dynamically". This differs from the 250K tokens/s and 1,200 requests/min recorded in `docs/research/jev-model-and-api.md`, which is stale on this point.
- Latency: "Most queries complete in about 100 ms" ([How to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)). Measured here: about 0.3–0.55 s per request (the v0.1 feasibility runs averaged 336–547 ms per held-out request). The judge phase was 1–3.5 s per scripted run, against 28–52 s for observing and 42–49 s for acting. **The device, not Jev, is the bottleneck.**
- Input: text only, no images. English is the strongest language ([Models](https://docs.typesafe.ai/models.md)).

## 2. "Which element should be tapped?" and "what text goes in field F?"

**Action selection = one Choice.** Each option binds a whole action: operation, target and value (for example `tap:e108`, `type:e103:query`, `swipe:e25:down`). Add `stop-goal`, `stop-blocked` and `none`. The [Function calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling.md) is the closest documented pattern. It picks a function, then each closed-set argument, as Choices, and reports confidence as **the least certain judgment** in the call. Its arguments that are free text, numbers or dates get **no question**: "the function's default stands". The [Skill suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion.md) is the only agent-turn cookbook. One request ranks all 182 skills with a Choice and gates "does any apply" with Nouls; a second request re-checks the top 3. It cut a Haiku agent's wrong skill loads from 16.8% to 7.3%. It **advises** an LLM agent and does not drive one. [Hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification.md) (beam search over Choice probabilities) and [Confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing.md) cover narrowing many options and deciding when to act.

**Typed values.** Jev cannot write "Oslo" or "iris@example.com". Values must come from the test plan (Claude) or from strings on the screen. Jev can choose *which supplied value goes into which field*, as a Choice over value ids or as part of the bound action option. The v0.1 design already did this: "Jev never generates text to type" (`.scratch/jev-ios-bridge/issues/07-feasibility-plan.md`).

**TypeSafe's own position.** "System One is TypeSafe's model for building AI-powered software, not agents. It does not generate code or choose its own next action … Avoid agent `while` loops when a software workflow can express the same behavior" ([How to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)). "There is no `model: "jev-latest"` setting that turns your coding agent into a Jev-powered agent" ([Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents.md)). The skill text allows "a bounded action selection" as a valid question, with code keeping goals and observations. **Code must own the loop.**

Relevant weak spots ([jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)):

- Accuracy falls as the state fills with irrelevant detail, so filter first.
- Multi-hop or indirect questions cost accuracy.
- Jev does not count reliably.
- State text can steer it, which matters because app screens are untrusted text.
- The same question asked as a Noul and as a Choice is not structurally consistent.

## 3. State between calls

There is none. A request is `model`, `state` and `questions`, with no session, conversation or streaming parameter ([API](https://docs.typesafe.ai/api.md); [State](https://docs.typesafe.ai/concepts/state.md)). Questions within one request are also independent: "One primitive's result does not become hidden context that changes another primitive's result" ([How to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)). The bridge must put the goal, plan progress and recent actions into `state` on every call. The docs suggest an object state with named fields, such as `{ goal, plan, history, screen }` ([State](https://docs.typesafe.ai/concepts/state.md)).

Repo evidence on history: in the v0.1 tuning runs, adding recent-step history (configs B and D against A and C) changed top-1 by about one case in ten (for example v3: A 8/10 and B 9/10). It is a small effect and not reliably positive (`spikes/feasibility/results*/tuning/tuning.md`).

## 4. How the repo calls Jev today

- **Only live caller:** `src/scripted/jev.ts`, through `createAssertionJudge`, which `src/scripted/run.ts:352` calls at each checkpoint.
- **Request:** `{ model: 'jev-1.13.0', state, questions }`. There is one `noul({ question: 'Does the visible evidence on this current screen support this specific claim?', claim })` per assertion, with ids `assertion:<id>`, from 1 to 20 claims. There is no Choice and no completion question. Byte budgets are 28,000 for state plus the longest question and 56,000 for the whole request.
- **State:** `renderAssertionState` in `src/scripted/observe.ts`. A header line ("Current iOS screen (full accessibility capture):" or the Android equivalent) is followed by one JSON line per visible element: `role`, `label` (Android uses `placeholder` when the field is empty), `value`, `identifier`, `frame` and `state`. Status bars and invisible or zero-size elements are dropped. The cap is 24,000 bytes. The rule is `visible-full-text-v2` for iOS and `android-full-text-v1` for Android. There are no action options, history or screenshots.
- **Response:** the code parses `answers[...].noul` strictly into `probabilities[claimId]`, along with `usage.input_tokens` and latency. The run policy then turns those probabilities into pass, fail or inconclusive using fixed bounds (ADR-0004).
- **Historical caller:** `spikes/legacy/jev.ts` (v0.1) sent `next_action: choice(...)` over bound action options with `none`, `stop-goal` and `stop-blocked`, plus `goal_reached: noul(...)` and assertion Nouls. That is exactly the driver call shape now being considered, with three wording versions (`DEFAULT_`, `V2_`, `V3_WORDING`).

## 5. Assessment: a Jev-driven loop

### What already failed, and why it matters

| Experiment | Task given to Jev | Held-out top-1 correct | Accepted at gate | Wrong accepted |
| --- | --- | ---: | ---: | ---: |
| v1 (ticket 08) | broad goal, choose the next action | 15/20 | 7/20 | 0 |
| v2 (ticket 18) | broad goal, revised wording | 16/20 | 14/20 | **2** |
| v3 (ticket 19) | ordered checkpoints with desired states | 17/20 | 10/20 | 0 |

The bar was 18/20 correct, 16/20 accepted and zero wrong accepted (`spikes/feasibility/results-v3/heldout/heldout.md`; ADR-0003). The typical misses:

- Premature `stop-goal` on forms that were filled but **not saved** (Contacts, Reminders).
- A wrong scroll direction on an off-screen field.
- Low confidence on duplicate rows ("two Iris rows") and multi-select steps.

These cases were single frozen screens, not closed loops, so live runs would add recovery and drift problems on top.

### The driver loop, if attempted again

1. **Observe:** render the screen as today, plus **numbered action options** built by code from actionable elements. Each option is bound to its operation and a value from the plan's value list. Add `scroll up/down <container>`, `back`, `wait`, `none` and `stop-blocked`.
2. **Ask in one request** (parallel, independent questions):
   - Choice `next_action` over the options.
   - Noul `current_step_done` ("Does the screen show that plan step K is complete?").
   - Noul `goal_reached` (the whole end state, with "saved" or "persisted" spelled out).
   - Nouls for any final assertions.
3. **Code decides:**
   - Act only if the Choice confidence is at least the threshold and the Nouls do not contradict it. For example, never accept `stop-goal` unless `goal_reached` is high.
   - Advance the plan step when `current_step_done` is high.
   - Otherwise stop inconclusive. There is no hidden fallback.
4. **Act** through the existing device layer, then **check freshness**: did the screen change? Then repeat.
5. **Stop** when `goal_reached` plus the final assertion Nouls pass, or on any budget limit or stuck signal. Write the same report format as today.

### Risks

- **Planning.** Jev is a snap-judgment model and does not plan. A bare goal invites wrong next steps and premature stops. That was the v1 and v2 failure.
- **Compounding error.** Per-step accuracy of about 85% to 90% compounds: 0.85^10 ≈ 0.20 and 0.9^10 ≈ 0.35 for a 10-step flow. The loop needs recovery, such as `back` and re-ask, or a stop, plus a strict confidence gate. A strict gate lowers coverage, which was the v3 failure (50% accepted).
- **Memory.** It is stateless, so code must carry plan progress. History in state helped little. Plan position, a step index kept in code, is more useful than a raw action log.
- **Stuck detection belongs in code, not Jev.** Signals include:
  - The same screen hash after an action.
  - The same action chosen twice on the same screen.
  - An A→B→A oscillation.
  - Too many steps for a plan step.
  - The total step and time budget.
- **Typed values.** Jev cannot invent them. Every input value must be in the plan. Free-form fields such as search queries or notes need an explicit value.
- **Done detection.** Unsaved forms and partial states look done. The goal Noul must name the persisted evidence, and the Contacts and Reminders misses show it still can fail.
- **Large or crowded screens.** Irrelevant elements reduce accuracy. Duplicate labels hurt Choice confidence. The 255-option cap rarely binds, but descriptions count against the 32k budget.
- **Untrusted screen text** can steer answers ([jaggedness, Adversarial content](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Rate limits** of 40 requests/s are not a concern at device speed.

### What Claude should still provide

Claude should write **a step-by-step plan in plain language**, not a bare goal and not a selector script:

- Ordered steps ("Open Locations", "Search for Oslo", "Open the Oslo result", "Switch wind units to m/s").
- A **value list** for every typed input.
- For each step, an observable "done when" sentence.
- Final assertions.
- Optional forbidden states ("no Locations sheet open").

This narrows Jev's job from planning to **grounding**: which element performs *this* step, and is this step done? That matches TypeSafe's "select instead of generate" and "code owns control flow" guidance. It is narrower than the v3 checkpoints, which still asked Jev to find a route to a desired state. Claude still reads the final report. The saving over today is that Claude no longer writes selectors, guards or exact element targets, and the run can absorb small layout changes.

### Smallest spike to measure the right-pick rate

Run it **offline, without a device and without code changes to the bridge.**

1. Take about 20 captured screens that already exist in `spikes/feasibility/corpus*/raw/` and `spikes/benchmarks/` (Weather, Contacts, Reminders, Settings). Label each with a one-line plain-language step and its set of acceptable elements. Label about 5 with "step already done", and about 5 as unsaved-form or duplicate-row traps. Note that these corpora are disclosed development evidence, so this measures direction, not release readiness.
2. Per screen, send one request: Choice `which_element` over the code-built tap, type, scroll and back options, plus `none`, and Noul `step_done`. The state is `{ step, values, screen }`.
3. Report:
   - Top-1 right-pick rate.
   - The rate when confidence is at least 0.6 or 0.8, with coverage.
   - `step_done` accuracy on the traps.
   - Tokens and latency per request.

   Compare against the v3 baseline of 17/20 top-1 and 10/20 accepted.
4. **Go signal:** at least 19/20 top-1 with at least 16/20 accepted and zero wrong accepted at a fixed threshold. Grounding should be much easier than next-action planning. If it is not, Jev-driven navigation is not worth a live loop. Only then build a 3-flow live loop (Weather units, Contacts create, Reminders complete) and measure end-to-end completion, steps and stuck stops against the scripted runs.

Cost of the spike: about 20 requests × about 5k tokens ≈ 100k tokens, which is under $0.01 of Jev time. Most of the effort is labeling.

## Stale or changed facts noticed

- **Rate limits.** `docs/research/jev-model-and-api.md` lists 250K tokens/s and 1,200 RPM. The live Models page now says 100K tokens/s and 40 requests/s.
- **SDK version.** The installed SDK is 0.6.0, and Score criteria are now an ordered array. The repo only uses `noul`, so it is unaffected.
