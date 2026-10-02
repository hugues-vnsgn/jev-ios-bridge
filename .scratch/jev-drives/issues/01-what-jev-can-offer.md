# What Jev can offer a driver loop

Type: research
Status: resolved
Blocked by: none

## Question

Can Jev choose the next action on a screen, and in what call shape? What can't it do?

## Answer

See [research/typesafe-capabilities.md](../research/typesafe-capabilities.md). Choice over a bridge-built list of complete actions (tap X, type Claude's value into F, scroll, back, step done, stuck), asked together with "is the step done?" and "is the goal reached?". Text only, no free text, stateless. TypeSafe's "confidence-gated routing" pattern matches the hybrid: act above a floor, stricter floor for risky actions, otherwise hand the step to Claude.

Second source: [research/claude-jev-orchestration.md](../research/claude-jev-orchestration.md) (Codex, 2026-10-01): the same conclusion from TypeSafe, Anthropic and MCP docs; Choice confidence is answer concentration, not a measured success rate; MCP elicitation is a user dialog, not a callback into Claude; Claude Code's own simulator control (Desktop pane, CLI computer use) is a possible baseline, but computer use doesn't run under `claude -p`.
