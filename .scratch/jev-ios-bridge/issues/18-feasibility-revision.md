# Feasibility revision: diagnose ambiguity and retest on fresh cases

Type: prototype
Status: claimed
Claimed by: Codex main, with gpt-6-sol high sub-agents
Blocked by: 08

## Question

Can a principled correction to action enumeration or question framing meet the unchanged ticket 07 bar on fresh held-out cases?

The first design reached only 15/20 correct actions and 7/20 accepted cases. Investigate duplicate targets, swipe direction, redundant focus actions before typing, completion judgments, and genuine model errors before changing code. Preserve the failed result.

Resolve with a diagnosed cause, the revised frozen protocol, owner-reviewed labels, tuning results, and a fresh 20-case held-out evaluation. Do not lower the bar, relabel old results after seeing model answers, or count repeated evaluation on old held-out cases as new evidence. Old held-out cases may be used only as explicitly disclosed development evidence.

A passing result reopens the path to production design. Another no-go leaves release blocked on the architecture decision.
