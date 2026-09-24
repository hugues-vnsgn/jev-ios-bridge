# Feasibility run: measure Jev on real screens

Type: prototype
Status: resolved
Blocked by: 06, 07

## Question

Does Jev meet the bar set in "Feasibility plan: the go/no-go bar and the step questions"?

Build a throwaway harness under `spikes/feasibility/`; it will never ship. Then:

1. Capture and label the corpus the plan describes.
2. Send one request per snapshot, using the plan's question set, with the model pinned to `jev-1.13.0`.
3. For each request, record the answers, the probabilities, the confidence, `usage.input_tokens`, and latency.

Go through the results with the human. Resolve with:

- the results table;
- the go/no-go call;
- the observation shape that worked best.

Link the harness branch and the results note as assets.

A go accepts ADR-0001. A no-go reopens it.

## Comments

2026-09-24: the owner delegated implementation through GitHub prerelease v0.1.0. The harness and real-screen corpus are in preparation on `feat/v0.1-release`. Ticket 07's owner label review and frozen held-out evaluation still apply. No evaluation result is asserted by the offline tests. See [release plan](../release-plan.md).

## Answer

**No-go for the first frozen design.** The owner approved the 30-case corpus and deferred real wait-state coverage. Four tuning configurations selected D (filtered full snapshots plus recent history), with Choice confidence 0.9. That selection accepted 4/10 tuning cases without an incorrect accepted action.

The untouched 20-case held-out evaluation returned:

| Measure | Required | Observed |
| --- | ---: | ---: |
| Correct top-1 action | 18/20 | 15/20 |
| Accepted cases | 16/20 | 7/20 |
| Incorrect accepted actions | 0 | 0 |
| False-pass assertions | 0 | 0 across 15 known false assertions |
| Request / observation / response failures | Recorded separately | 0 / 0 / 0 |

Held-out requests used 70,574 input tokens and 10,938 ms accumulated Jev latency. The results do not justify accepting ADR-0001 or releasing the current autonomous policy. The original bar remains fixed.

Evidence on the release branch:

- [Owner review and frozen inputs](../../../spikes/feasibility/corpus/review/case-review.md)
- [Tuning results](../../../spikes/feasibility/results/tuning/tuning.md)
- [Held-out results](../../../spikes/feasibility/results/heldout/heldout.md)

[Feasibility revision](18-feasibility-revision.md) investigates the misses and requires new held-out cases for any revised design. Old results remain evidence of this failed attempt.
