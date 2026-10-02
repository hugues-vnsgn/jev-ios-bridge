# Driven runs cost more than Claude driving directly on short flows

Status: needs-triage
Type: research

## Evidence (first live trial, 2026-10-02, one app, iOS, one run per flow)

Claude cost with the same model and effort: Claude driving directly $0.63 and $0.59; driven mode $1.66 and $1.10. Jev about $0.002 per run. The release bar wants driven mode at most half of driving directly.

Where the driven sessions spent it:
1. Fixed reading: the skill, guide 13, the script format and the claims guide, about 20k tokens of context before any device work.
2. Authoring as if for a version 1 script: one session ran an Explore subagent over the app's source and took 5 of its own captures; the other searched the source for test tags. `do` steps need neither.
3. Each `get_report` poll and each hand-back answer is a full Claude turn over a 70–100k context (4 polls and 3 answers per run).

Claude driving directly stayed near 35–40k context, because each tap returned the next screen.

## Questions

- Can the skill's driven path ask for `do` steps from the user's words only (no source reading, no captures), with the format inside the skill?
- Can `get_report` block until a hand-back or the end, so a run needs one poll?
- Can the hand-back package be smaller?
- Do reruns of a saved driven script, and longer flows, reach the bar?
