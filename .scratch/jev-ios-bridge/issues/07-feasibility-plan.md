# Feasibility plan: the go/no-go bar and the step questions

Type: grilling
Status: resolved
Blocked by: none

## Question

What would convince us that Jev can carry a run, and what exactly will we ask it at each step?

Every design ticket assumes Jev can choose actions. TypeSafe publishes no cookbook for choosing UI actions, and describes its models as "not agents" (see "Jev today: model, API, SDK, limits"). This ticket fixes the test before any result exists, so the result cannot move the goalposts.

Decide:

- **The step question set.** This covers every judgment the loop needs from one request:
  - the action type: tap, type, swipe, wait, or stop;
  - the target candidate;
  - which scenario value to type, chosen from values the scenario supplies, since Jev cannot write text;
  - "none" and "blocked" options;
  - a "done" judgment;
  - the assertions.

  Start from the illustrative request in the Jev research note. Settle whether action type and target are one Choice or two.
- **The go/no-go bar.** The bar has two parts:
  - top-1 accuracy;
  - how many steps clear a confidence threshold, and how accurate those steps are.
- **The corpus.** Which of the apps in "Local environment" to use, which goals, and how many snapshots (20 to 30). Also who labels the correct answer for each snapshot, and how.
- **The variations to test:**
  - compact versus full snapshot data;
  - with and without step history;
  - the number of candidates;
  - one phrasing that refers to position, such as "the second row".

Resolve with the question set, the bar, and the corpus plan. "Feasibility run: measure Jev on real screens" carries them out.

## Answer

The owner accepted Q1 through Q3 and Q4 through Q6 in two conversation rounds on 2026-09-24. This is an exploratory gate for the next prototype, not evidence of production reliability. No Jev evaluation was performed while settling this plan.

### Corpus and labels

Use 30 cases from Settings, Contacts, and Reminders, with synthetic data on the dedicated simulator. Each case records:

- the scenario goal and supplied values;
- the captured screen and relevant step history;
- the complete action choices;
- the set of acceptable next actions, allowing several valid choices;
- whether the goal is reached and the expected answer to each assertion.

Cover tapping, typing, scrolling, waiting, completion, observed blockers, duplicate labels, small and crowded candidate lists, and a positional instruction such as "the second row". Goals should exercise changing a setting, creating or finding a synthetic contact, and creating or completing a synthetic reminder. These goal examples are preparation defaults; the owner reviews the actual cases before evaluation.

Reserve 10 cases for tuning and 20 for held-out evaluation. Keep cases from the same scenario, including alternate phrasings of the same screen, in one partition. Fix the split before querying Jev. Include known failing assertions in the held-out partition so the false-pass check has evidence.

The agent prepares the cases and proposes labels. The owner reviews and settles the acceptable actions, completion labels, and assertion labels before Jev evaluates those cases. If a capture cannot support a label, revise or replace it before freezing the corpus. Preserve the reviewed labels separately from the state sent to Jev.

### Step questions

Pin the model to `jev-1.13.0` as required by [Feasibility run](08-feasibility-run.md). Send one request per case and configuration, with these questions:

| Question | Type | Meaning |
| --- | --- | --- |
| `next_action` | Choice | Which complete listed action is the appropriate next step toward the scenario goal, given the observation and supplied history? |
| `goal_reached` | Noul | Does the observation establish that the scenario goal has been reached? |
| One question per assertion | Noul | Does the observation establish the scenario's specific claim? |

Each action Choice option binds its operation, target, and any supplied value or direction together. Examples are "Tap Sign In", "Type the scenario's email value into Email", and "Swipe down within the results list". Jev never generates text to type, and separate questions never select an action's arguments.

Include these non-input options:

- **Wait:** the next appropriate step is to wait for the screen to change.
- **Stop: goal reached:** the goal is already achieved.
- **Stop: blocked:** the observation shows a blocker preventing progress toward the goal.
- **None:** no listed action fits; this does not itself establish an observed blocker.

Ask every assertion in this experiment. This does not settle production assertion timing or support ordered assertions. Questions in the same request are independent; contradictory answers cause abstention.

