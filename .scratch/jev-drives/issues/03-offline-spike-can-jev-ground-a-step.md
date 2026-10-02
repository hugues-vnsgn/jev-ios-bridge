# Offline spike: can Jev ground a plain-language step?

Type: prototype
Status: resolved
Blocked by: 01, 02

## Question

Given one screen (as the bridge's text) and one plain-language step from a plan ("Open request 157"), does Jev pick the action that performs the step often enough, and rarely enough wrongly, to justify building a live prototype?

**Passing this authorizes a live prototype only, not a release** (Codex Q1, Q29): zero wrong picks among about 21 accepted decisions still leaves a one-sided 95% upper bound of about 13% on the wrong-action rate.

## How

- About 20–30 labeled cases from the apps chosen in ticket 02 (several unrelated apps; the owner's app SM screens are one source, read-only captures). Include the known traps: unsaved forms, duplicate rows, wrong scroll direction, icon-only controls, unexpected dialogs, and risky buttons (Send, Approve, Reject, Delete).
- Each case: screen text, step text, the step's "done when" evidence, the right action, the right "step done?" answer. **Labels, the confidence threshold and the pass rule are frozen and owner-reviewed before any Jev call.** Jev's Choice confidence measures how concentrated its answer is, not how often taps succeed, so the threshold is set and checked against these labels (Codex research note).
- One request per case: a Choice over the bridge-built candidate actions (plus "none fits") and a Noul for "step done". Jev's "done" never advances a step on its own (Codex Q4); the case records whether it would have been right.
- Measure, per app: right picks; accepted picks above the threshold; **wrong accepted picks (must be 0)**; share of decisions Jev would handle (target ≥ 70%); the same for risky actions under a stricter threshold.
- Compare with the v3 result (17/20 right, 10/20 accepted).

## Go / no-go

Go to the live prototype if there are zero wrong accepted picks and Jev handles ≥ 70% of decisions on each app. Otherwise no-go: the map closes toward Claude driving through an interactive mode.

## Answer

Run once on 2026-10-01 under the frozen protocol (`spikes/jev-drives/protocol.md`, hashes in `freeze.json`). Results: [`spikes/jev-drives/results/results.md`](../../../spikes/jev-drives/results/results.md).

- **Wrong accepted picks: 0** (the safety rule held). Right picks 26/29. Jev-handled 18/22 (82%) overall, 88% iOS, 79% Android. Hand-backs correct 7/7. Step done right 28/29.
- **Under the frozen rule: NO-GO.** Three apps fell under 70% on 2–3 eligible decisions each: ReadMe 2/3, KotlinConf Android 1/2, Now in Android 2/3.
- **The pattern:** 3 of the 4 misses were scrolled-off targets (rm-02, kca-02, fc-06). Jev sees only the current screen, so it never chose to scroll; it handed back or picked a tap below the threshold. The 4th (nia-02) was right at 0.89, under the 0.90 test-write floor. Every miss failed safely.
- Better than v0.1's best (v3: 17/20 right, 10/20 accepted).

**Owner decision (2026-10-01): override, proceed to the build (option 2).** Reasons: zero wrong accepted picks; 82% overall; the per-app rule failed on 2–3 cases per app; the main weakness has a code fix. **Condition:** the bridge, not Jev, searches for targets that aren't on screen (scroll and re-ask, then hand back) — added to ticket 07 — and it must prove itself on **new** cases in the live trial (ticket 10), whose release gate (≥ 60 accepted actions per app, C29) is the real test. These 29 cases are not rerun as evidence.
