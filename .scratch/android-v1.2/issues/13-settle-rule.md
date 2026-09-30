# Phase 4: the settle rule

Status: closed
Closed: Merged into agent/android-v1.2-phase4 at e3ef028
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

## Comments

### 2026-09-30, claude-issue-13: built

**What.** `src/device/android/settle.ts`: `settle(capture, clock, signal)` over the device agent's raw tree (`{hierarchy: [...]}`), returning `{ tree, screenHash, settled }`, and `screenHash(tree)`, the only comparison, which the rule and the hash both use. It exports `AgentNode`, `UiTree`, `Capture`, `Clock` (`now()`, `sleep(ms)`), `SettledCapture`, `SETTLE_GAP_MS` (250) and `SETTLE_CAP_MS` (3,000). There is no production clock yet; the driver (Issue 14/15) supplies one.

**Choices, each within the spec's wording:**
- **The status bar** is any node whose `resource-id` starts with `com.android.systemui:`, **with its whole subtree**. The real captures at `2366759` hold status-bar icons (battery, the notification icon) with an empty `resource-id` inside `com.android.systemui:id/status_bar_container`. A flat filter, like the tracer's `signature`, would count them, and a battery tick would unsettle the screen. In all 10 captures the only systemui nodes are `status_bar_launch_animation_container` and `status_bar_container`, so nothing else gets dropped. The code would also leave out a notification shade or volume dialog, which is systemui too, and the Issue's own definition includes them.
- **The comparison** is every field of every node outside the status bar (`rect`, `focused` and so on included), with the keys sorted. `children: null` and a missing `children` count as the same. `screenHash` is the SHA-256 of that form, and two captures match when their hashes are equal.
- **The cap** is measured from the rule's start, before the first capture. No capture starts at or after 3 s. A capture already running may return after 3 s, and it settles if it matches: with about 0.6 s captures, the rule can end near 3.6 s. At the cap, the last capture comes back with `settled: false`.
- **The signal** is checked before each capture and throws `signal.reason`, as `src/device/index.ts` does. `sleep(ms)` takes no signal, as the Issue specifies, so an abort during the 250 ms wait still sits out the rest of the wait but issues no dump.

**Open-point defaults:** 11 (`settled: false` is what the driver records as "screen still changing"). 19 (settle after `am start -W`) needs nothing here; the driver calls `settle` after launch.

**Tests** (`tests/android-settle.test.ts`, 9):
- the release spec's fake-clock case (starts at `[0, 850]`, settled when the second capture returns at 1450);
- nothing settles on one capture;
- a change only in the status bar, including an icon with no systemui id, still settles;
- a screen that changes once then holds settles on the newer capture;
- a screen that keeps changing stops at the cap, not settled, with the last capture;
- no capture starts at exactly 3 s;
- an abort during the wait stops before the next capture;
- an already-aborted signal issues no capture;
- the hash sees every change outside the status bar and ignores key order.

**Gate:** `npm run check` passed, with 251 of 251 tests, at `c8b00fa`. `/code-review` against `166ddbd`: Standards found 0 hard violations and 8 judgement calls, of which 6 were fixed and 2 kept (`SettledCapture` stays a capture, not a snapshot, because mapping is Issue 12; the two abort tests keep their own inline clocks). Spec found 0 missing requirements, 0 scope creep and 4 notes: the cap overshoot, the systemui scope, abort during the wait, and what the hash covers. All four are recorded above, and a test at exactly 3 s was added. No device was touched.
