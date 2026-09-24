# Watching a run: options for a live human panel

> Written 2026-09-24 against the first draft of the docs, dated 2026-09-21. "Where the repo docs are wrong or stale" cites line numbers in that draft; the rewrite of the same day addresses each row. Ticket references use the names in the [re-charted map](../../.scratch/jev-ios-bridge/map.md).
Researched: 2026-09-24 · Sources:
- **MCP specification**, current revision **2026-07-28** (modelcontextprotocol.io, fetched 2026-09-24): `specification/versioning`, `specification/2026-07-28/changelog`, `/deprecated`, `/basic/utilities/progress`, `/server/utilities/logging`, `/server/resources`.
- **MCP extensions** (fetched 2026-09-24): `extensions/tasks/overview` (ext-tasks spec dir `2026-07-28`), `extensions/apps/overview`, `extensions/client-matrix`. MCP Apps spec `modelcontextprotocol/ext-apps/specification/2026-01-26/apps.mdx` ("Status: Stable (2026-01-26)", commit 298e884ec3) and `specification/draft/apps.mdx`. npm `@modelcontextprotocol/ext-apps` 2.0.0 (2026-09-17).
- **MCP TypeScript SDK**: v2 docs `ts.sdk.modelcontextprotocol.io/v2` via context7; npm `@modelcontextprotocol/server` 2.1.0 and `@modelcontextprotocol/sdk` 1.30.1 (both 2026-09-23).
- **Claude Code docs** (code.claude.com/docs/en/*.md, fetched 2026-09-24; line numbers refer to those fetches): `mcp`, `statusline`, `hooks`, `tools-reference`, `channels-reference`, `desktop`, `desktop-ios-simulator`, `agent-sdk/typescript`. **CHANGELOG** `anthropics/claude-code/CHANGELOG.md` (main, top entry 2.1.281). **Local Claude Code 2.1.280** binary and two probe runs, E1 and E2 (below).
- **Codex**: `learn.chatgpt.com/docs/extend/mcp?surface=cli` (the redirect target of developers.openai.com/codex/mcp, fetched 2026-09-24). `openai/codex` source: `codex-rs/rmcp-client/src/logging_client_handler.rs` at 61de0d8fe8 (2026-07-28) and `codex-rs/tui/src/chatwidget/protocol.rs` at 408a77dc1a (2026-09-23). Local `codex-cli 0.156.0`.
- **XcodeBuildMCP 2.7.0** npm package, read from the local npx cache (`X` below = `~/.npm/_npx/6389024b78b4e852/node_modules/xcodebuildmcp`), and its bundled **AXe 1.8.0**. GitHub release **v2.7.1** (2026-09-23) renames the project to **MobileBuildMCP** (npm `mobilebuildmcp` 2.7.1).
- **Apple**: local Xcode 26.4.1 (17E202), with `xcrun simctl help io`, `xcrun simctl help launch`, `xcrun xcresulttool` (version 24757), `xcrun devicectl device process launch --help`, and `xcodebuild -help`. developer.apple.com, fetched 2026-09-24: Device Hub pages, Xcode 27 release notes, `UIWindow.Level`, `NSLocalNetworkUsageDescription`, `NSAllowsLocalNetworking`, `accessibilityElementsHidden`. support.apple.com: iPhone Mirroring (120421) and the QuickTime "Record a movie" guide.
- **Build formatters**: `cpisciotta/xcbeautify` (release 3.2.1, 2026-04-04) and `xcpretty/xcpretty` (tag v0.4.1, last commit 2025-03-26). Neither is installed locally (`which xcbeautify xcpretty` found nothing).
- **Prior art**: Playwright docs (npm `@playwright/test` 1.63.0), with `test-ui-mode`, `trace-viewer` and `class-tracing` via context7. Maestro docs (`docs.maestro.dev/maestro-studio`, plus `mobile-dev-inc/maestro-docs` via context7). Repos: `mobile-next/mobile-mcp` (1.0.4, 2026-09-13), `mobile-next/mobilecli` (1.0.13, 2026-09-21), `appium/appium-inspector` (v2026.9.2, 2026-09-20), `FLEXTool/FLEX` (5.22.10, 2022-10-20), `kean/Pulse` (5.2.3, 2026-06-10).

**Local experiments** (all files in `/tmp/probe-mcp/`, none in this repo):
- **Probe server.** `server.mjs` is a stdio MCP server with no dependencies. It declares the `tools` and `logging` capabilities and has one tool, `slow_run`. Each step sends one `notifications/message` ("PROBE-LOG step i") and one `notifications/progress` ("PROBE-PROGRESS step i/N", progress i, total N), then sleeps.
- **E1 (print mode).** 3 steps, 2 s each: `claude -p "Call the mcp__probe__slow_run tool once and report its text result verbatim." --model haiku --mcp-config /tmp/probe-mcp/mcp.json --strict-mcp-config --allowedTools mcp__probe__slow_run --output-format stream-json --verbose`. The tool result was `done; progressToken=2 logLevel=null`.
- **E2 (interactive).** 6 steps, 3 s each: the same server, run from an interactive `claude` session driven in a pty by `pty_run2.py`. The raw terminal bytes are in `tty.raw`.
- **B1 (binary search).** `strings -n 12 ~/.local/share/claude/versions/2.1.280 > /tmp/cc-strings.txt`, then a search for `"mcp_progress"`, `Sep2663` and `resourceUri`.

## Answer

- **Inside Claude Code CLI today.** The human sees one line per running MCP call: the latest `notifications/progress` message and a percentage. It updates in place and disappears when the call ends (E2). A statusline that the user configures with `refreshInterval` can show more persistent run state, read from a file the bridge writes.
- **What does not show.** Logging notifications, MCP Apps, and MCP tasks (undocumented). A call that runs past 2 minutes moves to a background task.
- **Everything else needs a second surface:** the screen, a step timeline with screenshots, the build log, and the app's logs. Claude Code Desktop users already have two such surfaces: the iOS Simulator pane (live screen, simulators only) and a Browser pane that opens localhost pages.
- **Most plausible shapes:**
  1. Progress line plus statusline, both fed by the bridge's own JSONL run-event log. Size S.
  2. A localhost page served by the bridge, with an SSE timeline of steps (screenshot, Jev choice and probabilities), build stages, and build and app log tails. It opens in a browser or the Desktop Browser pane. Size M.
  3. The same page shipped as an MCP App. It works only in hosts that render MCP Apps (Claude Desktop chat, claude.ai, VS Code Copilot, Cursor), not in the Claude Code CLI. Size M on top of shape 2.
- **Physical iPhone.** Only the text parts carry over. XcodeBuildMCP 2.7.0 has no device screenshot, UI snapshot, video, or log capture.

## Findings

### 1. What Claude Code shows during a long MCP tool call

**Progress notifications are rendered, one line at a time.**
- Claude Code sent a `progressToken` with `tools/call` (E1 result: `progressToken=2`).
- In the interactive UI, the latest message appears under the running call as `⎿ PROBE-PROGRESS step 1/6 (17%)`. It is rewritten in place (`2/6 (33%)` … `5/6 (83%)`), and the row then collapses to `Called probe` with the line gone (E2, `tty.raw`).
- The render code in 2.1.280 reads only the last `mcp_progress` entry for the tool call:
  - `"<message> (<pct>%)"` when `progress` and `total > 0`;
  - otherwise the message alone;
  - otherwise `Processing… <progress>` (B1, offset ≈36.57M).
- So there is no history: the human sees the current step only.
- CHANGELOG 2.1.153: "Fixed MCP tool progress notifications not rendering in the collapsed tool view".
- The message text does not reach print mode or the Agent SDK. `tool_progress` messages are heartbeats every 30 s that carry the tool name and elapsed seconds, with no message field (agent-sdk/typescript.md:4932-4959). E1's stream-json contained none of the probe text.

**Logging notifications are not shown anywhere I could find.**
- The three `notifications/message` in E1 and the six in E2 appeared in none of these: the terminal output (`grep -c PROBE-LOG tty.raw` → 0), the stream-json output, or the MCP log file `~/Library/Caches/claude-cli-nodejs/-private-tmp-probe-mcp/mcp-logs-probe/*.jsonl`.
- Claude Code never called `logging/setLevel` (E1 result `logLevel=null`).
- No Claude Code doc or CHANGELOG entry mentions displaying them (grep of the changelog and mcp.md).
- Server stderr: in E1, the MCP log file held the server's first stderr line, written during connect ("Server stderr: probe got initialize"). It did not hold the four stderr lines written later.

**Timeouts** (mcp.md:405-435):
- The wall-clock limit is the per-server `"timeout"` in `.mcp.json`, else `MCP_TOOL_TIMEOUT`, else "about 28 hours". "Progress notifications from the server don't extend it" (mcp.md:411).
- A separate idle timeout aborts a call that sends "no response and no progress notification" for 30 minutes on stdio or 5 minutes on HTTP. It applies to stdio from v2.1.203 (mcp.md:415).
- `MCP_TIMEOUT` is the startup timeout (mcp.md:405).
- So progress notifications keep a quiet stdio run alive past 30 minutes, but not past the wall-clock limit.

**Automatic backgrounding** (mcp.md:421-435, CHANGELOG 2.1.212):
- A main-conversation MCP call still running after 2 minutes "moves to a background task". Claude gets a task ID and keeps working. The result arrives as a task notification.
- The task appears in `/tasks`, where it can be stopped, and does not survive exit.
- Tunable with `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`.
- Calls from subagents are not backgrounded. Nor are calls in `-p` mode (unless `CLAUDE_AUTO_BACKGROUND_TASKS=1`), or calls with an elicitation dialog open.
- What the human sees of progress once the call is backgrounded is **unverified**.

**Output limit.**
- There is a warning at 10,000 tokens and a default cap of 25,000 (`MAX_MCP_OUTPUT_TOKENS`).
- Above the cap, a text-only result is saved to a file in the session's `tool-results` directory, and Claude gets the path (mcp.md:407, 1259-1262).
- A tool can declare `anthropic/maxResultSizeChars` for its text, but image results stay bound by `MAX_MCP_OUTPUT_TOKENS` (mcp.md:1261, 1287-1290).
- For the panel this means a build log or app log belongs in a file or a link, not in the tool result.

**MCP tasks.**
- Neither the Claude Code docs nor the CHANGELOG mention MCP tasks (grep for `tasks/`, `SEP-2663`, "task handle").
- The 2.1.280 binary contains SEP-2663 code (`registerOrAdoptSep2663Task`, `startSep2663BackgroundDrive`) that turns a returned task into a background task and polls it. That code sits next to a gate function that returns `false` (`function gF(){return!1}`, B1).
- Treat tasks as **not available** and **unverified**.

**Background shells and the Monitor tool.**
- Bash `run_in_background` and Ctrl+B exist, but they background Claude's own shell commands, not an MCP call.
- The `Monitor` tool "runs a command in the background and feeds each output line back to Claude". It can also open a WebSocket, which needs v2.1.195 (tools-reference.md:39, 321-345).
- A monitor lasts 5 minutes by default and at most 30 (tools-reference.md:335).
- Pointed at a bridge's JSONL run log, the human would see Claude interject per event. Each event costs a model turn. How the raw lines are displayed is **unverified**.

**Statusline.**
- A `statusLine` command receives session JSON on stdin (including `cwd` and `session_id`, statusline.md:197-220) and prints one or more lines. OSC 8 links are supported (statusline.md:158-160).
- It re-runs on session events, debounced at 300 ms, and on a timer if `refreshInterval` is set (minimum 1 s) (statusline.md:69, 137-154).
- The docs suggest the timer "to keep time-based or externally-sourced segments current during idle periods" (statusline.md:154). That is exactly the case of a script that reads a run-state file written by the bridge.
- It is the user's setting. The bridge can document a snippet but cannot install it on its own.

**Hooks.**
- No hook fires during a tool call, except `Elicitation` and `ElicitationResult` (hooks.md:67-68).
- `systemMessage` is a "Warning message shown to the user" (hooks.md:958).
- `FileChanged` watches literal filenames in the working directory and fires "no matter what changed the file", including an outside process. In interactive sessions it "shows the `systemMessage` as a brief terminal notification" (hooks.md:2871-2946).
- A watched run-state file could therefore raise one toast per step. That is cheap to build but noisy.

**Channels.**
- An MCP server that declares `claude/channel`, and is opted in with `--channels`, can push messages into the session (mcp.md:390-394).
- Channels are a research preview. Custom channels need `--dangerously-load-development-channels` (channels-reference.md:10, 53).
- Channel messages cannot be carried on 2026-07-28 connections (mcp.md:394).
- The messages go to Claude, not to a human panel.

**Claude Code Desktop** (not the CLI) adds three panes:
- **iOS Simulator pane.** Public beta, Desktop v1.24012.0 or later, Xcode 26.x only. It "streams the device screen live", can record with Cmd+R, and lists every simulator for **Attach simulator** (desktop-ios-simulator.md:10-24, 60-71). It covers simulators only (desktop-ios-simulator.md:113).
- **Browser pane.** It opens localhost pages, HTML files and videos. Clicking a link in the chat offers "Open in app" (desktop.md:105-107, 123, 144).
- **Terminal pane** (desktop.md:190).

**Codex CLI.**
- The MCP `tool_timeout_sec` default is **60 s** and `startup_timeout_sec` is 10 s (learn.chatgpt.com MCP page). A multi-minute run in one call fails unless the user raises it.
- Its MCP client writes incoming progress and log notifications to its tracing log (`info!`, `warn!`, `error!`) (logging_client_handler.rs:63-70, 99-135).
- The TUI chat widget handles `McpToolCallProgress` in a no-op match arm (protocol.rs:342-382, the arm at line 361).
- So Codex's TUI shows neither.
- Codex does not appear in the MCP Apps client matrix (ChatGPT does).

### 2. MCP spec features for live visibility

**The current revision is 2026-07-28** (specification/versioning). Its changelog lists these relevant changes:
- MCP becomes stateless, with no `initialize` handshake.
- `resources/subscribe` is replaced by `subscriptions/listen`.
- `logging/setLevel` is removed; the log level now travels per request in `_meta` as `io.modelcontextprotocol/logLevel`.
- Tasks move from the core into the `io.modelcontextprotocol/tasks` extension.
- Server-initiated requests such as `elicitation/create` become multi-round-trip `InputRequiredResult` responses (changelog items 2, 4, 5, 6, 7).
- **Logging is Deprecated.** The migration path is "Log to `stderr` for stdio transports; use OpenTelemetry" (`/deprecated`).

Claude Code runs a v2 client runtime on "MCP TypeScript SDK 2.0, which adds MCP protocol revision 2026-07-28". It keeps stdio servers on the earlier handshake unless `MCP_PROTOCOL_NEGOTIATION=auto` (mcp.md:322-337).

| Feature | What the spec defines | Use for a panel | Claude Code renders | Other hosts |
| --- | --- | --- | --- | --- |
| Progress | Request-scoped `notifications/progress` with `progress`, optional `total`, and `message` that "SHOULD provide relevant human readable progress information"; rate-limit (`/basic/utilities/progress`) | One-line current step | Yes: latest message and % while the call runs (E2, B1) | Codex TUI: no (protocol.rs:361). Claude Desktop chat: **unverified** |
| Logging | Deprecated; request-scoped; clients "MAY present log messages in the UI" (`/server/utilities/logging`) | Little, and deprecated | No (E1, E2) | Codex: tracing log only (logging_client_handler.rs:99-135) |
| Resources and subscriptions | `subscriptions/listen` with `resourceSubscriptions` leads to `notifications/resources/updated` (`/server/resources`, "Subscriptions") | A `run://…/timeline` resource the host re-reads | Resources are readable by URI and via @-mention; no doc shows a subscribed resource being displayed live (CHANGELOG 2.1.281 line on resource lists) | **unverified** |
| Tasks (extension) | `CreateTaskResult` handle, `tasks/get` polling with status and status message, `tasks/update`, `tasks/cancel`, optional `notifications/tasks` (extensions/tasks/overview) | Matches the "run" lifecycle: start, poll, cancel | Not documented; binary code gated off (B1) | Client matrix has no Tasks column |
| Elicitation | Form and URL modes, delivered through `InputRequiredResult` in 2026-07-28 (changelog items 7, 11) | Not a viewer. URL mode could ask the human to open the panel URL, but the call blocks until they answer | Form and URL dialogs (mcp.md:1349-1360; CHANGELOG 2.1.76; URL mode on 2026-07-28 connections in 2.1.281) | n/a |
| MCP Apps (extension `io.modelcontextprotocol/ui`) | A tool declares `_meta.ui.resourceUri` (`ui://`). The host renders the HTML in a sandboxed iframe **in parallel with** `tools/call` (apps.mdx:1298-1322). Host-to-view notifications are `tool-input`, `tool-input-partial`, `tool-result` and `tool-cancelled`; there is **no tool-progress notification**, in draft either. The view can call `visibility: ["app"]` tools to poll (apps.mdx:1490). CSP `connectDomains` covers fetch, XHR and WebSocket (apps.mdx:246) | The natural inline panel | **No.** Claude Code is absent from the client matrix. 2.1.281 hides MCP Apps UI resources from resource lists. The Agent SDK passes `_meta.ui` through and offers an alpha `readMcpResource()` "so your application can render a tool's widget" (agent-sdk/typescript.md:582, 889-891, 4560) | Rendered by Claude (web), Claude Desktop, VS Code Copilot, M365 Copilot, Goose, Postman, MCPJam, ChatGPT, Cursor, Archestra, PostHog Code (client-matrix) |

An MCP App panel would therefore work when the bridge runs under Claude Desktop's chat or claude.ai. Whether Claude Code Desktop's Code tab renders MCP Apps is **unverified**. The panel would get live data by having the view poll an app-only status tool, since no progress stream reaches the view.

The TS SDK v2 sends progress from a handler with `ctx.mcpReq.notify({method:'notifications/progress', params:{progressToken, progress, total, message}})`, and logs with `ctx.mcpReq.log(...)` (ts.sdk.modelcontextprotocol.io/v2/servers/logging-progress-cancellation).

### 3. Out-of-band panel options

**a. Local web page served by the bridge**

What it takes:
- A `node:http` server bound to 127.0.0.1 inside the bridge process. It lives as long as the host keeps the stdio server running.
- An SSE endpoint. SSE needs no dependency and the browser's `EventSource` reconnects on its own (html.spec.whatwg.org/multipage/server-sent-events.html). WebSocket needs a library such as `ws`.
- One static page, plus routes that serve the per-step PNGs the bridge already plans to keep (docs/architecture.md:101, 117).
- **Build output.** The stage and diagnostic events come from XcodeBuildMCP's CLI `--output jsonl`, or from tailing its raw build log (section 5).
- **App logs.** Tail XcodeBuildMCP's `runtimeLogPath` and `osLogPath` (section 5).
- **Live screen (optional).** Two choices:
  - poll the XcodeBuildMCP `screenshot` tool;
  - or run the bundled `axe stream-video --udid <udid> --format mjpeg --fps 1-30` ("Stream simulator frames to stdout using screenshot capture"; `X/bundled/axe stream-video --help`). That is AXe, not an XcodeBuildMCP tool (`npx -y xcodebuildmcp@2.7.0 tools` does not list it). How its frames are delimited is **unverified**.

What the human sees:
- The whole timeline: step n, observation summary, the Jev question, the chosen candidate with probabilities, and the action.
- Build stages and errors.
- The app log.
- The step screenshot, or a live screen.

A Noul answer has no `confidence` field, only its probability (docs/research/jev-model-and-api.md:111-113). The panel has to show that value instead.

How it opens:
- A link in the tool result, report, or statusline goes to the system browser.
- In Claude Code Desktop, the Browser pane opens localhost (desktop.md:123, 144).

Physical iPhone:
- Timeline, Jev decisions, and build logs work.
- Screenshots and the live screen do not, because XcodeBuildMCP 2.7.0 has no device screenshot (the `X/manifests/workflows/device.yaml` tool list has none; `X/build/mcp/tools/ui-automation/screenshot.js:44-66` accepts simulators only).
- Device app logs would need `xcrun devicectl device process launch --console`, which "attaches the application to the console" (local `--help`). XcodeBuildMCP's device launch does not pass that flag (`X/build/utils/device-steps.js:15-35`).

**b. Terminal TUI**

What it takes:
- A second entry point, for example a `watch` subcommand, that reads the JSONL run log or the SSE feed.
- Ink (npm `ink` 7.1.1) or raw ANSI.

What the human sees:
- Separate panes for steps, Jev decisions, the build log and the app log.
- Screenshots only inline in iTerm2 (iterm2.com/documentation-images.html) or Kitty (sw.kovidgoyal.net/kitty/graphics-protocol). Elsewhere it shows file paths.

It runs in a second terminal, in tmux, or in the Claude Code Desktop terminal pane. On a physical iPhone the text parts all work.

**c. Tail-able JSONL or Markdown run log**

What it takes: the bridge appends one event per line to the run's artifact directory. The architecture already has `run/artifacts.ts` (docs/architecture.md:101).

What the human sees: raw lines via `tail -f run.jsonl | jq`, or a Markdown file written for reading.

It is also the data source for the progress line, the statusline, a `FileChanged` hook, the Monitor tool, the TUI and the web page. It works for any device.

**d. The Simulator.app window**

What it takes: nothing. XcodeBuildMCP's `open_sim` "Open[s] the simulator frontend for visibility" and is `readOnlyHint: true` (`X/manifests/tools/open_sim.yaml:6-12`).

What the human sees: the live screen only, with no steps or decisions. With several booted simulators, the human has to find the right window.

Xcode 27 changes this:
- Apple's WWDC26 recap says "the all-new Device Hub replaces Simulator".
- Device Hub "opens a compact window showing your app on a device screen", and for physical devices offers **View Screen** (developer.apple.com/documentation/xcode/device-hub and …/interacting-with-your-app-in-device-hub).
- Claude Code Desktop's pane "doesn't yet work with Xcode 27" (desktop-ios-simulator.md:24).

Physical iPhone, three ways to see the screen:
- Device Hub View Screen (Xcode 27).
- iPhone Mirroring (macOS 15 or later, iOS 18 or later). It requires the iPhone to be "locked and near your Mac" (support.apple.com/en-us/120421), which likely conflicts with a device under automation (**unverified**).
- QuickTime Player's New Movie Recording, with the iPhone chosen as the camera (support.apple.com/guide/quicktime-player/qtp356b55534/mac).

**e. Video recording**

What it takes:
- XcodeBuildMCP `record_sim_video` takes `start` or `stop`, `fps` 1-120 (default 30), and `outputFile` for the MP4 (`X/build/mcp/tools/simulator/record_sim_video.js:23-29`). It wraps `axe record-video` (`X/build/utils/video_capture.js:116`).
- Or run `xcrun simctl io <udid> recordVideo --codec h264|hevc <file>`. It writes "Recording started" to stderr and stops on SIGINT (local `xcrun simctl help io`).

What the human sees: a replay after the fact, not a live view. It becomes useful as a panel companion when the bridge timestamps each step so the page can seek the video to a step. That is what Maestro's recordings do: they "stitch the app screen and Flow output together" (maestro-docs flows/workspace-management/record-your-flow.md).

Physical iPhone: there is no device video tool in XcodeBuildMCP 2.7.0 (device.yaml). QuickTime or Device Hub can record by hand.

### 4. An overlay on the device

**How it would work.**
- A debug-only Swift package is linked into the app under test.
- It creates a second `UIWindow` at a higher `windowLevel`. "Even the bottom window in a level obscures the top window of the next level down" (developer.apple.com/documentation/uikit/uiwindow/level).
- The window passes touches through (`isUserInteractionEnabled = false`, or a `hitTest(_:with:)` override) and sets `accessibilityElementsHidden` (developer.apple.com/documentation/objectivec/nsobject-swift.class/accessibilityelementshidden).
- It shows the lines the bridge sends it over HTTP, SSE or WebSocket.

**Reaching the bridge.**
- On a simulator, reaching the Mac's localhost is assumed and **unverified here**.
- On a device, the app connects to the Mac over the LAN. That needs `NSLocalNetworkUsageDescription` ("why the app is requesting access to the local network") and, for plain HTTP, ATS `NSAllowsLocalNetworking`.
- An overlay like this is the only option that works the same on a simulator and a physical iPhone.

**Simulator-only alternative that changes no source:** inject a dylib at launch with `SIMCTL_CHILD_DYLD_INSERT_LIBRARIES`.
- simctl passes `SIMCTL_CHILD_`-prefixed variables to the app (local `xcrun simctl help launch`).
- XcodeBuildMCP's `launch_app_sim` takes `env` and adds the prefix itself (`X/build/mcp/tools/simulator/launch_app_sim.js:29-31`; `X/build/utils/environment.js:59-60`). In v2.7.1 that input becomes an array of `{key, value}` (release notes).
- Untested.

**Prior art.**
- FLEX shows "a toolbar that lives in a window above your application" and "works well in the simulator and on physical devices" (FLEX README). Its last release is 2022.
- Pulse has an in-app console (PulseUI), plus a macOS app that views an app's logs "in real time" via remote logging (Pulse README).

**The trade-off.** It modifies the app under test:
- a dependency and a debug build configuration that must never ship;
- a network channel, with a permission prompt on device;
- overlay pixels in every screenshot and video, which are the report's evidence;
- screen space covered on a small display.

The larger risk is that the overlay's views leak into the accessibility tree that `snapshot-ui` reads. They would then appear in the observation and candidates Jev chooses from, against ADR-0001's premise that Jev decides from the app's real state. `accessibilityElementsHidden` should prevent this. That it keeps the overlay out of AXe's `describe-ui` is **unverified** and would need a test.

Its one real advantage: code inside the app sees the app's own logs directly, including on a physical device.

### 5. Build logs specifically

**Raw `xcodebuild` output, and what Apple ships for it.**
- Raw output is long. `-quiet` prints "only warnings and errors".
- `-resultBundlePath PATH` writes a result bundle (local `xcodebuild -help`).
- After the build, `xcrun xcresulttool get build-results --path X.xcresult` gives a JSON summary of warnings, errors and destination.
- `xcrun xcresulttool get log --type build|action|console` extracts the logs (local `xcresulttool help get log`, version 24757).
- The result bundle exists only after the build, so it serves the report rather than a live view.

**Formatters.**
- xcbeautify is "a faster alternative to `xcpretty` written in Swift". It has `--renderer github-actions|teamcity|azure-devops-pipelines` and JUnit output.
- xcpretty is Ruby, with JUnit, HTML and JSON-compilation-database reporters.
- Both are used as `set -o pipefail && xcodebuild … | <formatter>` (READMEs).
- Either would be a new dependency. XcodeBuildMCP does not use them: it ships its own parser (`X/build/utils/xcodebuild-event-parser.js`), and `grep -rl 'xcbeautify\|xcpretty'` found no use.

**What XcodeBuildMCP 2.7.0 exposes.**
- **Raw build log, written as it arrives.** Each stdout and stderr chunk is `fs.writeSync`'d to `~/Library/Developer/XcodeBuildMCP/workspaces/<key>/logs/<tool>_<timestamp>_pid<pid>_<rand>.log` (`X/build/utils/xcodebuild-log-capture.js:22-46`; `X/build/utils/log-paths.js:3, 26-31`).
- The path comes back as `artifacts.buildLogPath` only in the final result (build-result schema v3; build-run-result schema v2). Tailing it live means watching that directory for the newest file.
- v2.7.1 moves the state directory to `~/Library/Developer/MobileBuildMCP` (release notes).
- **Parsed events.** The parser emits `build-stage` events (`RESOLVING_PACKAGES`, `COMPILING`, `LINKING`, `PREPARING_TESTS`, `RUN_TESTS`, `ARCHIVING`, `COMPLETED`), compiler diagnostics, and test progress (`X/build/types/domain-fragments.js:1-9`; `X/build/utils/xcodebuild-pipeline.js:8-19, 147-194`).
- **MCP mode** sends no progress or log notifications. `grep -rl 'progressToken\|notifications/progress\|sendLoggingMessage' X/build` found nothing. Diagnostics (errors, warnings, optional raw lines) arrive with the final result.
- **CLI mode** streams those events live as JSON lines with `--output jsonl` (`X/build/cli/register-tool-commands.js:170-175, 317-328`; `X/build/cli/jsonl-event.js:1-4`). In a TTY, the default text output shows the stage as a spinner (`X/build/utils/renderers/cli-text-renderer.js:127-133`). `--output raw` renders the subprocess transcript; whether it streams is **unverified**.
- **App logs on the simulator** are captured automatically at launch (`X/manifests/tools/launch_app_sim.yaml:6`):
  - `runtimeLogPath` comes from `xcrun simctl launch --console-pty --terminate-running-process <udid> <bundleId>`, with its stdout and stderr going to a file (`X/build/utils/simulator-steps.js:97-120`);
  - `osLogPath` comes from `simctl spawn <udid> log stream --predicate 'subsystem == "<bundleId>"'` (`simulator-steps.js:239-240`).
  - Both are plain files that can be tailed.
- **App logs on a device** are not captured (`X/build/utils/device-steps.js:15-35`).

For a panel, the cheapest live build view is XcodeBuildMCP's CLI `--output jsonl` stage and diagnostic stream. That requires the bridge to shell out to the CLI (Device driver ticket). The fallback is tailing the raw log file. The result bundle and `buildLogPath` then feed the report.

### 6. Prior art

- **Playwright UI mode.**
  - Shows a "timeline view of your test with different colors to highlight navigation and actions", an image snapshot per action on hover, per-action locator and duration, console logs and network requests.
  - Has a watch mode.
  - `--ui-port` and `--ui-host` serve it in a browser tab (playwright.dev/docs/test-ui-mode; test-cli).
- **Playwright Trace Viewer.** Shows the page "before and after each action" with log, source, network, errors and console (trace-viewer-intro). `tracing.start({ live: true })` (since v1.59) writes an unarchived trace "updated in real time … for live trace viewing during test execution" (class-tracing). This is the closest model for a "live timeline page".
- **Maestro Studio.** A desktop app to "run your tests step by step and see exactly what happens on screen at each stage". "Every run is recorded, so you can jump to any point" (docs.maestro.dev/maestro-studio). Maestro also records MP4s that combine the screen and the flow output (record-your-flow.md). `maestro test` writes a `commands.json` of step execution plus logs to the test output directory (test-reports-and-artifacts.md).
- **mobile-mcp** (mobile-next): exposes `mobile_start_screen_recording` and `mobile_stop_screen_recording`, and `mobile_get_device_logs` ("live device logs … optionally saved to a file"). It has no human panel (README lines 103-112). Its engine, **mobilecli**, streams "mjpeg/h264 video directly from device" (`mobilecli screencapture … | ffplay -`). On iOS that needs an on-device agent (mobilecli README lines 29, 106-112, 258).
- **Appium Inspector.** A GUI that shows "the application page screenshot along with its page source". It can attach to an already-running session by ID (README; appium.github.io/appium-inspector/latest/session-builder/attach-to-session). Whether its screenshot refreshes live is **unverified**.
- **XcodeBuildMCP.** It has no human panel. What it offers for visibility: `open_sim`, `record_sim_video`, automatic runtime-log files, and a CLI spinner (all cited above).
- **Claude Code Desktop iOS Simulator pane.** Anthropic's own answer to "watch Claude test an iOS app": a live, interactive device stream next to the chat, for simulators only (desktop-ios-simulator.md:13-14, 113).

### Comparison table

| Option | What the human sees | Build | Simulator | Physical device | Without leaving Claude Code | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| MCP progress line | One transient line under the running call: latest step message and % | S | Yes | Yes (text) | Yes, CLI (verified 2.1.280). Codex TUI: no | MCP SDK only |
| Statusline reading a run-state file | 1 to N persistent lines: step, Jev choice and confidence, build stage, panel link | S | Yes | Yes (text) | Yes, CLI, once the user adds `statusLine` with `refreshInterval` | User `settings.json`, a small script |
| `FileChanged` hook or Monitor tool | A brief toast per state-file write, or Claude's interjection per log line | S | Yes | Yes (text) | Yes | User hook config. Monitor costs a model turn per event and stops at ≤30 min |
| JSONL or Markdown run log | Raw event lines (`tail -f`), or a readable file afterwards | S | Yes | Yes | Partly (Desktop terminal pane, Monitor) | None |
| Local web page (SSE) | Step timeline with screenshots, Jev probabilities, build stages and log tail, app log tail, optional live MJPEG screen | M (L with live screen) | Yes | Timeline and logs only | Desktop: Browser pane. CLI: no, opens the system browser | `node:http`; optional bundled AXe `stream-video` |
| MCP App (the page above, inline) | Same page inside the chat | M on top of the web page | Yes | Timeline and logs only | No in the CLI. Renders in Claude Desktop chat and claude.ai | `@modelcontextprotocol/ext-apps` 2.0.0 |
| Terminal TUI | Panes for steps, Jev, build log, app log; images only in iTerm2 or Kitty | M | Yes | Yes (text) | Desktop terminal pane. CLI: no, second terminal | Ink 7.1.1 or raw ANSI |
| Simulator.app or Device Hub window | Live screen only | S (`open_sim`) | Yes | Device Hub View Screen (Xcode 27), iPhone Mirroring, QuickTime | No | Xcode |
| Claude Code Desktop iOS Simulator pane | Live interactive screen next to the chat | None | Yes (Xcode 26.x) | No | Desktop only | Desktop v1.24012.0+, public beta |
| Video recording | Replay after the run, seekable by step if timestamped | S | Yes | Not via XcodeBuildMCP | Desktop Browser pane plays video files | AXe or `simctl` |
| On-device debug overlay | Step and decision text drawn over the app | L | Yes | Yes | No | Swift package in the app under test, local-network channel, accessibility exclusion |

## Where the repo docs are wrong or stale

- `docs/adr/0002-xcodebuildmcp-as-device-layer.md:8` and `:19`
  - **Says:** "It also covers physical devices and macOS" and "Physical devices become cheap to add later since XcodeBuildMCP already supports them".
  - **What is true:** In 2.7.0 the device workflow is build, install, launch, stop and test only. It has no screenshot, `snapshot-ui`, UI automation, video, or runtime-log capture. The UI tools require a simulator.
  - **Source:** `X/manifests/workflows/device.yaml`; `X/build/mcp/tools/ui-automation/screenshot.js:44-66`; `X/build/utils/device-steps.js:15-35`. `.scratch/jev-ios-bridge/map.md:34` already expects an XCUITest runner for devices.
- `.scratch/jev-ios-bridge/issues/07-mcp-tool-surface.md:9`
  - **Says:** "(given Claude Code's tool timeout)".
  - **What is true:** Claude Code's default MCP tool timeout is about 28 hours. The constraints that actually bind are automatic backgrounding after 2 minutes, the 30-minute stdio idle timeout (reset by progress notifications), and Codex's 60 s `tool_timeout_sec` default.
  - **Source:** mcp.md:411-435; learn.chatgpt.com MCP page.
- `docs/architecture.md:114`, `docs/adr/0002…:8`, and every `xcodebuildmcp` CLI name in `docs/architecture.md`
  - **Says:** `.xcodebuildmcp/config.yaml`, `npx -y xcodebuildmcp@latest`.
  - **What is true:** v2.7.1 (2026-09-23) renamed the project to MobileBuildMCP. The package and binary are `mobilebuildmcp`, the config directory is `.mobilebuildmcp/config.yaml`, and the state directory is `~/Library/Developer/MobileBuildMCP`. npm `xcodebuildmcp` still tags 2.7.0 as latest.
  - **Source:** GitHub release v2.7.1 notes; `npm view mobilebuildmcp version` → 2.7.1. The XcodeBuildMCP inventory agent owns the details.

## Consequences for the plan

These are decisions the options raise. None are made here.

1. **A run-event stream becomes a module of its own.** Every option reads the same events: step, observation summary, Jev question and answer with probabilities, action, build stage, log pointers, verdict. The target tree in `docs/architecture.md:71-109` has `artifacts.ts` but no event bus. Decide whether the JSONL run log is the single source that everything else tails.
2. **Tool surface: synchronous or start-and-poll.** In Claude Code, a synchronous `jev_run_mobile_test` gets the progress line for 2 minutes, then becomes a background task. In Codex it fails at 60 s unless the user raises `tool_timeout_sec`. Start-and-poll works in both, but the progress line then only covers each short poll. The panel choice and this decision should be made together.
3. **Whether the bridge serves HTTP at all.** Open points:
   - port choice when several sessions or hosts spawn bridges;
   - binding to 127.0.0.1, plus a token in the URL;
   - the lifetime is the stdio process, so the page dies with the session;
   - how the human learns the URL: tool result, report, statusline, OSC 8 link, or a URL-mode elicitation that blocks the call.
4. **A live screen versus ADR-0002.** A live stream means running the AXe binary bundled inside XcodeBuildMCP (`stream-video`), which XcodeBuildMCP does not expose as a tool. The alternatives are per-step screenshots through XcodeBuildMCP, or asking upstream for the tool. Doing it directly would be the bridge's first device code of its own.
5. **Build visibility depends on the Device driver ticket.** Only the CLI (`--output jsonl`) streams build stages. The MCP client path returns `buildLogPath` at the end, so a live view has to tail XcodeBuildMCP's log directory, whose path changes with the MobileBuildMCP rename. The map's "optional in-bridge `xcodebuild` step" is the other route.
6. **Target MCP Apps now or later.** They reach Claude Desktop chat, claude.ai, VS Code Copilot and Cursor, but not the Claude Code CLI, which is the daily driver. They are worth doing only if the bridge will run outside Claude Code.
7. **Do not build on MCP logging.** It is deprecated in 2026-07-28 and neither Claude Code nor Codex shows it. The bridge's own stderr and its JSONL log are the durable channels.
8. **A device overlay would change what Jev sees**, unless its accessibility exclusion is proven. It also touches the rule that the bridge observes the unmodified app. Treat it as its own ADR if pursued.
9. **Claude Code Desktop's simulator pane is a free surface for the screen.** Whether it can attach to a simulator that XcodeBuildMCP drives without contention should be tested before building a screen view.
10. **Codex users see nothing inline.** If Codex matters, at least one out-of-band surface (log, TUI, or page) is required, not optional.
11. **Physical-device panels are blocked on the device driver**, which is out of scope anyway. Text-only surfaces carry over. Screens need Device Hub, iPhone Mirroring or QuickTime. Device app logs need `devicectl … --console`.

## Unverified

- What Claude Code shows of progress after an MCP call is auto-backgrounded at 2 minutes, including whether `/tasks` shows the progress message.
- Whether Claude Code captures stdio server stderr after connect anywhere other than `--debug` output. E1 logged only the first line.
- MCP tasks in Claude Code: the SEP-2663 code in the 2.1.280 binary sits next to a gate that returns false, and there is no doc or changelog entry.
- Whether Claude Code Desktop's Code tab or the VS Code extension renders MCP Apps. The Agent SDK documents only an alpha `readMcpResource()`.
- Whether Claude Desktop's MCP App sandbox honours a `connectDomains` entry for `http://127.0.0.1:<port>` (SSE or WebSocket to the bridge).
- How Monitor tool events appear to the human, and how the CLI displays image content from a tool result.
- Whether the Claude Code Desktop iOS Simulator pane can attach to a simulator that XcodeBuildMCP is driving without conflict.
- Whether Codex's core forwards MCP progress to `item/mcpToolCall/progress` at all. Its TUI ignores it at 408a77dc1a either way.
- The framing of AXe `stream-video --format mjpeg` output, and its CPU cost.
- Whether XcodeBuildMCP CLI `--output raw` streams during a build.
- Whether an overlay window with `accessibilityElementsHidden` stays out of AXe `describe-ui` and `snapshot-ui`, and whether an app on the simulator reaches the Mac's `localhost` without extra configuration.
- Whether iPhone Mirroring can run while an automation runner drives the device. Mirroring requires the iPhone to be locked.
- Whether `SIMCTL_CHILD_DYLD_INSERT_LIBRARIES` injection works for an overlay dylib on current simulator runtimes.
- Whether Appium Inspector's screenshot refreshes live when attached to a running session.
