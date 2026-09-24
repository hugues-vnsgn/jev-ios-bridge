# V2 corpus audit before owner review

Reviewed `spikes/feasibility/corpus-v2/corpus.json` at SHA-256 `0ab820af9845301a73228c393344487a0bed9c1f252e4227f13cf61b4fc5accd`. This is a read-only audit of labels and captured evidence, not a Jev result or a go/no-go call.

**Verdict: ready for owner label review, conditional on freezing `maxCandidates: 96`.** The two draft label concerns found during the audit were corrected before this note: the Noah Reed goal now identifies the target through its old email, which appears in the text observation, and R1 through R4 no longer assert a hidden saved Weekend Errands title. R5 keeps the old-title assertion as false against a visible saved Market Errands title.

| Check | Evidence |
| --- | --- |
| Split and freshness | 10 retained tuning and 20 new held-out cases; no scenario group crosses partitions. The 20 new raw full-capture screen hashes are distinct and have no overlap with the first held-out 20. |
| Assets | All 90 compact/full/screenshot SHA-256 values match their files. No v2 tuning or held-out answer files or run claims were present at audit time. |
| Action labels | Every accepted action is in the union of v2 compact options and full canonical options. Full-snapshot collapsed tap aliases have their required canonical/compact labels. Distinct same-name Noah rows remain separate options; both taps are acceptable inspection steps because company is absent from the text list. |
| Request budgets | All 120 primary case/configuration observations and four tuning positional variants build Jev requests offline with the v2 wording, `maxCandidates: 96`, and 28,000-byte state ceiling. The largest Choice has 84 options, below 255. At 64 candidates, C4 and C5 fail `TOO_MANY_CANDIDATES` in all four configurations. The frozen manifest must use 96. |
| Completion and blockers | W3 visibly selects °F; W7 visibly selects km/h and inHg; C6's saved card shows the new email; R5 shows the saved Market Errands title. W6 has only wind changed and remains incomplete. C8 explicitly says no results for Lena Quill, supporting `stop-blocked`. Terminal opposite-unit and old-title assertions supply known false labels. |
| Hidden-field swipe | C3's screenshot ends above the email row and its full snapshot has a scrollable form but no email field. After the labelled upward finger swipe, C4 shows the old email field. The swipe advances toward hidden content. |

The Weather settings screenshots support the captured selected-unit labels: W2 has °C, mph, and mb active; W3 has °F; W5 has mph and mb; W6 has km/h with mb; W7 has km/h with inHg. Claims on Weather's main screen ask whether Settings selections are **visibly shown on that screen**, so their false labels do not infer persisted state. C5's new address is still in the edit form and is labelled not saved; C6 shows it on the saved card. The revised Reminders assertions avoid trusting an occluded underlying AX element on R4.

The owner still needs to review every acceptable-action set, goal-completion label, assertion label, synthetic setup, and asset digest before freezing. Real wait-state coverage remains deferred and is not counted. No corpus file was changed and no Jev request was made for this audit.
