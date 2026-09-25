# Feasibility revision: diagnose ambiguity and retest on fresh cases

Type: prototype
Status: resolved
Blocked by: 08

## Question

Can a principled correction to action enumeration or question framing meet the unchanged ticket 07 bar on fresh held-out cases?

The first design reached only 15/20 correct actions and 7/20 accepted cases. Investigate duplicate targets, swipe direction, redundant focus actions before typing, completion judgments, and genuine model errors before changing code. Preserve the failed result.

Resolve with a diagnosed cause, the revised frozen protocol, owner-reviewed labels, tuning results, and a fresh 20-case held-out evaluation. Do not lower the bar, relabel old results after seeing model answers, or count repeated evaluation on old held-out cases as new evidence. Old held-out cases may be used only as explicitly disclosed development evidence.

A passing result reopens the path to production design. Another no-go leaves release blocked on the architecture decision.

## Answer

**No-go.** The owner approved the revised labels, retained development cases, Weather substitution, and deferred wait coverage before evaluation. Full snapshots with history and v2 action choices selected threshold 0.6 on tuning data: 9/10 correct actions, 6/10 accepted, no accepted errors.

Fresh held-out results: **16/20 correct** (18 required), **14/20 accepted** (16 required), **2 incorrect accepted actions** (0 required), and **0 false-pass assertions across 27 known false claims**. There were no request, observation, or response failures. The 20 requests used 99,089 input tokens and 8,389 ms accumulated Jev latency.

The revision improved coverage but did not clear the same bar. Neither this corpus nor its first 20 held-out cases can be reused as fresh evidence. [Results](../../../spikes/feasibility/results-v2/heldout/heldout.md) and [frozen inputs](../../../spikes/feasibility/corpus-v2/review/manifest.frozen.json) remain immutable.

[Checkpoint feasibility](19-checkpoint-feasibility.md) tests a narrower judgment task while preserving one autonomous run and the fixed success bar. Broad-goal navigation remains unapproved for release.
