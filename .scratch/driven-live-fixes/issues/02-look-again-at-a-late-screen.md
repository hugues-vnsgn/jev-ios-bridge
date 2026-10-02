# Look again at a screen that is still loading before scrolling to search

Status: ready-for-agent
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
