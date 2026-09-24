# Feasibility run: measure Jev on real screens

Type: prototype
Status: claimed
Claimed by: Codex main, with gpt-6-sol high sub-agents
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
