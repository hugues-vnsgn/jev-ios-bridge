---
status: accepted
date: 2026-09-25
---

# Fixed assertion bounds, false-wins precedence, and a single judgment

The 1.0 release freezes verdict semantics, so the owner settled the assertion policy before the freeze ([Assertion policy for 1.0](../../.scratch/v1-release/issues/07-assertion-policy.md)). A claim is established at probability 0.9 or above and rejected at 0.1 or below. These bounds are fixed: no script, CLI flag, or MCP input can change them, so "passed" means the same thing in every script. The evidence comes from [the uncertainty research](../../.scratch/v1-release/issues/03-why-assertions-abstain.md): the bounds produced zero confidently wrong answers across 300 archived judgments. A false "saved" claim scored 0.83, so any upper bound at or below that would have produced a false pass.

A confidently false claim now fails its checkpoint even when other claims are uncertain. This reverses ADR-0003's implementation, which made any uncertain claim inconclusive first. A confident failure is the bridge's most reliable signal, and hiding it behind an unrelated uncertain claim cost the developer the one fact they needed. The report still lists the uncertain claims.

Each checkpoint is judged once. The bridge never re-asks Jev or re-observes an unchanged screen to resolve an uncertain claim. Documented repeat spread is about 0.01, so re-asking cannot honestly move a borderline answer, and accepting the best of several samples would launder a guess into a pass. Recovery is an authored step that adds evidence, such as scrolling to a list's end, followed by a new checkpoint. The existing retry for stale action targets is unaffected.

## Consequences

- The Jev model stays pinned per bridge release. Adopting a new model, or changing the observation text sent to Jev, requires the corpus gate: zero confidently wrong and at most 3/48 uncertain on the frozen 24-screen corpus, and zero confidently wrong when the 300 archived judgments are re-scored. A model change that passes ships as a minor release and is named in every report.
- Claim-writing rules are taught through the `/test-ios` skill and the guide, not enforced by the schema: wording patterns cannot tell whether evidence is visible.
- Considered and rejected: script-tightenable bounds (safe, but nobody needs them yet; addable later without a break), bounded re-asks requiring agreement (can only add abstentions), and scripts choosing a model (turns the model into configuration to support).
