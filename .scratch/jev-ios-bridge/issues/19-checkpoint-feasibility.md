# Checkpoint feasibility: bound each judgment to an observable subgoal

Type: prototype
Status: resolved
Blocked by: 18

## Question

Can Jev meet the unchanged action/coverage bar when the scenario supplies ordered observable checkpoints, rather than asking Jev to plan a broad goal?

Two broad-goal experiments failed. The next design keeps one scenario submission, one bridge-owned run and verdict, and Jev choosing actions, but the bridge advances explicit checkpoints only after their evidence passes. This is also needed to verify the complete Weather benchmark across Settings, Home, and detail screens. See [the checkpoint proposal](../checkpoint-proposal.md).

Implement the schema and deterministic checkpoint lifecycle under tests. Preregister development and fresh held-out cases with checkpoint-sized desired states, then obtain owner label review and freeze the experiment. Keep the same model, threshold grid, Noul bounds, and 18/20 correct + 16/20 accepted with zero accepted errors and zero false-pass assertions bar. Preserve all previous results as failed development evidence. No publication until the revised scope is supported by evidence.

## Current evidence

The checkpoint prototype is committed at `5021c02`; Node 24 CI passed 91 tests, type checking, and build. The [fresh corpus](../../../spikes/feasibility/corpus-v3/review/case-review.md) is frozen at `cb87239` after the [independent audit](../corpus-v3-review.md). It has 10 development cases and 20 fresh held-out cases, with all 90 asset hashes and 124 offline request builds verified.

Corpus SHA-256: `136dd6ed8e7880e6e1118b1691a31693b72a19f0498cd7ef8b4be475d58363cf`. Manifest SHA-256: `ced6bfb11cc14e1138f2f28d5fca66ec16dade716a0aa126ddd4ca94a204a172`.

The owner explicitly approved the frozen labels and evaluation in the conversation. Hash-bound `approval.json` records that decision; the template remains unapproved by design. The testing agent ran tuning once, followed by its frozen selection on all 20 held-out cases. The outcome is recorded below.

## Answer

**No-go.** After owner approval, each phase ran once with unchanged source, labels, model, thresholds, and gate. Tuning selected D (full observations and history) at Choice confidence 0.6: 10/10 correct top choices, 5/10 accepted, zero wrong accepted actions.

The fresh held-out result is **17/20 correct top choices** (18 required), **10/20 accepted** (16 required), **zero wrong accepted actions**, and **zero false-pass assertions across 20 known-false claims**. There were no request, observation, or response failures. Completion labels matched at the frozen bounds in 12/20 cases; assertion labels matched in 19/25. The requests consumed 95,295 input tokens and 6,726 ms accumulated Jev latency.

The three wrong top choices were the reverse swipe on the hidden Contacts field and premature `stop-goal` choices on unsaved Contacts and Reminders forms. The policy rejected all three. Of the ten rejected cases, five first failed Choice confidence, three failed the completion-no check, and two failed the completion-yes check. The rejection rules prevented accepted errors but left coverage at 50%.

[Tuning](../../../spikes/feasibility/results-v3/tuning/tuning.md), [held-out results](../../../spikes/feasibility/results-v3/heldout/heldout.md), partial journals, approval, and phase claims are preserved. This corpus is now disclosed development evidence and must not be reused as a fresh held-out evaluation. The runtime has not been calibrated or released as a passing design. [Ticket 20](20-post-feasibility-direction.md) asks the owner to choose the product direction after three no-go results.
