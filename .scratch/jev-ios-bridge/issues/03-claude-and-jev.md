# Claude and Jev: dividing the work

Type: research
Status: resolved
Blocked by: none

## Question

How can Claude and Jev split the work, given what Claude Code, Codex, MCP, and Jev support today? This also covers how to build and register an MCP server, and how a `/test-ios` entry point ships.

## Answer

**Host constraints:**

- A tool call cannot ask the host agent anything while it runs, so involving Claude mid-run means ending the call.
- When a tool returns `structuredContent`, Claude Code and Codex show the model only that.
- Codex times out tool calls after 60 s by default. Claude Code moves a call to the background after 2 minutes.

**Baseline:** in Sentry's benchmark, Claude driving MobileBuildMCP directly took 93 to 103 s and 14 to 19 tool calls per scenario.

**Tooling:**

- Custom slash commands are now skills.
- The MCP TypeScript SDK has a v1 line (1.30.1) and a v2 line (2.1.0).

**Two shapes remain viable.** The evidence rules out neither:

- Claude writes the scenario, the bridge runs the loop with Jev deciding, and Claude handles escalations.
- A Claude subagent drives MobileBuildMCP, with Jev as a cheap verifier.

The owner chose the first on 2026-09-24, because it costs the host one scenario submission rather than a model call per step. [ADR-0001](../../../docs/adr/0001-bridge-perceives-and-acts-jev-decides.md) records the choice.

Evidence: [claude-and-jev-integration.md](../../../docs/research/claude-and-jev-integration.md)
