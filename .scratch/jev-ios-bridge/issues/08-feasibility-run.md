# Feasibility run: measure Jev on real screens

Type: prototype
Status: open
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
