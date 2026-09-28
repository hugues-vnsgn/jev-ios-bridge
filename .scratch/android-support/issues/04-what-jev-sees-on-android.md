# What Jev sees on Android, and the 10-screen check

Type: task
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 02

## Question

Does Jev judge Android screens as reliably as iOS ones, using the element mapping from "How Android elements map onto the bridge's elements"?

- Use the mapping from "How Android elements map onto the bridge's elements": lifted button text appears twice (as the button's label and as a non-selectable text line); judge whether that repetition affects Jev.
- Decide the Android observation projection: the header line (today "Current iOS screen (full accessibility capture):"), the field set, and a new projection-rule name beside `visible-full-text-v2`.
- Capture about 10 emulator screens across the Android twin app, `cmp` or `cmp-test`, and Settings. Write true, false and borderline claims for each, following the claim-writing guide.
- Run one judgment per checkpoint, one run, with the pinned Jev model. Report any confidently wrong answer (a false claim at or above 0.9, or a true claim at or below 0.1), and the uncertainty rate compared with the iOS corpus.

Resolved when the results are recorded and the projection is fixed or rejected.

## Answer

Resolved 2026-09-28 with the owner; every recommendation accepted. Assets: `spikes/android/jev-check/` on branch `prototype/android-element-mapping` (`755d0ff` for the run, `2366759` for the placeholder fix and re-check): the claims, the exact text Jev saw per screen, and every answer.

**The run.** 10 emulator screens (Android twin app ×3, `cmp` ×4, Settings ×3) and 31 claims, one Jev call per screen with `jev-1.13.0` through the bridge's production judge (`createAssertionJudge`). 14,016 input tokens and about 0.35 s per screen.

| | Claims | Decisive and right | Uncertain | Confidently wrong |
| --- | ---: | ---: | ---: | ---: |
| Plain (printed text) | 20 | 18 | 2 | 0 |
| Borderline (empty, absence, unseen state, counts) | 11 | 5 | 5 | 1 |
| iOS frozen set, for comparison | 48 | 45 | 3 | 0 |

- **The one confidently wrong answer:** 0.96 for "the de-DE, sig=2, built-in keypad field contains the text Betrag eingeben", when that text was only the empty field's grey placeholder. The view showed it twice: as the field's label, and as a text line inside the field.
- **Lifted button text (shown twice) did no harm.** "The Add Apple ($2) button is disabled" got 0.95, and "a check mark in the Add Bread ($3) button" got 0.03. The only miss there was a counting claim (0.88), which the claim guide already forbids.
- **The two uncertain plain claims:** "The vi-VN field shows 2,500,000" for a screen printing `2.500.000` got 0.73, because Jev treats number formats as close. "A full-screen modal is open over the tabs" got 0.11.
- **Borderline claims behaved as they do on iOS.**
  - "No search results are shown" got 0.54, and "the list is scrolled to its last row" got 0.60: nothing printed proves either.
  - "The fullscreen-modal tab is the selected tab" got 0.21, because custom Compose tabs don't report selection.
  - "No Battery row is visible" got 0.96 and was right. "Dark theme is turned off", read from switch value `0`, got 0.96.

**Decisions.**

1. **An empty field's hint is shown to Jev as `placeholder`.** When a text field is empty and its hint or placeholder is the only name it has, the view shows `"placeholder": "<text>"` instead of `label`, and the placeholder's own text line is dropped. Selectors still match the field by that text as its label, so the rule from "How Android elements map onto the bridge's elements" is unchanged for selection. This amends only what Jev sees.
   - **Re-check** (one call, same 4 claims, `results-placeholder-recheck.json`): "contains the text Betrag eingeben" went from 0.96 to 0.65, now uncertain rather than wrong. "The field is empty" went from 0.79 to 0.95. The other two claims didn't change (0.95, 0.71).
2. **The Android view.**
   - Header: `Current Android screen (full accessibility capture):`.
   - Fields: the iOS set (role, label, value, identifier, frame, state; state may carry `focused` and `selected`), plus `placeholder` on empty text fields.
   - Projection rule: `android-full-text-v1`, reported beside iOS's `visible-full-text-v2`.
   - The same 24,000-byte budget applies. The largest screen here was 7.2 KB.
3. **Lifted button text stays** in Jev's view and can't be selected, as already decided.
4. **Android passes the Jev check**, given the placeholder fix. For the guide:
   - quote numbers exactly as the app formats them;
   - custom tabs and toggles must expose their selected or checked state, or claims about them come back uncertain;
   - don't claim that an empty field "contains" its hint.
