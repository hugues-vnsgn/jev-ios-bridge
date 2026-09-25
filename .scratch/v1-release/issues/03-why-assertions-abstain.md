# Why assertions abstain: Jev uncertainty and claim wording

Type: research
Status: resolved
Blocked by: none

## Question

What makes Jev return an uncertain probability (between 0.1 and 0.9) on a claim whose visible evidence is correct, and what claim wording or observation shape avoids it? "Assertion policy for 1.0" waits on this. Establish:

- **The Reminders case:** each status claim scored 0.97, but the combined exact-total and no-additional-reminders claim scored 0.87 (run `0fb5c786-d4ed-4b60-bfed-68a5452b533a`). What in the claim or the observation caused it: compound claims, counting, negatives ("no additional"), or truncated observations?
- **The scripted corpus:** the three uncertain judgments in `spikes/scripted/results/evaluation/` and what they share.
- **TypeSafe's current guidance** on Noul claim phrasing, calibration, determinism, repeated sampling, and model-version changes, from the live docs (`typesafe:typesafe-ai`).
- **Options with evidence:** splitting compound claims, authoring rules, re-observing before judging, bounded re-asks, and threshold changes. State what each would do to the zero-confidently-wrong record, citing data where it exists.

## Answer

Findings: [`docs/research/assertion-uncertainty.md`](../../../docs/research/assertion-uncertainty.md) (commit `1c9edfd`). No live Jev calls; probabilities re-scored from archived runs; TypeSafe docs read 2026-09-25.

- **The cause is implicit evidence, not size or truncation.** All four uncertain judgments rest on something the text observation shows only indirectly: empty fields (captures omit `value` entirely; 0.80 and 0.78), "no additional reminders" (nothing marks the list's end; 0.87), and saved state inferred from editor buttons (0.22 on a false claim; the same kind of claim scored 0.64–0.83 in feasibility, the closest call to a false pass).
- **Compound claims, small counts, and absence are fine when directly visible.** Compounds of up to four visible facts scored 0.97–0.98; small counts 0.94–0.98; absence 0.97–0.98 when the app prints it ("No Results", "0 reminders").
- **TypeSafe's docs agree:** one yes/no per Noul, count in code, and negation is read literally. Determinism is not promised (spread of about 0.01 across perturbed repeats). Pin the model version; the bridge already pins `jev-1.13.0`.
- **Bounds:** 0.9/0.1 give zero confidently wrong answers across 300 archived judgments. An upper bound of 0.83 or less would have passed a false feasibility claim; 0.85 recovers only the Reminders claim.
- **Recommendation for "Assertion policy for 1.0":** keep 0.9/0.1; adopt authoring rules (one kind of evidence per claim; absence only through printed text; no counting rows; saved state only on the post-save screen); split compound claims that include anything not directly visible; no same-request re-asks or unchanged-screen re-observes, with recovery as authored steps. Test any observation-shape change on a frozen corpus first (the doc includes a pre-registered design costing under $0.001).
- **Side finding, unverified live:** a guard selector with `value: ''` probably never matches a real empty field, contradicting `skills/test-ios/SKILL.md`. Passed to "Code and design review".
