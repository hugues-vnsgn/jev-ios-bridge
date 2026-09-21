# Map: jev-ios-bridge

Label: wayfinder:map
Created: 2026-09-21

## Destination

A spec for the bridge plus one working vertical slice: a single MCP tool that runs one scripted scenario on a booted iOS simulator, with Jev choosing each action from a text observation and judging the assertions, and returns a Markdown report Claude Code can act on.

## Notes

- Domain: agent tooling; Claude Code MCP servers, hooks, slash commands; iOS simulator automation; TypeSafe Jev.
- Read `CONTEXT.md` and `docs/adr/0001` before any ticket. Jev is text-only and stateless: the bridge perceives and acts, Jev decides.
- Skills every session should consult: `typesafe:typesafe-ai` (read the live docs), `grilling`, `domain-modeling`. Use `codebase-design` when a ticket shapes a module seam.
- Stack fixed during charting: TypeScript on Node 20+, `@typesafe-ai/sdk`, official MCP TypeScript SDK, and getsentry/XcodeBuildMCP as the device layer (see `docs/adr/0002`) behind a `DeviceDriver` seam. Whether the bridge or the host agent owns the loop is ticket 08.
- Blueprint and target tree: `docs/architecture.md`.
- Tracker: local markdown, see `docs/agents/issue-tracker.md`.

## Decisions so far

<!-- one line per resolved ticket: gist + link -->

## Not yet specified

- Which Claude Code hook events, if any, should trigger verification automatically (Stop, pre-commit, PostToolUse on Swift edits), and how noisy that is in practice. Depends on how long a run takes.
- How the report references artifacts (paths vs MCP resources) and how much evidence the host agent needs to fix a bug without opening screenshots.
- Details of the vision fallback: what the bridge hands back, and how the host agent's answer re-enters the loop.
- Optional in-bridge `xcodebuild` step: config shape, scheme discovery, incremental builds.
- Cost and latency budget per run and whether speculative fan-out per step is worth it.
- Distribution: npm package name, `npx` invocation, Codex MCP config snippet.

## Out of scope

- Physical iPhones: signing, `devicectl`, and an XCUITest runner bundle. Simulators cover the daily loop; revisit as a fresh effort.
- Writing our own simulator or UI automation code over `xcrun simctl` or `idb`. XcodeBuildMCP already does this; see ADR-0002.
- A Codex-native slash command. Codex gets the same tools over MCP.
- Sending screenshots to Jev. Not supported by the model.
