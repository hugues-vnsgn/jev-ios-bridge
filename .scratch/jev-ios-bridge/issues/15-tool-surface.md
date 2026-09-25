# Tool surface: tools, report format, and /test-ios

Type: grilling
Status: resolved
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


## Answer

Use MCP TypeScript server 2.1.0 over stdio with three tools: `start_scenario`, `get_report`, and `cancel_run`. Start validates a complete strict script plus optional step/time limits and returns its run ID and token-protected watch URL. The public boundary rejects legacy autonomous inputs before device work. There is no device-inspection or resume tool: the host does not choose actions during a run.

Use start-and-poll, with a report wait bounded to 45 seconds. Running replies contain progress only. Cancelling a report wait does not cancel its run; `cancel_run` requests run cancellation and waits for termination and cleanup handling. A completed verdict remains recorded. Use text `content` only, avoiding host precedence rules for `structuredContent`.

Bound the final report to 24,000 UTF-8 bytes, prioritize terminal failed/inconclusive evidence, label truncation, and point to the full private journal and copied screenshots. Report and watch read the same checkpoint facts and final verdict. The installed Contacts smoke proves one start submission and one report retrieval through the actual packaged stdio server; it does not imply all longer scripts finish within one report wait.

Ship `/test-ios` as `skills/test-ios/SKILL.md` in the npm tarball. Copy it into `.claude/skills/test-ios/` for Claude Code, or `.agents/skills/test-ios/` for best-effort Codex use. MCP registration remains explicit. A host authors selectors, guards, typed values, and claims before starting, then reads the final evidence without supervising intermediate screens. The skill and usage docs disclose screen-text and report data flow.

These choices follow the accepted scripted contract and installed-host evidence under the owner's implementation-through-release delegation. The real-log watch verification in ticket 14 closes the remaining dependency.
