# Driven-mode fixes from the first live trial (v1.3.1)

The first ticket-10 live trial (2026-10-02, one real app, iOS simulator, two read-only flows, one run each) ran each flow twice: Claude driving directly with XcodeBuildMCP, and Claude guiding Jev through driven mode. Safety held: 0 wrong actions, 0 false PASS, Jev made 10 of 13 actions. Cost didn't: the driven sessions cost 1.9–2.6× as much as Claude driving directly, almost all of it Claude's; Jev cost about $0.002 per run.

The raw evidence names the app's screens and records, so it stays local and uncommitted. These issues describe the problems generically.

| Issue | What | Status |
|---|---|---|
| [01](issues/01-ios-scroll-strokes.md) | iOS scroll up never moves a list under a fixed header; the screen-centre fallback scrolls the wrong way | ready-for-agent |
| [02](issues/02-look-again-at-a-late-screen.md) | Jev's first decision lands on the launch screen; a still-loading screen starts a pointless scroll search | ready-for-agent |
| [03](issues/03-write-verbs-in-read-only-steps.md) | A read-only (`effect: none`) step would carry out a confident pick of Approve, Send, Submit… | ready-for-agent |
| [04](issues/04-readme-cost-of-jev.md) | README: say what Jev costs, and where a driven run's money actually goes | ready-for-agent |
| [05](issues/05-driven-cost-on-short-flows.md) | Driven runs cost more than Claude driving directly on short flows | needs-triage |

01–04 ship together as v1.3.1. 05 is a design question for the next minor version.
