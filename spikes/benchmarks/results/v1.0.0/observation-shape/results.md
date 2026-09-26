# Observation-shape experiment: results

Run 2026-09-26 per [PREREGISTRATION.md](../../../../observation-shape/PREREGISTRATION.md); 104 requests to `jev-1.13.0`, 487878 input tokens.

**Decision: adopt B as `visible-full-text-v2`.**

## Corpus (48 claims per variant)

| Variant | Confidently wrong | Uncertain | Uncertain claims |
| --- | ---: | ---: | --- |
| V0 | 0 | 4 | s11-contacts-nolan-new-email-unsaved:b=0.87, s11-contacts-nolan-new-email-unsaved:a=0.25, s16-reminders-new-list-blank:a=0.79, s19-reminders-charge-lantern-note-empty:b=0.78 |
| A | 0 | 1 | s11-contacts-nolan-new-email-unsaved:a=0.21 |
| B | 0 | 3 | s11-contacts-nolan-new-email-unsaved:a=0.19, s16-reminders-new-list-blank:a=0.81, s19-reminders-charge-lantern-note-empty:b=0.78 |
| AB | 0 | 2 | s11-contacts-nolan-new-email-unsaved:b=0.89, s11-contacts-nolan-new-email-unsaved:a=0.21 |

## Reminders `verifyFinalList` (event 35, unredacted)

| Variant | Repeat | counts | header | oneIncomplete | noOthers | threeRows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| V0 | 1 | 0.880 | 0.910 | 0.960 | 0.720 | 0.910 |
| V0 | 2 | 0.860 | 0.950 | 0.950 | 0.650 | 0.870 |
| V0 | 3 | 0.870 | 0.900 | 0.940 | 0.680 | 0.900 |
| B | — | 0.870 | 0.970 | 0.950 | 0.710 | 0.900 |

## Negative controls (populated field withheld, claimed empty; truly false)

| Control | Variant | P(empty) |
| --- | --- | ---: |
| NC1-s20-notes-withheld | V0 | 0.810 |
| NC2-s01-search-withheld | V0 | 0.840 |
| NC1-s20-notes-withheld | A | 0.980 |
| NC2-s01-search-withheld | A | 0.970 |

## Decision rule applied

| Candidate | Corpus gate (0 wrong, ≤3 uncertain) | Improves on V0 | Controls safe | Passes |
| --- | --- | --- | --- | --- |
| A | yes | yes | no | no |
| B | yes | yes | yes | **yes** |
| AB | yes | yes | no | no |
## Reading the result

- **B is adopted because the pre-registered rule says so, and it's low-risk.** It only adds the scroll-bar lines Jev can see. The rule was fixed before the run so it couldn't be tuned afterwards.
- **B's measured improvement is within noise.** B's one fewer uncertain claim comes from s11 claim `b` (V0 0.87, B 0.97). That claim is about an email field's text, not scrolling, and it was decisive in the frozen corpus run. On the claims B was meant to help, B moved nothing beyond noise: Reminders `noOthers` scored 0.71 under B, inside V0's own range of 0.65–0.72 across three identical requests, and s16 and s19 were unchanged.
- **Identical requests are not perfectly reproducible.** The three identical Reminders requests spread by up to 0.07 on one claim (`noOthers` 0.65–0.72). ADR-0004 cites a documented spread of about 0.01. Near a bound, a claim can land on either side of it from run to run. That strengthens ADR-0004's single-judgment rule: re-asking would pick among noisy samples.
- **Today's shape (V0) did not pass the corpus gate on this re-run:** 4/48 uncertain, against a limit of 3. The frozen run had 3/48. B passed with 3/48, and no variant produced a confidently wrong answer.
- **Explicit empty values (A) are harmful, as the research predicted.** They resolved the empty-field claims (s16, s19), but on both negative controls, where a populated field's value was withheld, Jev called the field empty at 0.97–0.98. That would be a false pass. Emptiness stays out of the observation; the guide keeps teaching authors to claim only what the app prints.
- **Reminders' "no additional reminders" stays unresolved under every shape.** The guide's authoring rules, not the observation shape, are the fix: claim the app's own total ("2 Completed") and guard the named rows.
