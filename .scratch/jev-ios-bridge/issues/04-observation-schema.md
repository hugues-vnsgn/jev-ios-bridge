# Observation schema: what Jev is shown as state

Type: grilling
Status: open
Blocked by: 01, 03

## Question

What is the exact text shape of an Observation: how the XcodeBuildMCP rs/1 snapshot is pruned into candidates, which fields each candidate carries, how non-actionable context (titles, labels, alerts) is kept, and what device and run metadata ride along?

Decide: candidate identity (element references, and whether they survive across steps), the pruning rules (hidden, zero-size, disabled, duplicated elements), the per-candidate token budget and total cap, whether frames are included as numbers or as coarse regions ("top-left"), and how prior steps are summarized into the state.
