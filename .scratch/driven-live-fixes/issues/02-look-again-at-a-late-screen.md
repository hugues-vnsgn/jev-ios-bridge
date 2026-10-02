# Look again at a screen that is still loading before scrolling to search

Status: resolved
Type: bug
Source: live trial 2026-10-02, both driven runs: the first `do` step's first capture was the app's launch screen ("Loading"). Jev said none of its 5 actions fit, and the bridge started the target search; its "scroll" counted as a change only because loading had finished meanwhile.

## Problem

A `do` step asks Jev about whatever the capture shows. A launch screen, or a list still filling in from the network, has nothing that does the step, so Jev answers `none_fits` or low confidence, and the bridge scrolls to search a screen that is about to change by itself. It recovers, but wastes a decision and a scroll, and the run log's search event is misleading. A version 1 script handles this with an explicit `wait` step; a `do` step shouldn't need one.

## What to build

When Jev's decision would start the target search, the bridge first waits briefly (1 s) and captures the screen again:

- the screen changed by itself: no search; Jev is asked about the new screen (the next decision);
- it didn't: the search runs as before.

At most 3 such looks per step, so a screen that keeps changing (a timer) can't hold a step forever. The wait is injected (`pause` in the step context), so step tests stay instant; `run.ts` wires an abortable delay. The decision budget and the stuck rules count as before.

## Acceptance

- A step that starts on a launch screen and moves by itself to the real screen makes no search scroll; Jev decides on the real screen.
- A screen that doesn't change searches exactly as in 1.3.0.
- A screen that changes on every look searches after the third look.
- Guide `13-driven-steps.md` describes the look.

## Comments

**2026-10-02, PR #39 review (Standards P2 + Spec P2, one defect): confirmed and fixed.** On an unchanged screen the look's new capture was discarded and the search acted on the older one. Android's driver acts only on its latest capture (`src/device/android/driver.ts:486`), so the search's first scroll was refused as stale and the step handed back `NONE_FITS` with no scroll: "searches exactly as in 1.3.0" didn't hold on Android. iOS wasn't affected in practice, but relied on refs staying the same between captures.

Fix: the search starts from the look's capture, and Jev's decision is carried to that capture's refs (`carryDecision`, matching elements by everything but the ref), so a hand-back's picks name elements of the screen it shows. The search does the same after each scroll that changes nothing; before, a hand-back after such a scroll could name refs of an older capture.

Coverage: a regression through the real Android driver (`tests/driven-late-screen.test.ts`: the search's swipe reaches the device, one Jev decision, `NONE_FITS` after the search); the step tests' fake device now acts only on its latest capture, like Android, which fails 8 step tests on the unfixed code; a refs-per-capture test checks that a hand-back's picks name refs on the paused screen.
