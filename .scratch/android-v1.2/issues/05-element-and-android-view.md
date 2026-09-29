# Phase 3: the element's placeholder and selectable marker, and Jev's Android view

Status: ready-for-agent
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
