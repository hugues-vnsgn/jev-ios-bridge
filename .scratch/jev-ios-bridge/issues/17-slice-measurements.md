# Slice measurements: cost, speed, and diagnosis against the baseline

Type: task
Status: open
Blocked by: 16

## Question

Nothing to decide. The spec needs these numbers before it can say the bridge is worth building. Using the slice from "Vertical slice: one scenario end to end from Claude Code", measure:

- **Speed and cost, against Sentry's baseline.** Run the Weather, Reminders, and Contacts suites from the benchmark through the bridge. Record per scenario:
  - wall-clock time;
  - host tool calls;
  - host tokens;
  - Jev tokens and cost.

  The published baseline, Claude driving directly, took 93 to 103 s and 14 to 19 tool calls per scenario, but publishes no token counts. Rerun the baseline harness on this machine, capturing tokens, so the comparison covers cost as well as speed.
- **Per-step behaviour:**
  - latency per step, split into observe, decide, and act;
  - how often confidence falls below the threshold;
  - how often an element reference expires mid-step.
- **Diagnosis.** Build a two-screen SwiftUI app under `examples/`, plant a bug in it, and check whether the report alone lets Claude find the cause.

Resolve with the measurements table and a sample report, linked as assets.
