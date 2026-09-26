# Observation-shape experiment: pre-registration

Written and committed before any Jev call, for phase 3 of the [v1.0.0 release spec](../../.scratch/v1-release/release-spec.md). The rules come from [Assertion policy for 1.0](../../.scratch/v1-release/issues/07-assertion-policy.md) items 6–7 and [ADR-0004](../../docs/adr/0004-fixed-assertion-bounds-single-judgment.md). The candidate changes come from [`assertion-uncertainty.md`](../../docs/research/assertion-uncertainty.md), in "Options" and "What would settle the open causal questions".

## Question

Does either candidate change to the text Jev sees make checkpoint judgments more decisive, without creating a confidently wrong answer? If one does, 1.0 adopts it. Otherwise 1.0 ships today's shape (`visible-full-text-v1`).

## Fixed conditions

- **Model and question:** `jev-1.13.0`, the production judge (`src/scripted/jev.ts`): one Noul question per claim, `ASSERTION_QUESTION` unchanged.
- **Bounds:** 0.9 and 0.1. A claim is *confidently wrong* when a false claim scores ≥ 0.9 or a true claim scores ≤ 0.1. It's *uncertain* when it scores strictly between 0.1 and 0.9.
- **Requests:** each state and claim set is sent once, with no re-asks, except where a repeat is itself the thing being measured (R-repeat below).

## Variants of the rendered state

| Id | Change from production `renderAssertionState` |
| --- | --- |
| V0 | None (today's `visible-full-text-v1`). |
| A | **Explicit empty values:** a visible `text-field` element that has no `value` is rendered with `"value":""`. |
| B | **Scroll evidence kept:** scroll-bar sliders (`Vertical/Horizontal scroll bar, N page(s)`), which V0 drops, are rendered like any other element. |
| AB | A and B together. |

## Cases

1. **Frozen corpus:** all 24 screens of `spikes/scripted/corpus/corpus.json` (48 labelled claims, one true and one false per screen), each under V0, A, B, and AB. That's 96 requests.
2. **Reminders `verifyFinalList`** (journal event 35 of `spikes/benchmarks/results/reminders-bridge-attempt1`). The logged state was redacted, so it's rebuilt unredacted from the script's values and the event-35 screenshot. The list title is "MCP Benchmark List"; the rows are "File report benchmark, Incomplete", "Buy milk benchmark, Completed", and "Call team benchmark, Completed". There are five claims, all expected true: the original `counts` claim; "The list header reads 2 Completed"; "Exactly one reminder row is marked Incomplete"; "The list contains no reminders other than the three named ones"; and "The list shows exactly three reminder rows".
   - **R-V0, R-repeat:** V0 three times, unchanged, to test whether identical requests reproduce.
   - **R-B:** V0 plus the four scroll-bar sliders recorded in that step's `observationSummary`. Their frames weren't logged, so they're rendered without frames.
3. **Negative controls** for A: a populated field whose value is withheld from the state, with a claim that it is empty. That claim is truly false.
   - **NC1:** s20 (Charge lantern), with the Notes field's value "Use green cable" removed. Claim: "The Charge lantern Notes field is empty."
   - **NC2:** s01 (Weather search), with the search field's value "Ber" removed. Claim: "The location search field is empty."

   Each runs under V0 and A, for 4 requests.

Total: 96 + 4 + 4 = 104 requests.

## Decision rule

A candidate C (A, B, or AB) **passes** only if all of these hold:

1. **Corpus gate:** on the 48 corpus claims under C, zero are confidently wrong and at most 3 are uncertain.
2. **Improvement:** under C, the corpus has fewer uncertain claims than V0 in this same run, **or** the Reminders "no other reminders" and `counts` claims become decisive and correct (R-B, for candidates that include B), while condition 1 still holds.
3. **Controls:** for candidates that include A, neither negative control scores ≥ 0.9 under A. A "confident empty" on a field whose content was only withheld is the harm the research predicted.

**Adoption:**
- If more than one candidate passes, adopt the one with the fewest corpus uncertain claims. Break ties by the fewest changes (A or B before AB).
- If none passes, keep V0 and record why.
- An adopted shape ships as projection rule `visible-full-text-v2`. It gets a parity test showing that the new renderer reproduces exactly the text this experiment sent.

**ADR-0004's second gate** is zero confidently wrong when the 300 archived judgments are re-scored. Those probabilities are archived, so a shape change doesn't alter their re-scoring (0 wrong at 0.9/0.1, per `assertion-uncertainty.md`). This run's 48 corpus claims are the shape test.

## Recorded

The script writes `results.json`, with every request's variant, case, claims, probabilities, input tokens, and latency. It then writes `results.md` with the tables and the decision. No state text containing personal data is involved: the corpus and benchmark apps use synthetic data.
