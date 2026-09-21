# MCP server, slash command, and hook conventions for Claude Code and Codex

Type: research
Status: open
Blocked by: none

## Question

What are the current, documented ways to (a) build a stdio MCP server in TypeScript with the official SDK, (b) register it with Claude Code and with Codex CLI, (c) define a `/test-ios` slash command that calls an MCP tool, and (d) run a verification hook on Claude Code lifecycle events?

Establish from primary sources (Claude Code docs, MCP TypeScript SDK README, Codex CLI docs):

- Package name and minimal `McpServer` + `StdioServerTransport` setup; how tools declare input schemas (zod) and return content; whether tools can return resources or only text/image content; long-running tool call guidance and progress notifications.
- `claude mcp add` syntax and the `.mcp.json` project-scoped file shape; equivalent Codex config (`~/.codex/config.toml` `mcp_servers`).
- Slash command file location and frontmatter (`.claude/commands/*.md`), how arguments are passed, and how a command instructs the agent to call a specific MCP tool.
- Hook events available (Stop, PreToolUse, PostToolUse, etc.), the JSON contract on stdin/stdout, exit codes, and timeouts. Which events fit "verify on the simulator after Swift edits".
- Default MCP tool call timeout in Claude Code and how to raise it, since a run may take minutes.

Write the findings to `docs/research/mcp-and-claude-code-integration.md` on branch `research/mcp-and-claude-code-integration`.
