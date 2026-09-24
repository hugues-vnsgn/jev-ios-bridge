# Claude and Jev: dividing the work

> Written 2026-09-24 against the first draft of the docs, dated 2026-09-21. "Where the repo docs are wrong or stale" cites line numbers in that draft; the rewrite of the same day addresses each row. Ticket references use the names in the [re-charted map](../../.scratch/jev-ios-bridge/map.md).
Researched: 2026-09-24 · Sources:
- **Claude Code docs** (code.claude.com/docs/en/*.md, fetched 2026-09-24): `mcp`, `skills`, `hooks`, `plugins`, `sub-agents`, `headless`, `permissions`, `env-vars`, `agent-sdk/mcp`, `computer-use`, `desktop-ios-simulator`, `whats-new/2026-w30`.
- **Claude Code builds**: local `claude --version` = 2.1.280. npm `@anthropic-ai/claude-code` = 2.1.281 and `@anthropic-ai/claude-agent-sdk` = 0.3.281, both 2026-09-23.
- **MCP TypeScript SDK**: v2 docs at ts.sdk.modelcontextprotocol.io/v2 (fetched 2026-09-24), plus the v1 README via context7 (`/modelcontextprotocol/typescript-sdk/__branch__v1.x`).
- **MCP SDK packages on npm**: `@modelcontextprotocol/sdk` 1.30.1 (2026-09-23) and `@modelcontextprotocol/server` 2.1.0 (2026-09-23; 2.0.0 GA was 2026-07-27).
- **MCP spec**: changelog for revision 2026-07-28 (modelcontextprotocol.io).
- **TypeSafe docs** (docs.typesafe.ai `.md` pages, fetched 2026-09-24): models, how-to-build, confidence, confidence-routing, intent-routing, sde_cascade, parallel_questions, agent-skill, jaggedness (the jaggedness page was last reviewed 2026-09-17). Also `@typesafe-ai/sdk` 0.6.0 on npm (2026-09-15).
- **Claude model facts**: the `claude-api` skill bundled with Claude Code 2.1.280 (its model table is cached 2026-06-24), plus platform.claude.com/docs/en/build-with-claude/vision.md (fetched 2026-09-24).
- **Codex**: learn.chatgpt.com/docs/* (fetched 2026-09-24) and openai/codex source at tag `rust-v0.156.1` (2026-09-23). Local `codex --version` = 0.156.0.
- **MobileBuildMCP (formerly XcodeBuildMCP)**: GitHub release v2.7.1 (2026-09-23) and its `benchmarks/claude-ui` suites. Local MCP probe of `npx -y xcodebuildmcp@2.7.0 mcp` (tools/list only, no simulator calls).
- **Apple**: Xcode 27 release notes (developer.apple.com JSON, fetched 2026-09-24).
- **Other prior-art repos**: mobile-mcp, ios-simulator-mcp, appium-mcp, Maestro, Midscene, Arbigent, Mobilerun. Each is cited with its version below.
- **Local probes**: two `claude -p` runs against throwaway MCP servers in `/tmp/mcpprobe`, with commands given inline.

## Answer
- **The hard fact:** an MCP tool call cannot ask the host's model anything (sampling is deprecated in MCP 2026-07-28; elicitation reaches the human). Every point where Claude takes part ends a call, and the run has to resume in a new one.
- **(a) Bridge-owned loop:** ~0 host tokens per step, Jev ~0.1-0.3 s. Most bridge code. Codex's default 60 s tool timeout kills multi-minute runs.
- **(b) Claude-owned loop:** least bridge code. Sentry's own Opus 4.7 benchmark took 93-103 s and 14-19 host tool calls per scenario. Jev only helps if the bridge reads the screen itself, which means a device path anyway.
- **(c) Vision fallback:** an escalation rung, as TypeSafe recommends (low confidence goes to a reasoning model). It costs a suspend/resume protocol and 0.5k-4k image tokens per escalation.
- **(d) Claude authors, Jev executes:** cheap and complements (a). TypeSafe says agents write weak questions, and Jev cannot generate the text to type.
- **(e) Jev verifies Claude's claims:** cheap per check, but only if the bridge captures the observation.
- **Evidence favours** a (d)→(a)→(c) cascade or a subagent-hosted (b)+(e). Neither is ruled out.
- **Decide before the Tool surface ticket:** Claude Code (tested) and Codex (source) show the model *only* `structuredContent` when it is present. XcodeBuildMCP was renamed MobileBuildMCP on 2026-09-23.
- **Overlap to weigh:** Claude Code now drives the iOS Simulator natively (Desktop pane in beta, CLI computer use).

## Findings

### 1. Claude Code extension points (Claude Code 2.1.280/2.1.281)

**MCP servers**
- **Transports.** Claude Code supports stdio, HTTP, SSE and WebSocket. `claude mcp add --transport` does not accept `ws`. (https://code.claude.com/docs/en/mcp.md, "Option 4")
- **Adding a stdio server.** Syntax is `claude mcp add [options] <name> -- <command> [args...]`, and everything after `--` goes to the server untouched. Put another option between `--env` and the server name, because otherwise the name is read as another `KEY=value` pair. (mcp.md, "Option 3")
- **Adding an HTTP server.** `claude mcp add --transport http <name> <url>`, with `--header` / `-H`. Scopes are `local` (the default), `project` and `user`. (mcp.md, "Project scope" and the tips list)
- **`.mcp.json` shape.** It is `{"mcpServers": {"<name>": {"type": "stdio"|"http"|"sse"|"ws", "command", "args", "env", "url", "headers", "timeout", "alwaysLoad"}}}`.
- **Variable expansion.** `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url` and `headers`.
- **Project root.** Claude Code sets `CLAUDE_PROJECT_DIR` in a stdio server's environment.
- **Approval.** Project-scoped servers need approval in interactive sessions. In `claude -p`, the Agent SDK and cloud sessions they load without asking. (mcp.md, "Project scope", "Environment variable expansion", "Option 3")
- **Protocol runtime.** Claude Code runs a v1 or v2 MCP client (the v2 client is MCP TS SDK 2.0). On v2 it probes only HTTP servers for revision 2026-07-28 unless `MCP_PROTOCOL_NEGOTIATION=auto`, so **stdio servers connect on the 2025-era protocol by default**. (mcp.md, "MCP client runtimes"; env-vars.md)
- **Timeouts.**
  - `MCP_TIMEOUT` is the startup timeout, default 30 s.
  - `MCP_TOOL_TIMEOUT` defaults to 100,000,000 ms, about 28 hours.
  - A per-server `timeout` in `.mcp.json` overrides it, and progress notifications do not extend it.
  - The idle timeout is 30 min for stdio and 5 min for network servers. It resets on any response *or progress notification* (v2.1.187+). Change it with `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`.
  - A main-conversation call still running after 2 min moves to a background task (v2.1.212+, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`). Subagent calls and `-p` runs are not backgrounded. (mcp.md lines 405-437; env-vars.md)
- **Output limits.**
  - A warning appears above 10,000 tokens, and the default cap is 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`).
  - Text over the cap is saved to a file under `~/.claude/projects/.../tool-results`, and the model gets the path.
  - A tool may raise its own text limit with `_meta["anthropic/maxResultSizeChars"]`, up to 500,000 chars. Image content stays under `MAX_MCP_OUTPUT_TOKENS`. (mcp.md, "MCP output limits and warnings")
- **Tool search** is on by default. Only tool names and server instructions load at session start, and definitions load on demand. `alwaysLoad: true` exempts a server. (mcp.md, "Scale with MCP tool search")
- **What the model sees from a tool result** (verified locally, Claude Code 2.1.280):
  - If `structuredContent` is present, the model gets **only** its JSON. The `content` text block never reached the transcript.
    - Server: `/tmp/mcpprobe/sc-server.mjs`, which returns `content: "CONTENT-BLOCK-SAYS-ALPHA"` and `structuredContent: {"word":"STRUCTURED-SAYS-BETA"}`.
    - Command: `claude -p ... --mcp-config /tmp/mcpprobe/sc.mcp.json --strict-mcp-config --model claude-haiku-4-5`.
    - The transcript's tool_result was `{"word":"STRUCTURED-SAYS-BETA"}`, and `grep` finds 0 occurrences of ALPHA.
  - Without `structuredContent`, blocks pass through as follows (`/tmp/mcpprobe/rl-server.mjs`, session `4d979457…`):
    - `text` and `image` pass as native blocks.
    - `resource_link` becomes the text `[Resource link: report-DELTA] file:///tmp/mcpprobe/report-DELTA.md (run report)`.
    - An embedded `resource` becomes the text `[Resource from rlprobe at mem://embedded-EPSILON] EMBEDDED-EPSILON`.
- **MCP prompts** appear as `/servername:promptname (MCP)`, and typing `/mcp__server__prompt` also runs them. (mcp.md, "Use MCP prompts as commands")

**Skills and slash commands**
- "Custom commands have been merged into skills." `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy`, and old command files keep working. (https://code.claude.com/docs/en/skills.md, line 16)
- **Frontmatter** includes `name`, `description`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `context: fork`, `agent`, `background` and `argument-hint`.
- **Arguments** substitute through `$ARGUMENTS`, `$ARGUMENTS[N]` and `$N`. `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` are also substituted. (skills.md, frontmatter reference, lines 342-436)
- `allowed-tools` pre-approves tools for the invoking turn but does not restrict them. It uses permission-rule syntax, which accepts `mcp__<server>__<tool>` and `mcp__<server>__*`. (skills.md lines 526-545; permissions.md lines 185-197, 482-483)

**Plugins**
- A plugin is a `.claude-plugin/plugin.json` manifest plus root-level `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `monitors/`, `bin/` and `settings.json`. (https://code.claude.com/docs/en/plugins.md lines 170-190)
- **Plugin skills are always namespaced** as `/plugin-name:skill`. (plugins.md line 116)
- Users install with `/plugin marketplace add <repo>` and `/plugin install name@marketplace`. (plugins.md lines 363-364)
- **Precedent:** TypeSafe ships its own agent skill this way (`claude plugin marketplace add typesafe-ai/skills`, `claude plugin install typesafe@typesafe-ai`, invoked as `/typesafe:typesafe-ai`). (https://docs.typesafe.ai/agent-skill.md)
- Plugin subagents ignore the `mcpServers`, `hooks` and `permissionMode` frontmatter fields. (https://code.claude.com/docs/en/sub-agents.md line 236)

**Hooks** (https://code.claude.com/docs/en/hooks.md)
- **Events:**
  - Session and prompt: SessionStart, Setup, UserPromptSubmit, UserPromptExpansion.
  - Tool calls: PreToolUse, PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, PostToolBatch.
  - Display and agents: Notification, MessageDisplay, SubagentStart, SubagentStop.
  - Tasks and turn end: TaskCreated, TaskCompleted, Stop, StopFailure, TeammateIdle.
  - Environment changes: InstructionsLoaded, ConfigChange, CwdChanged, DirectoryAdded, FileChanged, WorktreeCreate, WorktreeRemove.
  - Compaction and model switch: PreCompact, PostCompact, PreModelSwitch, PostModelSwitch.
  - Elicitation and exit: Elicitation, ElicitationResult, SessionEnd.
  - (lines 33-67)
- **Handler types:** `command`, `http`, `mcp_tool` (calls a named tool on a connected MCP server), `prompt` and `agent`. (lines 406-615)
- **Input on stdin:** the common fields are `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `effort` and `hook_event_name`, plus event-specific fields such as `tool_name`, `tool_input` and `tool_use_id`. (lines 748-798)
- **Exit codes:**
  - 0 means success, and JSON on stdout is parsed.
  - 2 blocks on events that can block, with stderr or the JSON reason used as the message.
  - Any other code is a non-blocking error. (lines 800-866)
- **JSON output:**
  - Universal fields: `continue`, `stopReason`, `systemMessage`, `terminalSequence`. `suppressOutput` is accepted but does nothing.
  - Top-level `decision: "block"` plus `reason` works for PostToolUse, Stop and similar events.
  - PreToolUse uses `hookSpecificOutput.permissionDecision` (`allow`/`deny`/`ask`/`defer`).
  - `additionalContext` and similar strings are capped at 10,000 chars. (lines 931-1070)
- **Timeouts:** 600 s for command, http and mcp_tool hooks, 30 s for prompt hooks, and 60 s for agent hooks. The default drops to 30 s on UserPromptSubmit and 1.5 s on SessionEnd. (line 430, lines 1347 and 3358)
- **MCP matchers:** `mcp__<server>__<tool>` with regex. (line 357)

**Subagents**
- Frontmatter includes `tools`, `disallowedTools`, `model`, `mcpServers` (the name of a configured server, or an inline definition), `skills`, `maxTurns` and `background`. Tool rules accept `mcp__<server>` patterns.
- Each subagent runs in its own context window and returns a summary. (sub-agents.md lines 9-11, 306, 465, 505)

**Headless and CI**
- `claude -p` with `--output-format text|json|stream-json`, `--json-schema`, `--mcp-config`, `--strict-mcp-config`, `--allowedTools`, `--bare` and `--max-turns`. `--bare` skips auto-discovery of hooks, skills, plugins and CLAUDE.md. (https://code.claude.com/docs/en/headless.md)
- The Agent SDK packages are `@anthropic-ai/claude-agent-sdk` (0.3.281 on npm) and `claude-agent-sdk` for Python. MCP servers go in `mcpServers` or come from `.mcp.json` via `settingSources`. In-process SDK servers are exempt from the idle timeout. (https://code.claude.com/docs/en/agent-sdk/mcp.md; mcp.md line 415)
- CLI computer use is not available with `-p`. (https://code.claude.com/docs/en/computer-use.md)

**Claude Code already drives the iOS Simulator** (prior art, relevant to (b) and (c))
- **Desktop app:** the "iOS Simulator pane" is in public beta (Desktop v1.24012.0+, macOS, Xcode 26.x, not yet Xcode 27; Pro/Max/Team/Enterprise). Claude "installs the app, taps through it, and reads the screen", with one device per session. Screenshots go to Anthropic. (https://code.claude.com/docs/en/desktop-ios-simulator.md; whats-new 2026-w30)
- **CLI:** "Claude reaches the iOS Simulator through computer use", a built-in `computer-use` MCP server. It is a research preview on macOS, Pro/Max only, and interactive only (not `-p`). Screenshots are downscaled automatically, and one session at a time holds the lock. (computer-use.md)

**Which carrier for `/test-ios`, and what each costs to ship**

| Carrier | Invocation | Ships the MCP server too? | Cost to ship | Notes |
|---|---|---|---|---|
| Project skill `.claude/skills/test-ios/SKILL.md` | `/test-ios` | No; register separately (`.mcp.json` or `claude mcp add`) | One Markdown file | `allowed-tools: mcp__jev-ios-bridge__*` pre-approves the tools. The same file can sit at `.agents/skills/test-ios/SKILL.md` for Codex (`$test-ios`). This repo already mirrors `.claude/skills` and `.agents/skills`. |
| Legacy `.claude/commands/test-ios.md` | `/test-ios` | No | One file | Works, but has no supporting files or `name` field. Skills are preferred (skills.md line 131). |
| MCP prompt from the bridge server | `/jev-ios-bridge:test-ios (MCP)` | Yes, built in | Code in the server | Works in any MCP host that surfaces prompts. Claude Code splits arguments on whitespace (mcp.md line ~1510), which is awkward for a free-text scenario. |
| Plugin (skill + `.mcp.json` + hooks) | `/<plugin>:test-ios` | Yes | Manifest + marketplace repo | One install covers the server, the skill and the hooks. The name is namespaced. A plugin subagent cannot carry `mcpServers`. |
| Hook (`PostToolUse` on `Write\|Edit` of `*.swift`, or `Stop`) | Automatic | n/a | Settings JSON | An `mcp_tool` hook can call the bridge tool directly, with a 600 s default timeout. It fires on every edit or turn end, so it is noisy. |
| Subagent `.claude/agents/ios-tester.md` | Delegated | Can declare `mcpServers` (project-level only) | One file | Carrier for option (b) with its per-step tokens isolated (hybrid f2). |
| `claude -p` / Agent SDK | CI script | via `--mcp-config` | Script | No approval prompt for project servers. No computer use. No auto-backgrounding. |

### 2. MCP TypeScript SDK

**There are two package lines, and the repo docs name neither.**
- **v1:** `@modelcontextprotocol/sdk` 1.30.1 (npm, 2026-09-23). It needs `zod` `^3.25 || ^4.0` and Node >=18. The SDK imports `zod/v4` internally and accepts v3.25+. (`npm view @modelcontextprotocol/sdk peerDependencies engines`; README via context7)
- **v2:** `@modelcontextprotocol/server` 2.1.0 (npm, 2026-09-23; 2.0.0 was 2026-07-27). It depends on `zod ^4.2.0` and needs Node >=20. It implements spec 2026-07-28 and also serves 2025-era clients on stdio by default (`legacy: 'serve'`). (`npm view @modelcontextprotocol/server dependencies engines time`; https://ts.sdk.modelcontextprotocol.io/v2/index.md; /v2/serving/legacy-clients.md)

**A minimal server**
- v2, from https://ts.sdk.modelcontextprotocol.io/v2/index.md:
  ```ts
  import { McpServer } from '@modelcontextprotocol/server';
  import { serveStdio } from '@modelcontextprotocol/server/stdio';
  import * as z from 'zod/v4';
  serveStdio(() => {
    const server = new McpServer({ name: 'jev-ios-bridge', version: '0.0.1' });
    server.registerTool('run_scenario', { description: '…', inputSchema: z.object({ scenario: z.string() }) },
      async ({ scenario }, ctx) => ({ content: [{ type: 'text', text: '…report…' }] }));
    return server;
  });
  ```
- `StdioServerTransport` + `server.connect()` is still exported from `@modelcontextprotocol/server/stdio`. (/v2/get-started/packages.md)
- v1 imports from `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js`, and `registerTool` takes a raw zod shape. This was used in `/tmp/mcpprobe/sc-server.mjs`.
- On stdio, stdout is the protocol, so log with `console.error`. (/v2/get-started/real-host.md)

**Schemas and content types** (/v2/servers/tools.md)
- `inputSchema` is a zod object in v2, or any Standard Schema.
- Arguments that fail validation come back as a result with `isError: true`.
- `outputSchema` plus `structuredContent` is validated before the result is sent.
- Content blocks can be `text`, `image` and `audio` (base64 + `mimeType`), `resource` (embedded) and `resource_link` (a `uri` without bytes).
- `annotations` (`readOnlyHint`, `destructiveHint`, …) are hints only.
- Spec 2026-07-28 allows any JSON value in `structuredContent`. (https://modelcontextprotocol.io/specification/2026-07-28/changelog.md, minor change 10)

**Design constraint from section 1 and section 3:** both Claude Code and Codex hand the model only `structuredContent` when it is present. A Markdown report in `content` plus a typed verdict in `structuredContent` means the model never sees the Markdown, or the screenshots.

**Progress and long calls**
- Read `ctx.mcpReq._meta?.progressToken` and send `notifications/progress` via `ctx.mcpReq.notify`. `progress` must increase each time.
- `ctx.mcpReq.signal` aborts on cancel or disconnect. (/v2/servers/logging-progress-cancellation.md)
- MCP logging is deprecated in 2026-07-28 (SEP-2577), so log to stderr instead.
- Sampling and Roots are deprecated, too. The deprecation page says to "integrate directly with LLM provider APIs instead of Sampling".
- Tasks moved to an extension, `io.modelcontextprotocol/tasks`, which polls via `tasks/get`.
- Protocol sessions are removed. "Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments" (SEP-2567). This is the shape a suspended run needs. (spec changelog, major changes 1, 6 and 7; Deprecated item 1)

**How Claude Code treats timeouts and output:** see section 1. A stdio tool that sends progress at least every 30 min never hits the idle timeout, and the overall default is about 28 h. The binding constraints are elsewhere: auto-backgrounding at 2 min changes the UX (another agent covers that), and Codex's 60 s default applies (section 3).

### 3. Codex CLI (0.156.x)

- **`mcp_servers` shape.** `[mcp_servers.<name>]` takes `command`, `args`, `env`, `env_vars`, `cwd` for stdio, or `url`, `bearer_token_env_var`, `http_headers` for HTTP. Other fields are `startup_timeout_sec` (**default 10**), `tool_timeout_sec` (**default 60**), `enabled`, `required`, `enabled_tools`/`disabled_tools`, and a per-tool `output_token_limit`. (https://learn.chatgpt.com/docs/extend/mcp?surface=cli: "tool_timeout_sec (optional): Timeout (seconds) for the server to run a tool. Default: 60.")
- **CLI and scope.** The CLI form is `codex mcp add <name> -- <cmd>`. A project `.codex/config.toml` applies only to trusted projects. (learn.chatgpt.com/docs/config-file/config-basic, via subagent fetch)
- **Tool results.** When `structuredContent` is non-null, the model gets only its serialized JSON, and `content`, including images, is dropped. (`codex-rs/protocol/src/models.rs` lines 2301-2330 at `rust-v0.156.1`; test `preserves_structured_mcp_content` at line 3416)
  - Images otherwise pass through as data URLs.
  - Resource links reach the model as raw JSON text.
  - The TUI does not display progress notifications; the client only logs them. (`codex-rs/rmcp-client/src/logging_client_handler.rs`, via subagent)
- **Skills.** Codex supports skills. It scans `.agents/skills` from the cwd up to the repo root, plus user, admin and system locations. Invoke explicitly as `$skill-name`, or let Codex pick one implicitly. **Custom prompts are deprecated:** "Use skills for reusable prompts." (https://learn.chatgpt.com/docs/build-skills; /docs/custom-prompts)
- **`AGENTS.md`.**
  - Global scope: `~/.codex/AGENTS.override.md`, else `~/.codex/AGENTS.md`.
  - Project scope: Codex walks from the project root to the cwd and takes `AGENTS.override.md`, then `AGENTS.md`, then fallback names in each directory.
  - Files are concatenated root-down, up to `project_doc_max_bytes` = 32 KiB. (https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- **Hooks and plugins.** Codex also has hooks: PreToolUse, PostToolUse, Stop and others, with command or MCP-tool handlers, a 600 s default timeout, and hash-based trust. It also has plugins that bundle skills, MCP servers and hooks. (learn.chatgpt.com/docs/hooks; /docs/plugins, via subagent)

**"Codex gets the same tools over MCP" is true for tool discovery and calls, with three caveats:**
1. A multi-minute synchronous run fails at 60 s unless the user sets `tool_timeout_sec`.
2. `structuredContent` hides the report and images.
3. Progress is invisible.

A Codex entry point is now just a `SKILL.md` under `.agents/skills/`, not "out of scope".

### 4. Ways to divide the work

**Published and measured inputs used below**
- **Jev**
  - Price is $0.042 per million input tokens for `jev-1.13.0`, and output is free.
  - Limits: 64k tokens per request, and 32k for `state` plus the longest question.
  - Rate limits are 250k tokens/s and 1,200 requests/min, and are "adjusting dynamically". (https://docs.typesafe.ai/models.md)
  - "Most queries complete in about 100 ms." (https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)
  - 13 questions over a ~54,000-char state took 0.27 s and cost $0.000497 in one call. (https://docs.typesafe.ai/cookbooks/parallel_questions.md)
  - A 5k-token observation costs about $0.00021 per step (5,000 × $0.042/M).
- **Claude models**, from the claude-api skill table (cached 2026-06-24):

  | Model | Input $/M | Output $/M | Context |
  |---|---|---|---|
  | `claude-opus-5-5` | $4 | $20 | 1M (cache reads $0.20/M) |
  | `claude-opus-5` | $5 | $25 | 1M |
  | `claude-sonnet-5` | $2 | $10 | 1M |
  | `claude-haiku-4-5` | $1 | $5 | 200K |

- **Claude vision**
  - Cost is `⌈w/28⌉×⌈h/28⌉` visual tokens.
  - The high-resolution tier (Claude 4.7 and later) allows a 2576 px long edge and at most 4,784 tokens. The standard tier allows 1568 px and 1,568 tokens. (https://platform.claude.com/docs/en/build-with-claude/vision.md, "Resolution and token cost")
  - Computed from that formula:
    - A 1206×2622 px capture is downscaled to about 1185×2576, or **~3,956 tokens**, on the high-resolution tier.
    - The same capture is about 721×1568, or **~1,456 tokens**, on Haiku 4.5.
    - Pre-resized to 402×874 it costs **~480 tokens**.
  - The device-to-resolution mapping is unverified.
- **Claude computer use**
  - Opus 5.5 accepts only `computer_toolset_20260801`, which is GA on the Claude API with no beta header. Its screenshot and zoom results must fit image limits, because the API does not downscale them.
  - Sonnet 5 supports `computer_20251124` (beta).
  - Suggested screenshot sizes are 1080p, or 720p / 1366×768 for cost. (claude-api skill `shared/tool-use-concepts.md` § Computer Use; `shared/model-migration.md` Opus 5.5 breaking change 4 and the Sonnet 5 section)
  - Claude's coordinates are "approximate". (vision.md, Limitations)
- **Option (b) baseline**
  - MobileBuildMCP's `benchmarks/claude-ui` runs `claude -p` with Opus 4.7 on written UI scenarios. The weather prompt changes settings, searches, and verifies values.
  - Baselines: Weather 100.03 s / 14 tool calls, Reminders 92.79 s / 17, Contacts 102.94 s / 19. That is about 5.4-7.1 s per tool call, including device time. No token counts are published. (`gh api repos/getsentry/MobileBuildMCP/contents/benchmarks/claude-ui/suites/{weather,reminders,contacts}.yml`)
  - The snapshot-with-refs design cut tokens by about 68% and wall-clock time by about 70% versus the old approach on Weather. Only percentages are given. (MobileBuildMCP CHANGELOG.md line 96)
- **Tool-definition footprint.** XcodeBuildMCP 2.7.0 with `simulator,ui-automation` exposes 36 tools. Descriptions plus input schemas come to about 20.1k chars, and output schemas to about 199.6k chars. (local probe `/tmp/mcpprobe/probe2.mjs`)
  - With tool search on by default, only names load up front.
  - Whether Claude Code sends `outputSchema` to the model is unverified. The Messages API tool format has no output-schema field.
- **Host harness overhead.** A trivial 3-request `claude -p` run with Haiku 4.5 billed 63,517 cache-read tokens (about 21k of harness prefix per model request, with this machine's plugins loaded). It took 4.3 s of API time with a TTFT of 1.7 s. This is n=1 from the probe above, not representative.

**Options table.** Here "Host tokens/step" means tokens that enter the host model's context per scenario step. Every host model turn also re-reads the cached context prefix.

| Option | Host tokens/step | Latency/step | Autonomy | Failure modes | Build cost |
|---|---|---|---|---|---|
| **(a) Bridge-owned loop** (Jev decides every step; Claude reads one report) | **~0** during the run. Per run: the call arguments plus one report the bridge controls (warning at >10k tokens, cap 25k in Claude Code). | Jev ~0.1-0.3 s + MobileBuildMCP observe/act (unmeasured; Feasibility, Vertical slice). No LLM turn. | Full. Claude waits, and Claude Code auto-backgrounds after 2 min. | Thin accessibility tree; loops; Jev literal reading, weak numeric/spatial judgment, and steering by on-screen text (jaggedness #1, #2, #6); Jev cannot generate the text to type; the host cannot intervene mid-run; Codex 60 s timeout; a weak report hides the cause. | Highest: MCP server, device driver, observation pruning, policy, report. |
| **(b) Claude-owned loop** (Claude calls MobileBuildMCP; the bridge exposes only Jev tools) | Snapshot text S (unmeasured) + ~100-300 output tokens per call × 2-3 calls (observe, `jev_choose`, act) + an optional screenshot (0.5k-4k). The context grows every step. | Published: ~5.4-7.1 s per tool call (Opus 4.7), ~93-103 s per scenario. Jev adds ~0.1-0.3 s plus one more model turn. | The host drives. It adapts and recovers, and a human can watch. It is not autonomous. | Context growth over long scenarios; Claude can ignore Jev; `ui-automation` is off by default in MobileBuildMCP (local probe: "Only simulator workflow tools are enabled by default"); stale element refs; **if Jev tools need the screen, Claude must pass the snapshot as tool input (output tokens at 5× the input price) or the bridge needs its own device path anyway.** | Lowest in bridge code (a few tools + a skill), but see the last failure mode. |
| **(c) Claude as vision fallback** (a rung on (a) or (b)) | Only on escalated steps: a screenshot (≈480 / 1,456 / 3,956 tokens, see above) + the candidate list + ~200 output. Rate unmeasured (Feasibility). | +1 host turn + one resume call per escalation. | Breaks bridge autonomy at each escalation. | No in-call path to the host model: sampling is deprecated and elicitation goes to the user, so the run must suspend and resume via a handle; the image disappears if `structuredContent` is set (Claude Code and Codex); refs-only `tap` (the tap schema has only `elementRef`, per the local probe), so Claude can pick a ref but cannot tap an unlabelled pixel through this path. | Medium: suspend/resume protocol, run handles, artifact store. |
| **(d) Claude authors the scenario** | 0 per step. One-off per scenario: reading the diff or ticket plus writing the scenario (a few k tokens). | None per step. | Complements (a). | "Agents aren't great at writing questions, so expect to edit collaboratively" (https://docs.typesafe.ai/agent-skill.md, principle 3); literal reading; Claude may assert on implementation instead of visible behaviour; values to type must be written into the scenario (jaggedness #9). | Low: a skill + a scenario schema (Scenario language ticket). |
| **(e) Jev as cheap verifier** of Claude's screen claims | ~200-400 tokens per check **if the bridge captures the observation itself**. If Claude passes the observation, add its size as output tokens. | Jev ~0.1-0.3 s + one snapshot. | n/a; Claude still drives. | Noul has no `confidence` field (confidence.md); P(q) and 1−P(not q) are not complementary (jaggedness #8); thresholds need calibration on local data. | Low to medium: one or two tools + observation capture. |
| **(f1) Cascade: (d) → (a) → (c)** | ~0 per step; host tokens only at authoring and at escalations. | Like (a), plus one host turn per escalation. | High, with explicit handoffs. | Union of (a) and (c); tuning the escalation threshold. | Highest. |
| **(f2) (b)+(e) inside a subagent** (`.claude/agents/ios-tester.md`, `model: haiku`/`sonnet`, `mcpServers: [mobilebuildmcp]`) | Main context: ~summary only. The subagent context grows as in (b). | Like (b), with a cheaper model. | The subagent runs the loop and the main thread waits. | Subagent calls are not auto-backgrounded; plugin subagents cannot declare `mcpServers`; Codex has no equivalent carrier (unverified). | Low to medium. |
| **(f3) Native Claude driving** (Desktop simulator pane or CLI computer use) + (e) | Screenshot-driven, several k tokens per step (unmeasured). | Unmeasured. | The host drives. | Desktop pane is beta and not on Xcode 27; CLI computer use is Pro/Max only, interactive only, one session per machine; screenshots go to Anthropic; nothing for Codex. | Lowest (a verifier tool only). |

### 5. TypeSafe's own guidance on pairing System One with a reasoning model

- **Escalation.**
  - "Make code take different actions for confident and unconfident answers. Escalate uncertain cases to a person or a more expensive reasoning model. Test thresholds by plotting confidence against accuracy on your data." (https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md, "Route on uncertainty")
  - System One pages say answers carry confidence "so you can decide when to act and when to escalate to a person or a reasoning model". (https://docs.typesafe.ai/concepts/system-one.md)
- **Confidence bands.** Act on high confidence, proceed with caution on medium, and on low confidence "route to a human, request clarification, or fall back to a different system".
  - Thresholds scale with risk. The examples use a 0.5 or 0.6 floor and >0.85 for a high-stakes action.
  - Confidence exists only on Choice and Score answers. (https://docs.typesafe.ai/confidence.md; https://docs.typesafe.ai/patterns/confidence-routing.md)
- **Cascade.** The SDE cascade is: a cheap extractor → Jev verifies per field with Nouls framed so that "bad = TRUE" → escalate to a reasoning model if *any* flag fires (a `max` gate, `FIRE_T = 0.7`).
  - The verifier must be "independent and cheap".
  - An internal chart over 100 prompts puts the cascade frontier "up-and-left of every single model". It is a historical snapshot, not recalculated at current Jev prices. (https://docs.typesafe.ai/cookbooks/sde_cascade.md)
  - This maps to (e) and to (c)'s escalation gate.
- **Intent routing.** Classify first, then route to deterministic code, a specialist LLM, or a human. Escalate when "complexity > 1 or its confidence < 0.5". (https://docs.typesafe.ai/patterns/intent-routing.md)
- **Stance on agents.** "System One is TypeSafe's model for building AI-powered software, not agents. It does not generate code or choose its own next action", and "every loop introduces another opportunity to go off the rails". The recommended shape is: "Keep control flow, deterministic rules, and side effects in code." (how-to-build-with-system-one.md, lines ~238-260 of the fetched page)
  - Option (a) keeps the loop in code, with Jev choosing among candidates that code enumerates, much like the function-calling cookbook's closed sets. Whether a per-step "next action" Choice is still "gut-check" sized is untested. **Flag, do not decide.**
- **Jaggedness that bites this design** (jev-1.13, reviewed 2026-09-17; https://docs.typesafe.ai/model-jaggedness/jev-1.13.md):
  - Literal reading (#1).
  - Numbers and frames (#2).
  - Large irrelevant state (#5): prune the observation.
  - Adversarial content (#6): on-screen text is untrusted state.
  - Generation (#9): Jev cannot produce the strings to type.
- **Input.** "Pre-process non-text inputs (images, …) into text or structured fields before sending them as state." (models.md) This is consistent with Claude or the bridge transcribing, never Jev seeing pixels.

### 6. Prior art

- **MobileBuildMCP (formerly XcodeBuildMCP)**
  - v2.7.1 was released 2026-09-23. It renamed the npm package to `mobilebuildmcp`, the CLI binaries, the env vars to `MOBILEBUILDMCP_*`, and the config to `.mobilebuildmcp/config.yaml`. It also retired the `xcodebuildmcp.com` domain. The old npm package `xcodebuildmcp` stops at 2.7.0 (2026-07-23). (`gh api repos/getsentry/MobileBuildMCP/releases/latest`; `npm view mobilebuildmcp` → 2.7.1)
  - **Agent guidance** lives in the server instructions ("MUST call session_show_defaults…", "Only simulator workflow tools are enabled by default") and in tool descriptions. For example, `snapshot_ui` says "Observe once… refresh after navigation", and `tap` takes "one elementRef from the latest snapshot_ui". (local MCP probe of 2.7.0)
  - `mobilebuildmcp init` installs optional skills. No Claude Code plugin exists. (release notes; subagent read of repo)
  - **No natural-language runner or assertions.** `wait_for_ui` (a condition such as `textContains`) and `batch` are the closest things. (subagent read of `architecture-ui-automation.mdx`)
  - Its `benchmarks/claude-ui` harness is option (b) run by hand with Opus 4.7 (numbers above).
- **Xcode 27** (release notes, 2026-09): "Agents can now boot simulators, install and launch apps, synthesize touch events, and capture screenshots to verify UI behavior." Whether external hosts reach these tools via `xcrun mcpbridge` is unverified. Xcode 26.3+ exposes `xcrun mcpbridge` to Claude Code. (https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode, via subagent)
- **Claude Code itself:** the Desktop iOS Simulator pane and CLI computer use (section 1).
- **mobile-next/mobile-mcp** 1.0.5 (2026-09-23, Apache-2.0): about 30 primitives, accessibility tree first, then screenshots. No model inside and no loop. (https://github.com/mobile-next/mobile-mcp, via subagent)
- **joshuayoes/ios-simulator-mcp** 2.1.0 (2026-08-13, MIT): IDB-based primitives with coordinate taps. (via subagent)
- **appium/appium-mcp** 1.94.3: primitives plus an optional vision element finder, measured at 8.4-69 s per lookup. (via subagent)
- **Maestro `maestro mcp`** (CLI 2.10.0): the host writes YAML flows. `assertWithAI` is a screenshot yes/no check, experimental and optional by default. (via subagent)
- **Midscene.js `@midscene/ios`** 1.13.3: the closest to the bridge. `act` runs a natural-language multi-step task autonomously and `assert` checks a natural-language condition. It uses a vision model on screenshots at "about 1 minute" per command. Its MCP servers were retired in favour of skills plus CLI. (via subagent)
- **Arbigent** 0.85.0, **Mobilerun** v0.6.19 and **minitap mobile-use** v3.3.0: standalone autonomous agents with their own LLM loop. Arbigent reports about $0.005 per step with GPT-4o. (via subagent)

**What the bridge would add:** one MCP call instead of 14-19 host-model calls; a text-only per-step decider that costs about $0.0002 per step instead of a vision LLM; typed, calibrated assertion verdicts; and a report built for a coding agent. It would add nothing at the device layer.

## Where the repo docs are wrong or stale

- **`CONTEXT.md:7`**
  - Says: Codex uses "the same MCP surface".
  - What is true: yes, but Codex defaults `tool_timeout_sec` to 60 s, drops `content` and images when `structuredContent` is set, and does not show progress.
  - Source: learn.chatgpt.com/docs/extend/mcp; `codex-rs/protocol/src/models.rs:2301-2330`.
- **`CONTEXT.md:20`**
  - Says: the Report is "token-efficient Markdown".
  - What is true: if the tool also returns `structuredContent`, neither Claude Code (tested) nor Codex (source) shows the model the Markdown.
  - Source: local probe `/tmp/mcpprobe/sc-server.mjs`; Codex source above.
- **`CONTEXT.md:22`, `CONTEXT.md:23`, `docs/adr/0002...:8`, `docs/architecture.md:3,16,40,92,114`, `.scratch/.../map.md:15`**
  - Say: "XcodeBuildMCP", `xcodebuildmcp` CLI, `.xcodebuildmcp/config.yaml`.
  - What is true: renamed MobileBuildMCP in v2.7.1 (2026-09-23), with a new package name, `MOBILEBUILDMCP_*` env vars and `.mobilebuildmcp/config.yaml`. The `xcodebuildmcp` npm package is frozen at 2.7.0.
  - Source: GitHub release v2.7.1; `npm view mobilebuildmcp`.
- **`CONTEXT.md:25`, `docs/architecture.md:51-52`**
  - Say: the fallback hands the screenshot to the host model inside the loop (`B-->>CC` mid-loop).
  - What is true: an MCP server cannot reach the host model mid-call. Sampling is deprecated (SEP-2577), elicitation goes to the user, and Claude Code docs do not mention sampling support (unverified). The fallback must end the call and resume with a server-minted handle (SEP-2567).
  - Source: MCP 2026-07-28 changelog.
- **`docs/adr/0001...:22`**
  - Says: "Jev's 32k-token state limit".
  - What is true: 64k tokens per request; 32k applies to `state` plus the longest question.
  - Source: https://docs.typesafe.ai/models.md.
- **`docs/adr/0002...:8`**
  - Says: "Verified locally with version 2.7.0".
  - What is true: the binary on `PATH` is 2.6.2 (`/opt/homebrew/bin/xcodebuildmcp --version`), and the latest is `mobilebuildmcp` 2.7.1.
  - Source: local command; npm.
- **`docs/architecture.md:12`, `:105`**
  - Say: `/test-ios` is a "Slash command" at `claude/commands/test-ios.md`.
  - What is true: commands are merged into skills (`.claude/skills/test-ios/SKILL.md`), and `claude/` is not a directory Claude Code reads. In a plugin, the name becomes `/<plugin>:test-ios`.
  - Source: skills.md line 16; plugins.md lines 116, 170-190.
- **`docs/architecture.md:106`**
  - Says: `claude/hooks/verify-ios.sh`.
  - What is true: hooks live in settings JSON or a plugin's `hooks/hooks.json`, and an `mcp_tool` hook type can call the bridge tool without a shell script.
  - Source: hooks.md lines 546-600.
- **`docs/architecture.md:85`, `map.md:15`**
  - Say: "official MCP TypeScript SDK", `McpServer over stdio`.
  - What is true: two package lines exist, v1 `@modelcontextprotocol/sdk` 1.30.1 (zod 3.25+/4) and v2 `@modelcontextprotocol/server` 2.1.0 (zod ^4.2, Node >=20, `serveStdio`).
  - Source: npm; ts.sdk.modelcontextprotocol.io/v2.
- **`docs/architecture.md:113`**
  - Says: `TYPESAFE_JEV_API_KEY` is accepted as an alias.
  - What is true: the SDKs read only `TYPESAFE_API_KEY` (plus `TYPESAFE_BASE_URL`, `TYPESAFE_DEFAULT_MODEL`, `TYPESAFE_LOG_LEVEL`). The bridge would have to implement the alias itself.
  - Source: https://docs.typesafe.ai/sdk/javascript/api/variables/ENV.md.
- **`.scratch/.../02-...:9,15`**
  - Says: "slash command", `.claude/commands/*.md`.
  - What is true: skills are the current carrier, and commands still work.
  - Source: skills.md line 16.
- **`.scratch/.../02-...:13`**
  - Says: "whether tools can return resources or only text/image content".
  - What is true: `resource_link` and embedded `resource` are supported. Claude Code renders both as text for the model, and `structuredContent` replaces all `content` in both hosts.
  - Source: /v2/servers/tools.md; local probe.
- **`.scratch/.../02-...:17`, `07-...:9`**
  - Say: Claude Code's tool timeout constrains a multi-minute run.
  - What is true: the default `MCP_TOOL_TIMEOUT` is about 28 h and the stdio idle timeout is 30 min (reset by progress), so Claude Code is not the constraint. Codex's 60 s default is. Claude Code auto-backgrounds after 2 min.
  - Source: mcp.md lines 405-437; env-vars.md; Codex MCP docs.
- **`.scratch/.../08-...:13`**
  - Says: the host-owned loop is "Cheapest to build".
  - What is true: only if Jev tools never need the screen. Otherwise the bridge still needs a device path, or Claude pays output tokens to pass snapshots. A subagent carrier keeps per-step tokens out of the main context.
  - Source: sub-agents.md; pricing table in the claude-api skill.
- **`.scratch/.../map.md:36`**
  - Says: "A Codex-native slash command" is out of scope.
  - What is true: Codex custom prompts are deprecated. The native entry point is a skill in `.agents/skills/` (`$test-ios`), which costs one file.
  - Source: learn.chatgpt.com/docs/custom-prompts, /docs/build-skills.
- **`.scratch/.../map.md:25`**
  - Says: the hook candidates are "Stop, pre-commit, PostToolUse".
  - What is true: pre-commit is a git hook, not a Claude Code event. The relevant Claude Code options are PostToolUse (matcher `Write|Edit`), Stop, FileChanged, and the `mcp_tool` hook type.
  - Source: hooks.md lines 33-67.

## Consequences for the plan

- **The loop-owner decision** (since settled in ADR-0001) now has published numbers for (b): 93-103 s and 14-19 host calls per scenario with Opus 4.7. It also has a new hybrid to grill, (f2), the subagent-hosted loop. Flag: whether Jev adds value in (b) depends on whether the bridge captures observations itself. If it does, the bridge owns a device path in every option.
- **Tool surface** has a new constraint. Choose between a Markdown `content` report and a typed `structuredContent` verdict, or put the report inside `structuredContent`, because the model sees only one of them in both hosts. Returning screenshots as `image` blocks is incompatible with `structuredContent`.
  - The sync-vs-poll decision is now driven by Codex (60 s) and by Claude Code's 2-minute auto-backgrounding, not by `MCP_TOOL_TIMEOUT`.
- **Step-loop policy (escalation)** has to specify a suspend/resume contract: a run handle, a `needs_vision` result carrying the screenshot and candidates, and a resume tool. MCP sampling is not an option.
  - Open question: Claude can choose a candidate ref from a screenshot, but refs-only `tap` means an element missing from the accessibility tree cannot be acted on through MobileBuildMCP. Is that fallback worth having?
- **ADR-0002** needs a rename pass (MobileBuildMCP 2.7.1). Flag: the local 2.6.2 binary and the ADR's 2.7.0 no longer match the latest, and the old env var and config names are likely gone. That last point is inferred from the release notes, not tested.
- The first map's MCP and Claude Code research ticket is answered here and folded into "Claude and Jev: dividing the work".
- **Carrier.** A project skill (plus `.agents/skills` for Codex) is the cheapest `/test-ios`. A plugin gives one-step install but a namespaced command. TypeSafe's own skill uses the plugin route.
- **SDK line.** v1 vs v2. v2 is required for 2026-07-28 features, which Claude Code uses on stdio only with `MCP_PROTOCOL_NEGOTIATION=auto`.
- **New question: overlap with Claude Code's native iOS support** (the Desktop simulator pane, CLI computer use) and with Xcode 27 agent tools. Is the bridge's value the cheap per-step decider plus verdicts, rather than device reach? This affects the map's Destination.
- **New question (TypeSafe framing):** is a per-step "next action" Choice a System One-sized judgment? TypeSafe positions Jev as "not agents". The Feasibility prototype should measure the per-step confidence distribution before the loop owner is locked.

## Unverified

- Whether Claude Code sends MCP `outputSchema` to the model (it affects the tool-definition token footprint), and how it counts image tokens from MCP results against `MAX_MCP_OUTPUT_TOKENS`.
- Claude Code support for MCP sampling, for the tasks extension (`io.modelcontextprotocol/tasks`), and whether it displays progress notifications (the latter is out of scope here).
- Per-call latency of MobileBuildMCP `snapshot_ui`/`tap`, and the token size of a typical rs/1 snapshot. None is published (Feasibility, Vertical slice).
- Per-turn Claude latency for Opus 5.5 or Sonnet 5. None is published in the sources consulted; the only data point is n=1 locally with Haiku 4.5.
- Whether old `XCODEBUILDMCP_*` env vars and `.xcodebuildmcp/` still work in MobileBuildMCP 2.7.1. The subagent grepped the package and found no references, which suggests they do not.
- Whether Xcode 27's agent simulator tools are reachable from Claude Code via `xcrun mcpbridge`, and whether they expose the accessibility tree.
- The mapping of the 1206×2622 px example to specific iPhone models.
- The following Codex details, which came from subagent fetches and were not re-fetched by me: project `.codex/config.toml` trust rules, hook events and timeouts, plugin manifest paths, and the default `tool_output_token_limit`.
- Figures for other projects taken from subagent reads (Arbigent $/step, Appium lookup times, Midscene "about 1 minute"), except the MobileBuildMCP benchmark and changelog numbers, which I fetched myself.
