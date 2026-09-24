# Watching a run: options for a live view

Type: research
Status: resolved
Blocked by: none

## Question

How can a person watch a run while it is in progress, and what does each option cost? The view needs to cover:

- build output;
- each step, with Jev's choice and its probability;
- the screen;
- the app's own logs.

## Answer

**What the hosts show today:**

- The Claude Code CLI shows one progress line under a running tool call.
- It does not show MCP log messages, and MCP logging is deprecated.
- MCP Apps render in Claude Desktop and claude.ai, but not in the CLI.
- Claude Code Desktop has a simulator pane and a browser pane.

**The practical watch view** is a localhost page that the bridge serves from its run log. The cheap fallback is the Claude Code progress line plus a statusline. On a real iPhone, only the text parts carry over.

The ticket "Watch view: a localhost timeline page" makes the call.

Evidence: [human-watch-panel.md](../../../docs/research/human-watch-panel.md)
