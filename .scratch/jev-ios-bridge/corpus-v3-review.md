# Checkpoint corpus audit

Independent audit by the `gpt-6-sol` high reviewer, 2026-09-24. No remaining factual label concern was found before owner review. No Jev or device calls were made during the audit.

- Canonical corpus SHA-256: `136dd6ed8e7880e6e1118b1691a31693b72a19f0498cd7ef8b4be475d58363cf`.
- Experiment source SHA-256: `9ca22c17020c58b634068df87626911549d8600e1a67508732896d8c7cd317d8`, archived in commit `5021c02`.
- Ten retained tuning captures with rewritten checkpoint labels; 20 fresh held-out cases. No scenario group crosses the split.
- All 90 asset hashes match. The 20 held-out screen hashes are unique and disjoint from both previous held-out sets.
- All 124 offline request builds pass with the saved manifest's 96-candidate and 24,000-byte state limits. Maximums: 81 options, 16,918 state bytes, 22,697 request bytes.
- Accepted actions cover both compact aliases and full canonical targets: 35 collapsed aliases checked, zero label gaps.
- Twenty held-out assertion labels are false. Four terminal cases pair a reached goal with a false assertion: Weather mph, Iris's old email, an absent reminder note, and the diagnostic $5 total.

The visual audit supports the Contacts hidden-field swipe, settled Ada Birch no-results blocker, saved reminder note, and diagnostic total of $3. Failed Reminders capability routes remain excluded preflight evidence. Real wait-state coverage remains explicitly deferred.

This audit is not owner approval or a feasibility result. Freeze the exact manifest, obtain review of the linked [case sheet](../../spikes/feasibility/corpus-v3/review/case-review.md), then run tuning and the unchanged held-out gate without relabelling from model answers.

## Post-evaluation independent audit

After explicit owner approval, the independent reviewer verified the approval's corpus and manifest hashes, source digest, frozen selection, combined primary/positional tuning hash, and all 20 expected held-out cases. The partial journal exactly matches the final results. Every gate and aggregate recomputes identically.

The result is no-go: 17/20 correct choices, 10/20 accepted, zero wrong accepted actions, zero false passes across 20 known-false assertions, and no request/observation/response failures. Five rejections first failed Choice confidence, three failed completion-no, and two failed completion-yes. Those last two prevented premature stops on unsaved forms. Correct choices were also rejected by uncertain completion or low action confidence. This audit made no Jev or device calls and did not change the experiment.
