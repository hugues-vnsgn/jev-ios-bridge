# Why assertions abstain: Jev uncertainty and claim wording

> Answers ticket 03 in the [v1-release map](../../.scratch/v1-release/map.md) ("Why assertions abstain"). It supplies evidence for ticket 07 ("Assertion policy for 1.0") and does not decide that policy.

Researched: 2026-09-25 · No live Jev calls were made. Every probability below comes from runs already archived in this repo.

Sources:

- **Archived runs in this repo.** Reminders run `0fb5c786-d4ed-4b60-bfed-68a5452b533a` ([journal](../../spikes/benchmarks/results/reminders-bridge-attempt1/journal.jsonl), [report](../../spikes/benchmarks/results/reminders-bridge-attempt1/report.md), [screenshot](../../spikes/benchmarks/results/reminders-bridge-attempt1/screen-35.jpg)). The frozen scripted evaluation ([results](../../spikes/scripted/results/evaluation/results.md), [corpus](../../spikes/scripted/corpus/corpus.json)). The other benchmark journals under `spikes/benchmarks/results/`, the integration runs under `spikes/scripted/integration/results/`, and the three feasibility rounds under `spikes/feasibility/results*/`.
- **Bridge code at `a4522fe`.** `src/scripted/jev.ts`, `observe.ts`, `select.ts`, `run.ts`, and `skills/test-ios/SKILL.md`.
- **TypeSafe docs** at https://docs.typesafe.ai: `llms.txt` plus 19 linked `.md` pages, fetched with `curl` on 2026-09-25 at 05:09 UTC. The jaggedness page reads "Last reviewed 2026-09-17". Both self-consistency cookbooks were "sampled on 2026-09-11". The `typesafe:typesafe-ai` plugin skill (0.5.7) served only as a pointer to these pages.

Citation keys:

- `docs:<path>:<line>` is a line of the raw Markdown at `https://docs.typesafe.ai/<path>`, as fetched above.
- `repo:<path>:<line>` is a line in this repository.
- **Fact** marks something read directly from a source. **Inference** marks my interpretation, which the sources do not state.

## Answer

1. **Truncation did not cause any of the four uncertain judgments** (fact). The renderer refuses a truncated snapshot (`repo:src/scripted/observe.ts:26`), none of the four states was truncated, and their sizes (7.4 to 14.0 KB) sit inside the range of decisive states (2.4 to 20.3 KB).
2. **The claims share a pattern.** Each uncertain claim was correct or incorrect because of something the text observation shows only *implicitly* (inference from the facts in §1 and §2):
   - an **absence** with no visible marker: an empty field that has no `value` key at all, or "no additional reminders" beyond the rows on screen;
   - an **unobservable state**: "saved" inferred from editor chrome.
   Claims about absence that the screen states outright ("No Results", "0 reminders") scored 0.97 to 0.98.
3. **The Reminders claim bundled three kinds of judgment.** A directly visible total ("2 Completed"), a count of one row, and a universal negative about rows that might lie off screen. Each status claim, and every compound claim that joins directly visible facts (up to four), scored 0.97 or 0.98. So neither compounding nor small counts alone explains the 0.87 (inference). The negative is the part the observation cannot support. The checkpoint guard had already checked every other part of it in code.
4. **TypeSafe's guidance fits this pattern** (fact). One yes/no per Noul. Negations and scoping words are read literally. Counting is unreliable, so count in code. Indirection costs accuracy. Irrelevant state costs accuracy. Calibration holds across groups, not for a single answer. Pin the versioned model ID once thresholds are tuned. TypeSafe does not promise determinism: across 15 perturbed repeats, jev-1.13.0 had a mean per-question std dev of 0.0102, and it states "the model is no more deterministic" for an uncertainty band.
5. **Recommendation.** Keep 0.9/0.1. Adopt evidence-backed authoring rules, and move totals and "nothing else" checks into guards or into claims about on-screen text. Split compound claims when a part is anything but directly visible text. Do not re-ask the same request, and do not re-observe an unchanged screen. Treat observation-shape changes (explicit empty values, keeping the "1 page" scroll-bar evidence, dropping bare elements) as hypotheses to test on a frozen corpus before adopting them. Lowering the upper bound to 0.83 or below would have produced a false pass in existing project data.

