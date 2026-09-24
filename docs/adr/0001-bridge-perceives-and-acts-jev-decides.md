---
status: proposed
date: 2026-09-21
revised: 2026-09-24
---

# The bridge runs the loop; Jev only decides

Claude Code can already drive an iOS simulator through MobileBuildMCP. In Sentry's benchmark, Claude Opus 4.7 took 93 to 103 seconds and 14 to 19 tool calls per UI scenario, and every screen passed through Claude's context ([research](../research/claude-and-jev-integration.md), section 4). The bridge exists to make that cheaper. The host agent submits a scenario, the bridge carries out every step with Jev making each decision, and the host gets back a verdict and a report.

Jev cannot run a loop itself. It is a stateless, text-only judgment model. One request carries a state and a set of Choice, Noul, and Score questions, and returns typed answers with probabilities. It has no sessions, no actions, and no image input ([research](../research/jev-model-and-api.md)).

So the bridge owns the loop. At each step it:

1. observes the device as text;
2. asks Jev the step's questions, such as which candidate to act on and whether an assertion holds ("Feasibility plan: the go/no-go bar and the step questions" fixes the exact set);
3. performs the action.

When the run ends, it writes the report. Screenshots are kept for people, and never sent to Jev.

## Considered options

The research left two shapes viable. The owner chose between them on 2026-09-24.

- **Bridge-owned loop, Jev decides each step.** Chosen. The host submits one scenario and reads one report, and never sees the screens. A Jev request over a 5,000-token observation costs about $0.0002.
- **Claude drives the device, and the bridge offers Jev tools.** Rejected, whether Claude runs this in the main session or in a subagent on a cheaper model. Every step still costs the model two or three tool calls, and its context grows with every screen. For Jev to judge a screen, either Claude passes the snapshot through as tool input, or the bridge needs its own device access anyway.
- **Claude Code's built-in simulator driving**, through the Desktop simulator pane or computer use. Rejected for the same reason as the option above, with image tokens added at every step. Its speed is unmeasured.
- **Jev checks assertions only, and Claude drives.** Rejected as the smallest gain, because choosing each step stays with Claude.
- **A vision model chooses each step.** Rejected for v1 on cost. It stays available as escalation.

## Consequences

- **The decision rests on an unproven premise.** TypeSafe publishes no cookbook for choosing UI actions, and describes its models as "not agents". This ADR stays proposed until "Feasibility run: measure Jev on real screens" resolves. A go accepts it; a no-go reopens it.
- **Perception bounds the whole system.** The observation must fit Jev's budget: 64k tokens per request, 32k for the state plus the longest question, and at most 255 options per Choice. Apps with poor accessibility labels give Jev less to choose from.
- **Jev cannot write text.** Any value typed into the app has to come from the scenario.
- **Escalation to the host agent has a cost.** A tool call cannot ask the host anything while it runs, so escalating means ending the call and resuming the run in a later one. "Step-loop policy" decides whether v1 escalates at all.
- **The bridge owns timeouts, interruption, and cleanup**, since Jev holds no state.
- **If Jev gains image input**, the observation can carry an image, and the loop keeps its shape.

## Feasibility evidence, 2026-09-24

The first frozen experiment did not meet the agreed bar: 15/20 correct next actions against a required 18, and 7/20 accepted steps against a required 16. There were no wrong accepted actions, false-pass assertions, or request failures. The decision is reopened and remains proposed; it is not approved for release. [Ticket 08](../../.scratch/jev-ios-bridge/issues/08-feasibility-run.md) records the results. [Ticket 18](../../.scratch/jev-ios-bridge/issues/18-feasibility-revision.md) investigates a revision using fresh held-out evidence.

The second experiment also failed: 16/20 correct actions, 14/20 accepted, two incorrect accepted actions, and no false-pass assertions or request failures. [Ticket 19](../../.scratch/jev-ios-bridge/issues/19-checkpoint-feasibility.md) now tests explicit ordered checkpoints. It retains bridge-owned execution while narrowing what each Jev judgment must decide. General broad-goal navigation is not approved for release.
