# jev-ios-bridge

jev-ios-bridge lets a coding agent verify an iOS app by submitting a scenario and reading back a verdict. The bridge runs the scenario on a simulator. At each step, TypeSafe's Jev model chooses what to do from a text view of the screen, and MobileBuildMCP does the device work.

There is no code yet. This repo holds the design, the decisions behind it, and the research that informed them.

## Why build it

Claude Code can already drive a simulator through MobileBuildMCP. In Sentry's own benchmark, Claude Opus 4.7 took 93 to 103 seconds and 14 to 19 tool calls per UI scenario, reading every screen into its context.

The bridge replaces all of that with one submission. Claude hands over a scenario and gets back a verdict and a report, while Jev makes each per-step decision. At Jev's price, a step over a 5,000-token observation costs about $0.0002.

Whether Jev can make those decisions well is unproven. TypeSafe publishes no examples of choosing UI actions, so the first real work is a feasibility test, and the rest of the design depends on its result.

## Status

- **Stage:** planning. Nothing is built.
- **Decisions:** [ADR-0001](docs/adr/0001-bridge-perceives-and-acts-jev-decides.md) and [ADR-0002](docs/adr/0002-mobilebuildmcp-as-device-layer.md) are *proposed*.
  - ADR-0002 becomes accepted when this review closes.
  - ADR-0001 stays proposed until the feasibility run resolves. A go accepts it; a no-go reopens it.
- **Route:** the [map](.scratch/jev-ios-bridge/map.md) lists every open decision and draws the order they have to be settled in.

## Reading order

This takes about 30 minutes.

1. [`CONTEXT.md`](CONTEXT.md): the vocabulary. Terms like *run*, *observation*, and *escalation* have exact meanings here.
2. [ADR-0001](docs/adr/0001-bridge-perceives-and-acts-jev-decides.md): why the bridge runs the loop and Jev only decides.
3. [ADR-0002](docs/adr/0002-mobilebuildmcp-as-device-layer.md): why MobileBuildMCP does all the device work.
4. [`docs/architecture.md`](docs/architecture.md): the context, the modules, one step, a run's lifecycle, and the hard limits.
5. [The map](.scratch/jev-ios-bridge/map.md): the destination, the route, and what is out of scope. Then skim the [tickets](.scratch/jev-ios-bridge/issues/). Each is one page.

The evidence is in [`docs/research/`](docs/research/). Read it as needed; each note opens with a short answer.

## How the map works

The map follows the same conventions throughout:

- **Each ticket asks one question**, and the ticket is resolved when the question is answered.
- **A ticket has one of four types:**
  - *research* reads primary sources;
  - *prototype* builds something rough to react to;
  - *grilling* is a decision made in conversation with the owner;
  - *task* is work that has to happen before a decision can be made.
- **A ticket's status** is one of four:
  - *open*;
  - *claimed*, with a `Claimed by:` line naming who is working it;
  - *resolved*;
  - *out-of-scope*: closed without an answer and left off the route.
- **The frontier** is every open ticket whose blockers are all resolved, so it can be taken now. The route diagram in the map shows the frontier in green.

## What we would like from you

1. Is the case for the bridge convincing, compared with Claude driving MobileBuildMCP directly? What would make it not worth building?
2. Would you reverse either ADR?
3. Is the feasibility test a fair gate? See [Feasibility plan](.scratch/jev-ios-bridge/issues/07-feasibility-plan.md). What result would convince you?
4. Is anything missing from the route, in the wrong order, or wrongly out of scope?
5. Does any glossary term mean something different to you than its definition says?

Leave line comments on the review commit on GitHub, next to the line you're reacting to. Open an issue for anything broader than one line.

## What changed since the first draft

The first draft was dated 2026-09-21. Since then:

- **The device layer's name changed.** XcodeBuildMCP was renamed MobileBuildMCP on 2026-09-23. We pin `mobilebuildmcp@2.7.1`.
- **ADR-0001 now makes its case.** It states why the bridge is worth building, and rules out any loop run by Claude, whether in the main session or in a subagent.
- **ADR-0002 is corrected.** Element references turned out to be short-lived handles, not identities.
- **Real iPhones are sized.** MobileBuildMCP cannot automate a real iPhone's UI. A resolved research ticket sizes the second device layer that would take: WebDriverAgent through Appium, medium effort.
- **The vision "fallback" became *escalation*.** It is an open decision, because a tool call cannot ask Claude anything mid-call.
- **A watch view joined the route:** a localhost page that shows a run as it happens.
- **Feasibility comes first, in two parts.** A plan fixes the bar and the questions before any data exists. A run then measures Jev against them.
- **Jev's limits are corrected:** 64k tokens per request, and 32k for the state plus the longest question.
- **The target file tree is gone.** The architecture page instead names each module and the ticket that defines it.
- **The runtime target is Node 24.** Node 20 reached end of life on 2026-04-30 ([Node.js release schedule](https://github.com/nodejs/Release#release-schedule)).

## Layout

```
CONTEXT.md                  glossary
docs/adr/                   decisions, currently proposed
docs/architecture.md        how the parts fit
docs/research/              evidence, one note per question
.scratch/jev-ios-bridge/    the map and its tickets
scripts/render-route.py     redraws the route diagram in the map
AGENTS.md, docs/agents/     instructions for coding agents working in this repo
```
