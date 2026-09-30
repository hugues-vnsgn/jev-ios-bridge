# Phase 4: the settle rule

Status: claimed
Claimed by: claude-issue-13
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 4". The work is [the release spec's phase 4](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) item 7, and [open point 11](../../android-support/release-spec.md#open-points-for-the-executor). Read them in full, including the correction about when the 250 ms is measured. The detail below only adds acceptance criteria.

## What to build

New code goes in `src/device/android/`.

1. **`settle(capture, clock, signal)`**, where a capture is one `device.dump.ui` call (injected, so the rule knows nothing of the agent) and the clock gives `now()` and `sleep(ms)`.
   - Capture; wait until **250 ms after that capture returned**; capture again; compare. Measure from the earlier capture's return to the later capture's start, never between request starts.
   - Two captures match when they are equal with the status bar (`com.android.systemui:` nodes) left out.
   - When they differ, the newer capture becomes the one to match, and the rule repeats.
   - Cap it at 3 s. At the cap, return the last capture marked not settled, so the step records "screen still changing" (`settled: false`).
   - Return the settled tree and a `screenHash` built from the same comparison, so two settled captures that match have the same hash.
   - Check the signal before each capture, so an aborted run issues no further dump.
2. Keep the comparison in one function that both the rule and the hash use, so they can't drift.

## Acceptance

- The fake-clock test from the release spec: a first capture that returns at 600 ms, then the second capture doesn't start before 850 ms, nothing settles earlier, and a matching second capture settles when it returns.
- Tests: a change only in the status bar still settles; a screen that keeps changing hits the 3 s cap and comes back not settled with the last capture; a screen that changes once then holds settles on the newer capture; an aborted signal stops before the next capture.
- `npm run check` passes. No device is touched.
