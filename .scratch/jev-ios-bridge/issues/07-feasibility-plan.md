# Feasibility plan: the go/no-go bar and the step questions

Type: grilling
Status: open
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
