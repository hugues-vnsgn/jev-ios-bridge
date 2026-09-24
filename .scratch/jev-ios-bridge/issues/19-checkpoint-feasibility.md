# Checkpoint feasibility: bound each judgment to an observable subgoal

Type: prototype
Status: claimed
Claimed by: Codex main, with gpt-6-sol high sub-agents
Blocked by: 18

## Question

Can Jev meet the unchanged action/coverage bar when the scenario supplies ordered observable checkpoints, rather than asking Jev to plan a broad goal?

Two broad-goal experiments failed. The next design keeps one scenario submission, one bridge-owned run and verdict, and Jev choosing actions, but the bridge advances explicit checkpoints only after their evidence passes. This is also needed to verify the complete Weather benchmark across Settings, Home, and detail screens. See [the checkpoint proposal](../checkpoint-proposal.md).

Implement the schema and deterministic checkpoint lifecycle under tests. Preregister development and fresh held-out cases with checkpoint-sized desired states, then obtain owner label review and freeze the experiment. Keep the same model, threshold grid, Noul bounds, and 18/20 correct + 16/20 accepted with zero accepted errors and zero false-pass assertions bar. Preserve all previous results as failed development evidence. No publication until the revised scope is supported by evidence.
