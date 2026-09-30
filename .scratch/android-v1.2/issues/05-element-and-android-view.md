# Phase 3: the element's placeholder and selectable marker, and Jev's Android view

Status: claimed
Claimed by: implementer-05
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 3". The work is [the release spec's phase 3](../../android-support/release-spec.md#phase-3-contract-additions-how-a-script-names-an-android-app-and-device-what-jev-sees-on-android-decisions-1-to-2-actions-across-android-versions-items-2-to-4-log-pane-and-app-exit-detection-item-6-where-android-plugs-into-the-code-items-4-8-and-9) item 4, with its part of item 8, and [open point 4](../../android-support/release-spec.md#open-points-for-the-executor). Read them, and decisions 1 to 2 of [What Jev sees on Android](../../android-support/issues/04-what-jev-sees-on-android.md). The detail below only adds acceptance criteria.

## What to build

1. **`Element`** (`src/contracts/index.ts`) gains an optional `placeholder` and an internal `selectable?: false` (open point 4). Only the Android driver (phase 4) sets them.
2. **Selection** (`src/scripted/select.ts`) never matches an element marked `selectable: false`. The marker is never shown to Jev.
3. **The renderer's Android branch** (`renderAssertionState(snapshot, 'android')` in `src/scripted/observe.ts`): header `Current Android screen (full accessibility capture):`, the projection rule constant `android-full-text-v1` exported beside `PROJECTION_RULE` (Issue 07 records it in the run log), the iOS field set, and `"placeholder": "<text>"` in place of `label` when an element has a `placeholder`. The same 24,000-byte budget. Password fields need no flag: the mapping (phase 4) writes dots into `value`, and the renderer shows `value` as it is.
4. **Golden** (item 8): the Android renderer's output on hand-written elements, including a `placeholder`, a password field whose `value` is dots, and an element marked `selectable: false`.

## Acceptance

- **The iOS observation text doesn't change by a single byte** (ADR-0004). `tests/scripted-production-parity.test.ts` and every existing renderer test pass unchanged. The iOS rule stays `visible-full-text-v2`.
- A selection test: an element marked `selectable: false` never matches, even when its label and role do.
- No existing test changes; no existing golden entry changes.
- `npm run check` passes.
- No device, simulator or emulator is touched.

## Comments

**implementer-05, 2026-09-30.** Built test-first on the three named seams: `renderAssertionState(snapshot, 'android')` (`tests/scripted-jev.test.ts`), a new golden `tests/golden/android-render.json` (hand-written elements: a `placeholder` field, a password field whose `value` is already dots, and a `selectable: false` lifted-button-text line), and selection in `src/scripted/select.ts` (`tests/scripted-run.test.ts`). `tests/scripted-production-parity.test.ts` passes unchanged, proving the iOS text didn't move.

What was built:
- `Element` (`src/contracts/index.ts`) gains `placeholder?: string` and `selectable?: false`.
- `renderAssertionState` (`src/scripted/observe.ts`) shows `"placeholder": "<text>"` in place of `label` when an element has one, on both platforms (the field only exists on Android elements in practice, since only the Android driver sets it); `isVisibleEvidence` now also treats placeholder text as evidence.
- `ANDROID_PROJECTION_RULE = 'android-full-text-v1'` is exported beside `PROJECTION_RULE` in `src/scripted/observe.ts`. Wiring it into the run-log allowlist and `started`/`report.json` is Issue 07's job (left untouched here).
- `src/scripted/select.ts` gains a `selectable(element)` predicate, applied in `visibleMatches` (used by `assertScreenGuard`) and in `resolveActionTarget`'s eligibility filter, alongside the existing `visible`/`enabled`/action checks.

Local implementation choice (not spec-mandated, not externally observable as a contract): when a `selectable: false` element is the only structural match, `resolveActionTarget` reports `TARGET_UNAVAILABLE` (matched structurally, ineligible for action) rather than `TARGET_MISSING`, mirroring the existing precedent for a match that lacks frame/state metadata. `assertScreenGuard` always reports `GUARD_MISSING` in the same case, matching existing behavior for any filtered-out match. Password fields needed no code change beyond the placeholder work: the renderer already shows `value` as-is.

Gates: `npm run check` green at commit `2078122` (typecheck, 212/212 tests, build). Logs: `$TMPDIR/implement-delegate-05-typecheck.log`, `$TMPDIR/implement-delegate-05-test.log`, `$TMPDIR/implement-delegate-05-build.log`, `$TMPDIR/implement-delegate-05-check.log`.

**implementer-05, review round 1, 2026-09-30.** Fixed all seven findings:

1. **Restored `tests/scripted-jev.test.ts` byte for byte** (`git diff 505531c -- tests/scripted-jev.test.ts` is empty). Moved every new test to a new file, `tests/scripted-jev-android.test.ts`, with its own fresh imports.
2. **The placeholder-for-label swap is now Android-only.** `renderAssertionState` (`src/scripted/observe.ts`) only substitutes `placeholder` for `label` when `platform === 'android'`; `isVisibleEvidence` only counts placeholder text as evidence on Android too. Dropped the old "on both platforms" test; added "an iOS element carrying a placeholder renders exactly as before" (`tests/scripted-jev-android.test.ts`), covering both a labelled and an unlabelled iOS element.
3. **Added the label-plus-placeholder case**: a unit test ("a field carrying both label and placeholder... shows only the placeholder") and a golden element (`amountField` in the golden test) that carries both, since phase 4's mapping keeps the label for selection while the renderer shows only the placeholder.
4. **`selectable: false` is now excluded before matching.** `resolveActionTarget` filters `selectable(element)` into `allMatches` (not just the later eligibility filter), so a selector that matches only an unselectable element now gives `TARGET_MISSING`, same as no element at all; `assertScreenGuard` still gives `GUARD_MISSING` in the same case (unchanged, via `visibleMatches`). Added a test that an `absent` guard also ignores an unselectable element (never `GUARD_FORBIDDEN`).
5. **Extracted the golden-file helper** to `tests/fixtures/golden.ts` (`checkGolden(path, actual)`), used only by the new Android test file; `tests/contract.test.ts`'s own copy is untouched. Reworded the comment: no ADR-0005 reference (it doesn't cover the projection), cites ADR-0004 (the projection is fixed) and ADR-0006 (the Android view), and notes this golden freezes a single string, not a general JSON object.
6. **Fixed the role typo**: `'textfield'` &rarr; `'text-field'` (the vocabulary's actual role) everywhere in the new test file.
7. **Reworded both src comments** (`src/contracts/index.ts`'s `Element.selectable`, `src/scripted/select.ts`'s `selectable()`) to describe the marker in plain words instead of the non-glossary term "lifted button text": text Android shows inside a button, which the mapping lifts onto the button and marks unselectable.

Gates: `npm run check` green at commit `5e88209` (typecheck, 215/215 tests, build), worktree clean. Log: `$TMPDIR/implement-delegate-05-check.log`.
