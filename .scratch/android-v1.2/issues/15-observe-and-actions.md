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

## Comments

### 2026-09-30, claude-issue-15: built

**What I built** (`src/device/android/driver.ts`):
- **`observe`** runs the settle rule over `device.dump.ui {"waitUntilIdle": 2000}` and maps the tree. It returns a `Snapshot` with these fields:
  - the settle rule's `screenHash`, a fresh `sequence`, and `deviceId` set to the serial;
  - `settled: false` only when the cap was hit;
  - one `device.screenshot {"format": "jpeg", "maxSize": 800}`, decoded and saved as `screen-<sequence>.jpg` (mode 0600), whose path goes in `screenshotPath`.
- **`act`** refuses any snapshot other than the latest settled one, and any ref missing from it, with `StaleSnapshotError`. It checks `UNSUPPORTED_ACTION` and `MISSING_VALUE` as iOS does, raised as `DeviceReasonError`, before any device call. Then it runs the action, settles, and returns the settled snapshot, with its own screenshot.
  - **Tap:** `device.io.tap` at the element's centre, rounded.
  - **Swipe:** along the centre line, from 90% to 10% in the finger's direction, 1000 ms, rounded.
  - **Replace text:** in order,
    1. tap the centre;
    2. `device.io.keys` with `KEYCODE_A` and modifier `KEYCODE_CTRL_LEFT`;
    3. `clock.sleep(200)`;
    4. a separate `device.io.keys` with `KEYCODE_DEL`;
    5. ASCII goes through `device.io.text`. Anything else goes through `device.clipboard.set`, then `device.io.button KEYCODE_PASTE`, then `device.clipboard.clear`.

    Each agent call checks the stop flag and the signal first, and runs in the lease's ledger as an `agent` command. It returns an `ActOutcome` whose `shownValue` is the field's `value` in the settled capture: exact text, dots for a password field, `''` for an empty field. A mismatch with the typed value never fails the step.
- `close` still rejects with "not built yet", and the factory is unchanged, so Android is still refused.

**Deviations and choices, and why:**
- **`act`'s settled snapshot also gets a screenshot.** The run uses it as the next observation, so "one screenshot per observation" and Issue 16's "a `screen-N.jpg` per observation" need one.
- **An action clears the latest snapshot before its first device call.** If the settle after it fails, the old snapshot stays stale. This is the session invariant: "taken after the previous action ended".
- **`close` now sets the stop flag (`closeBegun`) before it rejects.** That makes "an abandoned replace-text issues no further call once close begins" testable now. Issue 16 keeps this as its first step.
- **Finding the typed field in the settled capture:** the spec doesn't say how. I used, in order:
  1. the one text field with the same identifier;
  2. else the one focused text field;
  3. else the one text field with the same frame.

  If none is sure, `act` returns a bare `Snapshot`, and the step records no `shownValue` rather than another field's value.
- **An empty typed value** only clears the field: no typing call.
- **`expiresAt` is `Number.MAX_SAFE_INTEGER`.** Android refs don't expire by time; only a newer snapshot or an action makes one stale.
- **With no `screenshotFolder` given**, the driver makes its own with `mkdtemp` (0700). Issue 16 should pass the folder it wants when it wires the factory.
- **An abandoned non-ASCII replace-text** stops at its next call, as specified. Stopped after `clipboard.set`, it leaves the value on the clipboard. The owner's clipboard ruling covers this.

**Open-point defaults used:** 9 (JPEG at 800, one per observation, on the settled snapshot, `screen-N.jpg`), 10 (tap the centre first), 11 (`shownValue` on the outcome, `settled: false` at the cap, password dots from the mapping), 23 (the mobilecli key format, two calls, 0.2 s apart).

**Tests** (`tests/android-driver.test.ts`, 22 new; the fake agent now records calls, serves screens, and returns screenshots):
- observe:
  - it settles, maps, hashes and screenshots;
  - each observation gets a fresh sequence and its own file;
  - `settled: false` at the cap.
- tap:
  - the tap coordinates and the settled snapshot after it.
- stale references:
  - an older snapshot is refused;
  - a failed settle leaves the snapshot stale;
  - an absent ref is refused;
  - `UNSUPPORTED_ACTION` and `MISSING_VALUE` are raised before any call.
- replace text:
  - the exact sequence, with the leading-dash value unchanged and the 0.2 s gap measured on the fake clock;
  - Vietnamese through set, paste and clear;
  - the outcome's screen and `shownValue` with a trailing space;
  - a formatting mismatch doesn't fail the step;
  - password dots;
  - `settled: false` on the outcome;
  - an abandoned run after `close` begins;
  - a cancelled run;
  - an empty value;
  - the field lookup's two fallbacks, and the no-match case.
- swipe:
  - all four directions' coordinates.
- One Issue 14 test that expected `observe` to be "not built yet" now expects "not prepared" before `prepare`. It was added in phase 4, so it may change.

**Gate:** `npm run check` passed, 388 of 388 tests, at `8b4e91b` (log: `$TMPDIR/implement-phase4-15-check.log`). No device was touched; neither `adb` nor mobilecli was run.

**`/code-review` against `40e3b74`:**
- **Standards:** 0 hard violations, 8 judgement calls. Fixed:
  - `SWIPE_MS` had no doc comment;
  - `along`'s tuple type, which removes the non-null assertions;
  - `typedFieldIn` now matches identifiers among text fields only, with a `sameFrame` helper.

  Kept: the precondition checks copied from iOS and the fourth action-kind map, because the iOS code stays frozen under the 1.x contract.
- **Spec:** 0 wrong, 2 partial, 4 not asked for. Fixed: the shown value was lost without a trace when the identifier was gone, which now falls back as above and is tested; the identifier match across all elements. The 4 not-asked-for items (the stop flag in `close`, the empty value, the default folder, `expiresAt`) are explained above.
