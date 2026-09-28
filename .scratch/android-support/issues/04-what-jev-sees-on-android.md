# What Jev sees on Android, and the 10-screen check

Type: task
Status: claimed
Claimed by: Claude Code (owner session)
Blocked by: 02

## Question

Does Jev judge Android screens as reliably as iOS ones, using the element mapping from "How Android elements map onto the bridge's elements"?

- Use the mapping from "How Android elements map onto the bridge's elements": lifted button text appears twice (as the button's label and as a non-selectable text line); judge whether that repetition affects Jev.
- Decide the Android observation projection: the header line (today "Current iOS screen (full accessibility capture):"), the field set, and a new projection-rule name beside `visible-full-text-v2`.
- Capture about 10 emulator screens across the Android twin app, `cmp` or `cmp-test`, and Settings. Write true, false and borderline claims for each, following the claim-writing guide.
- Run one judgment per checkpoint, one run, with the pinned Jev model. Report any confidently wrong answer (a false claim at or above 0.9, or a true claim at or below 0.1), and the uncertainty rate compared with the iOS corpus.

Resolved when the results are recorded and the projection is fixed or rejected.
