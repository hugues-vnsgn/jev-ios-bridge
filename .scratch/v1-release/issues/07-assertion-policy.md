# Assertion policy for 1.0: thresholds, claims, and uncertainty

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 03

## Question

The 1.0 promise freezes verdict semantics, so the policy must be right before the freeze. Given "Why assertions abstain", decide:

- **Bounds:** whether 0.9/0.1 stay, and whether they are ever configurable per script (a configurable bound would change what "stable verdict semantics" means).
- **Uncertainty handling:** whether the bridge may re-observe or re-ask before an uncertain claim makes a checkpoint inconclusive, and how that is recorded so it cannot launder a guess into a pass.
- **Claim-authoring rules** that the schema enforces or the `/test-ios` skill and guide teach (one fact per claim, no counting over lists, no negatives about off-screen content, and so on).
- **The Jev model version:** whether a script run records and pins it, and what happens when TypeSafe ships a new one.

## Answer

Grilled with the owner on 2026-09-25, from the findings of "Why assertions abstain". Recorded as [ADR-0004](../../../docs/adr/0004-fixed-assertion-bounds-single-judgment.md).

1. **Bounds:** 0.9/0.1 are fixed and part of the 1.0 promise. They can't be configured per script, by the CLI, or through MCP. Tightening could be added later without breaking anything; loosening, never.
2. **Precedence changes before the freeze:** any claim at or below 0.1 fails the checkpoint, even when other claims are uncertain. The report still lists the uncertain claims. This reverses today's rule (`src/scripted/run.ts:286-287`, `docs/usage.md`), which Codex must change and test.
3. **One judgment per checkpoint.** No automatic re-ask and no re-observe of an unchanged screen. Recovery is an authored step that adds evidence (for example, scrolling to the list's end), followed by a new checkpoint. The existing stale-reference retry for actions (`run.ts:232`) is unaffected.
4. **Claim-writing rules are taught, not enforced:** in the `/test-ios` skill, the guide's claims page, and worked examples. The schema stays structural. The rules:
   - one kind of evidence per claim;
   - absence only through text the app prints;
   - no counting rows (use the app's total or guards);
   - "saved" only on the screen after saving;
   - split compound claims unless every part is plainly visible text.
5. **Jev model:** pinned per bridge release, as `jev-1.13.0` is today. A new model is adopted only after passing the corpus gate (item 7), then ships as a **minor** release named in the release notes. The report header shows the model, not only the log. If TypeSafe retires the pinned model, runs stop inconclusive with a service error until a release adopts the replacement. Scripts can't choose a model.
6. **Observation-shape experiment is a 1.0 work item:** run the pre-registered experiment from the research (explicit empty values, list-end/scroll evidence; under $0.001). Adopt the change in 1.0 only if it passes the gate; otherwise ship today's shape. Later shape changes follow the same gate.
7. **Corpus gate:** zero confidently wrong and at most 3/48 uncertain on the frozen 24-screen scripted corpus, **and** zero confidently wrong when the 300 archived judgments are re-scored. "Compose app evidence plan" may extend the corpus.