The reviewed corpus and frozen experiment manifest must contain the exact rendered question strings, option descriptions, assertion criteria, and gate logic before held-out evaluation. The table above fixes their responsibilities, not unseen app-specific wording. Keep the action Choice within the documented 255-option limit, including non-input options.

### Observation comparisons

Run these four configurations on the same 10 tuning cases:

| Configuration | Observation | History |
| --- | --- | --- |
| A | Compact | None |
| B | Compact | Recent steps |
| C | Filtered full snapshot | None |
| D | Filtered full snapshot | Recent steps |

Use the same action choices across configurations wherever possible. Record differences when compact data omits a target; do not silently supply missing full-snapshot fields to a compact observation. Include small and crowded candidate lists and a paired positional-phrasing comparison within the tuning partition. A phrasing variant does not count as another independent screen.

Freeze the filtering rules, history window and rendering, action enumeration, and question wording with the selected configuration before held-out evaluation. These are experiment settings, not the final observation schema. Record token use and latency alongside quality so the next design tickets can use the evidence.

### Gates and selection

Try Choice confidence thresholds of 0.6, 0.7, 0.8, and 0.9 on tuning cases. For each configuration, choose the threshold with the greatest accepted coverage and zero accepted incorrect actions. A threshold accepting no cases does not qualify. If none qualifies, revise the design before touching held-out cases.

Use separate Noul probability gates: at least 0.9 means yes, at most 0.1 means no, and values between them mean uncertain. These gates apply to completion and assertions. An assertion's probability is not Choice confidence.

Select one qualifying configuration and threshold using tuning results only. For reproducibility, the preparation default is to break coverage ties by top-1 correctness, then lower total input-token use, then configuration order A through D and ascending threshold. Record this rule in the manifest before tuning; it was not a separate owner decision.

Count an accepted case only when the selected action clears the Choice threshold and passes the consistency gates. `none`, malformed responses, request failures, and contradictory answers abstain. For the harness, use these explicit consistency defaults and freeze them before evaluation:

- Stop: goal reached requires a yes completion judgment.
- A continuing action, wait, or stop: blocked requires a no completion judgment. Uncertain completion abstains.
- A failed or uncertain assertion does not by itself invalidate a continuing action: the scenario may not have reached the assertion's condition yet.
- A completed case supports a passed verdict only when every assertion is yes. Any uncertain assertion prevents a definitive verdict; with no uncertainty, a no assertion supports failed.

These defaults make the accepted abstention recommendation executable; they do not resolve the production [Step-loop policy](11-step-loop-policy.md).

### Held-out go/no-go bar

Evaluate the chosen frozen configuration on all 20 held-out cases. Require all three conditions:

1. At least **18/20** top-1 action choices match the reviewed acceptable-action sets, before confidence gating.
2. At least **16/20** cases are accepted, with **zero incorrect actions among accepted cases**.
3. **Zero known failing assertions are judged to pass:** no assertion labelled false receives a Noul probability of at least 0.9, even in a case where the action gate abstains.

Report coverage as accepted cases divided by 20, and accepted-action accuracy as correct accepted cases divided by accepted cases. Report the count of known failing assertions beside the false-pass count. Request failures remain in the denominator and cannot count as correct or accepted. Record them separately from incorrect judgments.

Do not tune against held-out outcomes. A failed evaluation remains recorded as a failure. A revised design needs fresh held-out cases. Passing this gate supplies evidence for the owner-reviewed go/no-go decision in [Feasibility run](08-feasibility-run.md); resolving this plan does not accept ADR-0001.

### Execution prerequisites and output

[Local environment](06-local-environment.md) remains a prerequisite. At plan resolution, the repo instructions say the API key is a placeholder; the owner must supply a real key before live Jev requests. Never print or copy the key.

Before evaluation, finish the reviewed corpus and freeze its split, labels, question templates, candidate rules, filtering, history, thresholds, and model in the experiment manifest. The feasibility harness then records each case's judgments, probabilities, Choice confidence, acceptance or abstention reason, correctness, input tokens, and latency. Return the tuning comparison, held-out results, and owner-reviewed go/no-go call as ticket 08's evidence.
