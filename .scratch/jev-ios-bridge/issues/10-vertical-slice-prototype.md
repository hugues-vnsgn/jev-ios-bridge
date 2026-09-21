# Vertical slice: one scenario, one simulator, Jev choosing

Type: prototype
Status: open
Blocked by: 05, 07, 08, 09

## Question

Does the loop actually work end to end? Build a throwaway slice: `jev_run_mobile_test` over stdio, launching the sample app, observing via `idb`, asking Jev per step, performing the chosen action, checking one assertion, and returning the report. Run it from Claude Code via `/test-ios`.

The prototype answers: how many steps a two-screen scenario takes, how often Jev's confidence falls below threshold, the observe-decide-act latency per step, and whether the report is enough for Claude Code to diagnose a deliberately introduced bug. Link the branch and a sample report as assets.
