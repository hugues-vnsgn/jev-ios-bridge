# XcodeBuildMCP as the device layer: snapshot format, references, CLI, daemon

Type: research
Status: open
Blocked by: none

## Question

What exactly does XcodeBuildMCP (getsentry/XcodeBuildMCP, verified 2.7.0 locally) give the bridge, and how should the bridge invoke it?

Establish from the repo source, its docs site (xcodebuildmcp.com), and local runs against a booted simulator:

- The rs/1 `snapshot-ui` output: fields per element (element reference, role, label, value, frame, enabled, hittable), nesting, size in tokens for a typical screen, and how long an element reference stays valid (until next snapshot? across taps?).
- The `wait-for-ui` selector syntax and whether it can express "a label containing X is visible".
- Exact CLI invocation for `ui-automation snapshot-ui`, `tap`, `type-text`, `swipe`, `screenshot`, and `simulator launch-app` / `stop`, with the correct tool-name form; whether any tool supports JSON output on the CLI, or whether `--style minimal` text must be parsed; what the daemon holds and how a crashed daemon is recovered.
- Whether AXe is bundled or must be installed separately (not present at `/opt/axe/bin/axe` on this machine), and its Xcode 26 / iOS 26 compatibility.
- Session defaults in `.xcodebuildmcp/config.yaml` and how the bridge can pin a simulator and bundle id per repo.
- Whether it is feasible for the bridge to be an MCP client of XcodeBuildMCP over stdio (spawn `xcodebuildmcp mcp`), and the trade-offs versus CLI shell-out: latency, state, error shape.
- Physical device tool coverage, for the out-of-scope note only.

Write the findings to `docs/research/xcodebuildmcp-device-layer.md` on branch `research/xcodebuildmcp-device-layer`.
