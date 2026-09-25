# Step-loop policy: limits, thresholds, stop rules, escalation

Type: grilling
Status: resolved
Blocked by: 21, 09, 10

## Question

What rules govern a run? Decide:

- **Default limits** for steps and wall-clock time. One SDK call can take about 31.5 s with default retries, or about 150 s when it honours `Retry-After`.
- **Thresholds**, calibrated on data from "Feasibility run: measure Jev on real screens". Choice confidence depends on the number of candidates. Noul answers carry only a probability.
- **When assertions are checked:** at every step, or only once Jev judges the scenario done. Ordered assertions from "Scenario language: goals, assertions, typed values" constrain this.
- **Loop and repeat detection**, ignoring the status bar.
- **What ends a run** as passed, failed, or inconclusive. This includes whether "blocked" counts as a failure.
- **Interruption:** what a cancelled tool call, SIGINT, or SIGTERM leaves behind. A killed stdio server has no open call to return a report to, so decide what the run log records and how the host agent learns the outcome later.
- **Escalation:** does low confidence end the run as inconclusive, or hand the step to the host agent? Escalating means ending the tool call and resuming in a new one with a run handle. Claude can only pick elements that are already in the snapshot.

## Answer

Use the explicit-script runner; Jev does not select actions or decide when a goal is complete. Default to 100 script steps and 300,000 ms for the whole run; allow explicit limits up to 100 steps and 3,600,000 ms. Each wait is bounded to at most 60,000 ms. Take fresh observations, check guards and a unique eligible target, execute, and reobserve. No automatic retries of uncertain actions or host escalation. Stale references permit a fresh guard/selector check only when the screen remains consistent.

At declared checkpoints, fixed Noul bounds are yes >=0.9 and no <=0.1. Any uncertain claim makes the run inconclusive; otherwise any false claim fails. Passed requires every planned step/checkpoint to complete and cleanup to succeed. Missing/ambiguous targets, unexpected screens, malformed/failed model responses, budget exhaustion, interruption, and unknown device outcomes are inconclusive. Linear finite scripts and bounded waits replace the autonomous loop's repeat heuristic; unchanged screens can be valid during typing.

Cancellation/global deadlines stop new work and enter independent cleanup. Wait for issued device acknowledgements before stopping/unlocking; an unconfirmed command or failed cleanup retains the lock and prevents a pass. A partial journal without a verdict is inconclusive on later read. There is no resume or per-step host intervention in v0.1. Real target-missing, ambiguous-target, and SIGINT probes confirmed zero actions/model calls and successful cleanup. See [ticket 21](21-scripted-feasibility.md).