## The zero-confidently-wrong record

"Confidently wrong" means the probability was at least 0.9 on a false claim, or at most 0.1 on a true one. Jev returned two-decimal probabilities in every archived judgment (fact).

| Dataset | Judge wording | Judgments | Uncertain | Confidently wrong | Source |
| --- | --- | ---: | ---: | ---: | --- |
| Frozen scripted evaluation, 24 screens | Production (`ASSERTION_QUESTION`) | 48 (24 true, 24 false) | 3 | 0 | [results.md](../../spikes/scripted/results/evaluation/results.md) |
| Benchmark and integration runs | Production | 36 | 1 (Reminders `counts`) | 0 | journals under `spikes/benchmarks/results/` and `spikes/scripted/integration/results/` |
| Feasibility v1 to v3, configurations A to D | Older, goal-oriented wording in a richer state | 216 (34 true, 182 false) | 27 | 0 | `spikes/feasibility/results*/*/*.partial.jsonl` |

**Caveat** (inference). These are not independent draws. The feasibility rounds asked the same claim over four observation shapes, and two tuning cases repeat across v1 and v2. The feasibility judge used `'Does the current observation establish this specific scenario claim?'` with goal and history in the state (`repo:src/jev/index.ts:17`). Production uses `'Does the visible evidence on this current screen support this specific claim?'` (`repo:src/scripted/jev.ts:9`). Treat the feasibility rows as the same model on similar claims, not the production judge.

## 1. The Reminders case

**Facts from the run.** The checkpoint `verifyFinalList` sent one request with four Noul questions over a 7,383-byte, 61-element observation (journal event 35, judgment event 36, 3,164 input tokens, `jev-1.13.0`):

| Claim | Probability |
| --- | ---: |
| Buy milk benchmark is completed in MCP Benchmark List. | 0.97 |
| Call team benchmark is completed in MCP Benchmark List. | 0.97 |
| File report benchmark remains incomplete in MCP Benchmark List. | 0.97 |
| The saved list has exactly two completed reminders and one incomplete reminder, with no additional reminders. | **0.87** |

The screenshot shows the title, "2 Completed • Clear", one incomplete row, two completed rows, and blank space below them. That blank space tells a person the list has ended. The text observation has no equivalent element.

**What the observation offered for each part of the `counts` claim** (fact, from event 35 `assertionObservation`):

| Part of the claim | Evidence in the text Jev saw | Also enforced by the checkpoint guard? |
| --- | --- | --- |
| "exactly two completed" | `text` label `2 Completed`, plus two rows labelled `…, Completed` | Yes. `2 Completed` and both completed rows are `present` selectors, and each must match exactly one visible element (`repo:src/scripted/select.ts:106-110`). |
| "one incomplete" | One row labelled `…, Incomplete`. No summary text. | The row is a `present` selector. No guard forbade a second one. |
| "with no additional reminders" | Nothing positive. The table's `text` elements extend beyond the 956-pt screen (`y: 222.33, height: 2044` and `y: -1744, height: 1966.33`). The capture's two `Vertical scroll bar, 1 page 0%` sliders, which appear in the observation summary, were dropped by `isScrollBar` (`repo:src/scripted/observe.ts:13-15`). | No. Guards can forbid specific selectors, not "any other row". |
| "The saved list" | Nothing marks "saved". It is implied by the list being shown. | n/a |

Also (fact): 42 of the 61 rendered elements have no label, value, or identifier. They are bare `other` and `text` boxes that `isVisibleEvidence` keeps because of their role or their actions (`repo:src/scripted/observe.ts:17-23`), while the renderer omits the actions themselves.

**Contrasts from other archived runs** (fact):

