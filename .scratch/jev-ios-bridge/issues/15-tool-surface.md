# Tool surface: tools, report format, and /test-ios

Type: grilling
Status: open
Blocked by: 10, 11, 12, 13, 14

## Question

What exactly does the host agent call, and what does it get back? Decide:

- **The tools and their input schemas.** Start from: run a scenario, inspect device state, and get a report. Add a resume tool if "Step-loop policy: limits, thresholds, stop rules, escalation" chose escalation.
- **Call pattern:** one blocking call, or start and poll.
  - Claude Code moves calls longer than 2 minutes to the background.
  - Codex, supported on a best-effort basis, times out after 60 s by default, unless the user raises `tool_timeout_sec`.
  - The watch view from "Watch view: a localhost timeline page" affects how much a blocking call hides from the human.
- **The report's form:** Markdown `content` or typed `structuredContent`. When `structuredContent` is present, both hosts show the model only that, and image blocks cannot be sent alongside it.
- **The report's layout and size.** Claude Code warns above 10k tokens. Above 25k, it saves the output to a file and hands the model the path.
- **MCP TypeScript SDK line:** v1 (1.30.1) or v2 (2.1.0).
- **Packaging for `/test-ios`:** a project skill, mirrored in `.agents/skills` for Codex, or a plugin. A plugin installs in one step but namespaces the command.
