# Step-loop policy: limits, thresholds, stop rules, escalation

Type: grilling
Status: open
Blocked by: 08, 09, 10

## Question

What rules govern a run? Decide:

- **Default limits** for steps and wall-clock time. One SDK call can take about 31.5 s with default retries, or about 150 s when it honours `Retry-After`.
- **Thresholds**, calibrated on data from "Feasibility run: measure Jev on real screens". Choice confidence depends on the number of candidates. Noul answers carry only a probability.
- **When assertions are checked:** at every step, or only once Jev judges the scenario done. Ordered assertions from "Scenario language: goals, assertions, typed values" constrain this.
- **Loop and repeat detection**, ignoring the status bar.
- **What ends a run** as passed, failed, or inconclusive. This includes whether "blocked" counts as a failure.
- **Interruption:** what a cancelled tool call, SIGINT, or SIGTERM leaves behind. A killed stdio server has no open call to return a report to, so decide what the run log records and how the host agent learns the outcome later.
- **Escalation:** does low confidence end the run as inconclusive, or hand the step to the host agent? Escalating means ending the tool call and resuming in a new one with a run handle. Claude can only pick elements that are already in the snapshot.