- **Compound claims of directly visible facts stayed decisive.** Weather `units` (four conjuncts) scored 0.98 in two separate runs. `display` (three conjuncts) scored 0.97 twice. Contacts `identity` scored 0.92; it adds the tolerance clause "allowing case differences".
- **Small counts of visible rows stayed decisive, at the low end.** "Two separate Tessa Vale rows are visible" scored 0.98 (s07). "…search results show two Tessa Vale rows" scored 0.95 (s15). "…shows six phone number fields" scored 0.94 (s08).
- **Absence claims were decisive when the app prints the absence.** "Contacts shows No Results for Nina Calder" scored 0.97 (s14) and 0.98 in two bridge runs. "My Lists shows a Signal Kit row with 0 reminders" scored 0.98 (s18).

**Cause, ranked** (inference):

1. The universal negative "no additional reminders" is the most likely cause. The observation has no positive evidence that the list ends, and it does contain frames reaching far below the screen. The docs name this failure mode: negations and scoping words are "read at face value" (`docs:model-jaggedness/jev-1.13.md:31`).
2. Counting and bundling are contributing. The docs say "does not count reliably" (`docs:model-jaggedness/jev-1.13.md:41`), "Ask one yes/no question per Noul… the value means less" (`docs:primitives/noul.md:382`), and list "Hiding several judgments inside one question" among things to avoid (`docs:model-jaggedness/jev-1.13.md:149`). But the data above shows that neither alone pulled a claim below 0.94.
3. The distracting bare elements and the word "saved" are possible minor contributors (`docs:model-jaggedness/jev-1.13.md:90,96`). Nothing archived isolates them.

I cannot rank these causes more precisely without new calls. The experiment is below.

## 2. The three uncertain judgments in the scripted corpus

**Facts** (from [results.md](../../spikes/scripted/results/evaluation/results.md) and [corpus.json](../../spikes/scripted/corpus/corpus.json)):

| Case | Claim | Truth | Probability | State |
| --- | --- | --- | ---: | --- |
| s16-reminders-new-list-blank | The New List form shows an empty List Name field. | true | 0.80 | 114 elements, 14,002 B |
| s19-reminders-charge-lantern-note-empty | The Charge lantern editor has an empty Notes field. | true | 0.78 | 69 elements, 7,973 B |
| s11-contacts-nolan-new-email-unsaved | The foreground Nolan Ames screen is the saved contact card with an Edit button. | false | 0.22 | 111 elements, 13,755 B |

