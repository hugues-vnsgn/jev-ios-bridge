# Phase 4: observe and the actions (tap, replace text, swipe, screenshots)

Status: claimed
Claimed by: claude-issue-15
Blocked by: 12, 13, 14

Spec: [../spec.md](../spec.md), "Phase 4". The work is [the release spec's phase 4](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) items 4 ("Reading the screen", "Screenshots") and 6, with their part of item 9, and open points [9, 10, 11 and 23](../../android-support/release-spec.md#open-points-for-the-executor). Read them in full, and the domain model's session invariant. The owner's clipboard ruling (spec, "Rulings during execution", 2026-09-30) applies. The detail below only adds acceptance criteria.

## What to build

The Android driver's `observe` and `act`.

1. **`observe`:** capture with `device.dump.ui {"waitUntilIdle": 2000}` through the settle rule (Issue 13), map the tree (Issue 12), and return a `Snapshot` with the screen hash and a fresh sequence. Take one screenshot on the settled snapshot, `device.screenshot {"format": "jpeg", "maxSize": 800}`, decoded from base64 and saved in the screenshot folder, and set `screenshotPath` (open point 9). A step whose cap was hit carries `settled: false`.
2. **Every action targets an element of the latest settled snapshot.** A reference from an older snapshot is refused with `StaleSnapshotError`, as on iOS.
3. **Tap:** the element's centre, as whole numbers (`device.io.tap {x, y}`).
4. **Replace text:**
   - focus the field by tapping its centre (open point 10);
   - `device.io.keys` with `KEYCODE_A` and modifier `KEYCODE_CTRL_LEFT`, then a 0.2 s pause, then a **separate** `device.io.keys` with `KEYCODE_DEL` (open point 23, confirmed by the tracer). Never both keys in one call;
   - ASCII goes through `device.io.text {text}`, unchanged, including a leading `-`. Anything else goes through `device.clipboard.set {text}`, then `device.io.button {"button": "KEYCODE_PASTE"}`, then `device.clipboard.clear`. Don't use `adb shell input` for typing;
   - check the stop flag before each of those calls, so an abandoned replace-text stops at its next call.
5. **After an action,** settle and return an `ActOutcome` whose `screen` is the settled snapshot (the run uses it as its next observation). After replace text, its `shownValue` is the field's text in that capture (a password field's dots). Don't fail the step on a mismatch: formatting fields legitimately differ (open point 11).
6. **Swipe:** within the element's bounds along its centre line, from 90% to 10% of its length in the swipe's direction, over 1000 ms (`device.io.swipe {x1, y1, x2, y2, duration: 1000}`, whole numbers). "Up" means the finger moves up, as on iOS.
7. An action the element doesn't offer is `UNSUPPORTED_ACTION`, as on iOS.

## Acceptance

- Driver tests with the fakes and a fake clock cover: tap coordinates; replace text's exact call sequence (the tap, the two separate key calls, the 0.2 s pause, then the text call); a leading-dash value reaching `device.io.text` unchanged; Vietnamese through set, paste and clear; each swipe direction's coordinates; the settled snapshot and `shownValue` in the `ActOutcome`; `settled: false` at the cap; a stale reference refused; one screenshot file per observation; and an abandoned replace-text issuing no further call after the stop flag is set.
- A typed value with a trailing space keeps the space in the `ActOutcome`'s `shownValue` (release spec item 5's correction). Issue 16's end-to-end run checks that `run.jsonl` masks it, since a run needs `close`.
- `npm run check` passes. No device is touched.