(Element and byte counts come from re-running the renderer's rules offline over the corpus snapshots.)

**What they share.**

- **s16 and s19 assert emptiness, and the observation cannot show it** (fact). The empty field is captured with no `value` key at all. s16's is `{"role":"text-field","label":"List Name",…}`, and s19's is `{"role":"text-field","label":"Notes","identifier":"Notes text view",…}`. When the field has content, the key appears (s20: `"value":"Use green cable"`). Across all 24 raw corpus snapshots, no element carries `"value": ""`. So "empty" can only be inferred from a key that is missing. The renderer passes that absence through unchanged (`repo:src/scripted/observe.ts:32`).
- **The same model rejects false emptiness claims confidently when content is visible** (fact). "The Charge lantern Notes field is empty" scored 0.01 (s20). "The Charge lantern list row has no note text" scored 0.02 (s21). "The Signal Kit list has no reminders" scored 0.03 in an integration run. The asymmetry is the finding: Jev refutes an absence claim when a positive token contradicts it, but it will not confirm an absence that has no token.
- **s11 is the "saved" indirection** (fact). The screen is the Edit form: a `Done` button, a `close` button, and editable `text-field`s holding the new email. It has no `Edit` button. The claim bundles "foreground", "saved contact card", and "with an Edit button". The feasibility rounds show the same family nearer to a false pass. Every false claim that scored 0.64 or higher in all project data is about saved or selected state that has to be inferred from the chrome:

  | Feasibility case | False claim | Probability |
  | --- | --- | ---: |
  | v2-c05 | The saved Noah Reed contact card visibly shows noah.new@example.test. | **0.83** |
  | v2-r04 | The saved list title on this screen is Market Errands. | 0.74 |
  | v3-c05 | A saved Iris Moss card visibly shows iris.new@example.test. | 0.74 |
  | v3-r02 | A saved Pack batteries reminder row visibly includes Bring charger. | 0.69 |
  | v2-w01 | The current screen visibly shows Celsius selected. | 0.64 |

  In each saved-card case the named value *was* visible, in an unsaved editor (inference, consistent with "a property of a property… costs accuracy", `docs:model-jaggedness/jev-1.13.md:90`). The bridge skill already tells authors that "a visible editor does not establish whether backend storage has committed" (`repo:skills/test-ios/SKILL.md:14`).
- **Not the cause: size or truncation** (fact). None of the snapshots is truncated. Decisive cases in the same corpus span 2,449 to 20,313 bytes. s09, the largest at 20,313, scored 0.96 and 0.01.

**Observation shape can move a probability by about 0.2 on the same claim** (fact, feasibility). For the true claim "On/Off Labels is visibly enabled" (t04), the four configurations returned 0.85 (compact, no history), 0.94 (compact, history), 0.78 (full, no history), and 0.95 (full, history). A re-run of v2 on the same screen gave 0.81, 0.93, 0.74, and 0.93. This shows how shape-sensitive borderline claims are. The feasibility state and question differ from production.

## 3. What TypeSafe currently documents

All facts below are from the live docs as fetched on 2026-09-25.

**Noul phrasing**

- Ask one yes/no question per Noul. With two conditions, "the model has to judge both at once and the value means less. Ask two Nouls and combine them in code." (`docs:primitives/noul.md:382`)
- Phrase the question so that a high value means yes. "A statement works as well as a question" (`docs:primitives/noul.md:384,386`). The bridge sends the claim as a statement inside a structured `instructions` object, `{question, claim}`, with no `criteria` (`repo:src/scripted/jev.ts:38`).
- Make the yes/no boundary unambiguous. "When the boundary is subtle, add `criteria`… try your questions with and without `criteria`" (`docs:primitives/noul.md:388`).
- Read literally: "Scoping words, negations, and implied conditions are read at face value… split it into two literal questions and combine them in code." (`docs:model-jaggedness/jev-1.13.md:31-33`)
- Counting: "does not count reliably… the error grows with the size of the thing being counted… count in code… ask one question for each [candidate], then add up the answers yourself" (`docs:model-jaggedness/jev-1.13.md:41-45`).
- Indirection and large state: double negatives and multi-hop questions "are answered less reliably". "Accuracy falls as the state grows with content unrelated to the decision" (`docs:model-jaggedness/jev-1.13.md:90,96`).
- Structural invariants: a Noul and its negation need not sum to 1 (0.72 + 0.47 in the docs' example). "word questions to mean directly what you want" (`docs:model-jaggedness/jev-1.13.md:129-137`).
- Emptiness in TypeSafe's own verifier recipe is decided **in code** and then stated to the model: "The `extracted_field` is empty, null, or an empty collection. Does the source text contain…" (`docs:cookbooks/sde_cascade.md:352,422`).

**Calibration and thresholds**

- "Calibration is measured across groups of predictions; it does not guarantee that an individual answer is correct." (`docs:concepts/system-one.md:21`) "Outcomes assigned a probability of `0.8` should occur about 80% of the time." (`docs:introduction/machine-learning-primer.md:60-63`)
- A Noul has no separate confidence. "A value near 0.5 means the model gives yes and no similar probability." (`docs:primitives/noul.md:339,354`)
- On where to set the threshold: raise it "when acting on a false yes is expensive… Values in the middle can go to a person" (`docs:primitives/noul.md:367`). Thresholds "depend on your domain… Start with conservative thresholds, test with your own data" (`docs:confidence.md:219`).
- Medium confidence may call for "gather[ing] more information before acting". Low confidence can mean "the state doesn't contain enough to go on" (`docs:confidence.md:157,171`).

**Determinism and repeated sampling**

- TypeSafe's marketing says System One "is designed to return stable answers across repeated evaluations" (`docs:concepts/how-to-build-with-system-one.md:297-298`). The jaggedness page says it "is extremely consistent… quantitatively similar outputs for semantically similar inputs" (`docs:model-jaggedness/jev-1.13.md:118`). No page promises bit-identical answers, and the API has no seed or temperature field.
- The **Self-consistency: nouls** cookbook ran 15 repeats of 14 Nouls on `jev-latest` (all 15 answered by `jev-1.13.0`), with a throwaway `uid` field changed on each call. Mean per-question std dev was **0.0102**. The widest spread was `covered`, from 0.43 to 0.53 (`docs:cookbooks/consistency_noul_cookbook.md:30-32,467,527`). The cookbook states that this setup "cannot separate sensitivity to the irrelevant field from variation that would occur on identical requests" (`:201`). Its illustrative 0.30 to 0.70 review band "is neither a calibrated guarantee nor an optimized threshold", and "the model is no more deterministic for it" (`:629-633,682`).
- The **Self-consistency: choices** cookbook found mean std dev 0.0098 and max 0.0515. TypeSafe flipped its top label on 2 of 8 questions (`docs:cookbooks/consistency_choice_cookbook.md:36,849-852`).
- **Project data point** (fact). Weather `verifySettings` sent the same request in two runs: identical recorded observation text (the same SHA-256 over the journal's redacted copy), identical claims, 5,602 input tokens each. Both returned `units` 0.98 and `display` 0.97 (weather-bridge-attempt1 and -attempt2 journals). That is one identical-request pair, not a determinism proof.

**Model versioning**

- Aliases move when a release ships, "so the answers behind it can change without a change on your side… If you have tuned confidence thresholds against a specific version, pin that version's ID" (`docs:models.md:40`). `jev-latest` and `jev-preview` both point to `jev-1.13.0`, and "There is no preview build available right now" (`docs:models.md:37`).
- The jaggedness page says many listed failure modes "will be fixed in later versions" (`docs:model-jaggedness/jev-1.13.md:7`). I found no model changelog, and no deprecation or sunset wording on any fetched page (grep for `deprecat|sunset|retire|end of life`). Four cookbooks still report numbers from `jev-1.12`.
- The bridge already pins `jev-1.13.0` (`repo:src/scripted/jev.ts:8`). It rejects any response whose `model` differs as `MALFORMED_RESPONSE` (`:53`), and logs `model` on every judgment event (`repo:src/scripted/run.ts:281`).

## 4. Options and what each does to the record

"Record" means zero confidently wrong judgments at 0.9/0.1. The counts below re-score archived probabilities. Re-scoring cannot reveal errors that a new wording or observation would introduce.

| Option | Would it have resolved the four uncertain cases? | Effect on the zero-confidently-wrong record | Evidence strength |
| --- | --- | --- | --- |
| **Split compound claims** | Localizes the problem, but only partly resolves it. The directly visible parts should become decisive, going by the 0.97 to 0.98 scored by visible-fact claims. "No additional reminders" stays unsupported on its own, as does "saved card" in s11. | **Neutral.** Each part still faces 0.9/0.1, so no new pass is created by policy. The risk is coverage: if authors drop the unsupported part to get a pass, the script verifies less. An extra reminder row would then pass. | Docs: strong (`noul.md:382`). Project data: indirect, since compounds of visible facts did not need splitting. |
| **Authoring rules** (below) | Yes for all four, by not asking those claims. Totals come from app text or guards, and emptiness or "saved" claims move to screens that show a positive marker. | **Neutral to protective.** Bounds are unchanged. The rules steer claims into the region where every archived judgment was decisive and correct, and away from the one family (inferred "saved" state) that produced the false-claim 0.83. | Project data: moderate (the contrasts in §1 and §2). Docs: strong. |
| **Move totals and "nothing else" checks into guards** | Yes for the parts code can see. `present` already enforces exactly one visible match, and `absent` forbids a selector. | **Protective for Jev**, since code decides, but the semantics change. A guard failure makes the run *inconclusive* (`GUARD_MISSING/AMBIGUOUS/FORBIDDEN`), not *failed*, so a real bug surfaces as abstention. Guards see only visible elements, so off-screen rows are still unproven. | Code: fact (`select.ts:106-113`). |
| **Change observation shape** (explicit empty values, keep the "1 page" scroll-bar signal, drop bare elements) | Plausible for s16, s19, and Reminders. Untested. | **Unknown and possibly harmful.** Rendering `value: ""` when the device omits `value` asserts something the device layer did not say, for example on a secure or custom field whose content is not exposed. That could create a confident false "empty". A shape change moved a borderline claim by about 0.2 in feasibility. Needs a frozen re-evaluation. | Hypothesis. Docs support filtering state (`jaggedness:96`) and deciding emptiness in code (`sde_cascade:352,422`). |
| **Re-observe before judging** (same screen) | Very unlikely. A static screen yields the same or a semantically equal observation. The one identical-request pair reproduced exactly, and documented repeat spread is about 0.01. | **Neutral if judged once on the latest observation.** "Re-observe until decisive" is a disguised re-ask: it selects among near-identical samples, and the upward pick risks laundering a guess. Re-observing *after an authored action that adds evidence*, such as scrolling to the end of a list, is a different, legitimate step. | Project: one pair. Docs: std dev 0.0102 with perturbation. |
| **Bounded re-asks** (same request) | No. Moving 0.87 to 0.90 would take about three documented std devs. | **Harmful or pointless.** Accepting any decisive answer out of N adds false-pass risk exactly at the borderline. Requiring all N to agree can only add abstentions. A re-ask with bridge-reworded claims changes who authored the claim and must not be silent. | Docs: `consistency_noul_cookbook.md:201,682`. |
| **Lower the bounds** | 0.85/0.15 resolves only Reminders (0.87). The scripted 0.80, 0.78, and 0.22 stay uncertain. 0.75/0.25 resolves all four. | **Breaks the record at an upper bound of 0.83 or below.** Feasibility v2-c05 (false, 0.83) becomes a false pass at 0.8/0.2. 0.7/0.3 adds three confidently wrong answers. 0.85 keeps a 0.02 margin on data from a different judge wording. At 0.87 a calibrated model expects roughly 1 in 8 such claims to be false in aggregate (inference from `machine-learning-primer.md:60`). | Project data: re-scored below. |
| **Raise the bounds** (0.95/0.05) | Adds abstentions: 7 of 48 scripted, 52 of 216 feasibility, 2 of 36 benchmark (Contacts identity at 0.92 would abstain). | Removes no archived error, because there were none. It makes passing harder. | Project data. |

**Re-scoring archived probabilities** (fact, computed from the files cited in the record table):

| Bounds | Scripted (48): wrong / uncertain | Benchmark and integration (36) | Feasibility (216) |
| --- | --- | --- | --- |
| 0.95 / 0.05 | 0 / 7 | 0 / 2 | 0 / 52 |
| **0.90 / 0.10 (current)** | **0 / 3** | **0 / 1** | **0 / 27** |
| 0.85 / 0.15 | 0 / 3 | 0 / 0 | 0 / 18 |
| 0.80 / 0.20 | 0 / 2 | 0 / 0 | **1** / 11 |
| 0.75 / 0.25 | 0 / 0 | 0 / 0 | **1** / 9 |
| 0.70 / 0.30 | 0 / 0 | 0 / 0 | **3** / 3 |

**Authoring rules the data supports.** Each rule cites its evidence. Ticket 07 decides whether the schema enforces a rule or the skill teaches it.

1. **One kind of evidence per claim.** Don't mix a directly visible fact with a count, a negative, or an inferred state. Compounds of directly visible facts were decisive (Weather `units` and `display`), so "one fact per claim" is stricter than the data requires, but it is what TypeSafe advises (`noul.md:382`).
2. **Assert absence only through an on-screen marker.** Examples: "No Results for …" (0.97 to 0.98) and "0 reminders" (0.98). Don't assert an empty field, "nothing else", or "no additional …" about lists (0.78, 0.80, 0.87).
3. **Don't count rows in a claim.** Cite the app's own total text ("2 Completed"), or let guards enforce uniqueness and forbidden selectors. Small visible counts scored 0.94 to 0.98; 0.94 and 0.95 are the lowest decisive true values in the scripted corpus. The docs say the error grows with size.
4. **Claim persisted state only on the post-save screen, and name its visible marks.** Examples: "The contact card shows an Edit button and nolan.final@example.test". Don't use "saved"/"foreground" adjectives on an editor screen. This family produced the highest false-claim probabilities in the project (0.64 to 0.83). On a real saved card, the true claim "A saved … card is open and shows organization …, allowing case differences" still scored only 0.92, the lowest benchmark pass.
5. **Keep claims about the current viewport.** The frozen corpus's off-screen email case (s08) was judged correctly (0.02 on the false "visible" claim). No archived case tests a claim about content above or below the viewport being absent.

## Recommendation (inference)

- **Keep 0.9/0.1.** Current data gives no bound below 0.9 that removes meaningful abstention without approaching the 0.83 false claim. 0.85 would have passed only the Reminders `counts` claim.
- **Adopt authoring rules 1 to 4** and rewrite the Reminders checkpoint to fit them. The three status claims plus "The list header reads 2 Completed" cover every visible fact. Add a guard `absent` for any known distractor. State in the report that "no other reminders" is unverified, rather than asking Jev.
- **No same-request re-asks and no re-observation of an unchanged screen.** If ticket 07 wants a recovery path, make it an *authored* evidence step: scroll to the list end, or open the saved card. Record it as a normal step, so a guess cannot be laundered into a pass.
- **Pin and record the model** as the bridge already does. Treat any model change as requiring a re-run of the frozen scripted corpus (and this doc's re-scoring) before adoption, because the documented jagged edges are expected to change.
- **Test before adopting observation-shape changes.**

## What would settle the open causal questions

No calls were made for this ticket. If ticket 07 needs causal certainty, a pre-registered run of about 20 Noul questions over two saved states costs well under $0.001 at the documented $0.042 per million input tokens. Freeze the wording before any call:

1. **Reminders, event-35 state, unredacted locally, one request:**
   - the original `counts` claim;
   - "The list header reads 2 Completed";
   - "Exactly one reminder row is marked Incomplete";
   - "The list contains no reminders other than the three named ones";
   - "The list shows exactly three reminder rows".
2. **The same request twice more, unchanged.** This tests identical-request reproducibility beyond the Weather pair.
3. **The same five claims over two observation variants:** scroll-bar sliders kept, and bare elements dropped.
4. **s16 and s19 with `value: ""` rendered for text fields.** Add a negative control: a populated field whose value is withheld from the state, to see whether explicit emptiness creates confident false passes.

## Side findings

- **A guard selector with `value: ''` probably cannot match these empty fields** (inference). `matches` compares `element.value === ''` (`repo:src/scripted/select.ts:29-33`). The captured empty fields have no `value` key, and no raw corpus snapshot contains `"value": ""`. The skill says "An empty value is allowed" in selectors (`repo:skills/test-ios/SKILL.md:13`), and unit tests build elements with `value: ''` (`repo:tests/scripted-run.test.ts:117`). A real empty field may therefore produce `GUARD_MISSING` rather than a match. Verify against a live capture before relying on empty-value guards.
- **The checkpoint rule ranks uncertain above false** (fact). A checkpoint with one uncertain and one confidently false claim is *inconclusive* (`repo:src/scripted/run.ts:286-287`). Ticket 07 may want to confirm that this ordering is intended.

## Unverified

- Which part of the Reminders `counts` claim caused the 0.87. The ranking in §1 is inference, and the experiment above would settle it.
- Whether identical requests to `jev-1.13.0` always return identical probabilities. One project pair matched, while TypeSafe's cookbooks measured only perturbed repeats.
- Whether `value` is absent for every empty field type in MobileBuildMCP 2.7.1 captures (24 snapshots examined), and whether absence can also mean "not exposed".
- Whether Jev uses scroll-bar "1 page" text as evidence that nothing lies off screen.
- TypeSafe's deprecation policy for `jev-1.13.0`, and what the API returns for a retired version ID. The bridge would map a non-auth 4xx or 5xx to `SERVICE` and stop inconclusively (inference from `repo:src/scripted/jev.ts` `requestError`).
