# Shipping the frozen Appium stack

Type: research
Status: open
Labels: wayfinder:research
Mode: AFK
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: none

## Question

How can the frozen Phase 1 stack reach a user's machine through the npm package
and the Claude Code plugin without a runtime download? The stack is appium-mcp
1.97.0 with its exact resolved graph, XCUITest 12.17.1, UiAutomator2 8.7.0 and
its server APKs, and WebDriverAgent 16.14.2, which Phase 1 built locally. The
second question is which MCP client package the bridge should use for its
private connection. The bridge already serves on `@modelcontextprotocol/server`
2.1.0, and Phase 1's client used `@modelcontextprotocol/sdk` 1.32.1.

## Required investigation or discussion

- What the resolved graph installs and how large it is. Which packages need
  install scripts, and what breaks when the plugin's `npm ci --ignore-scripts`
  skips them (`scripts/build-plugin.mjs`).
- How the XCUITest driver chooses its WDA: building on first use with
  `xcodebuild`, prebuilt or preinstalled options, simulator signing, and the
  derived-data and cache locations. Which settings stop newest-cache or
  latest-release selection (Spec Decision 8, Testing Decision 7). Where a frozen
  WDA artifact could live on a user machine, and what building it would cost
  the user (Xcode, time, disk).
- Whether the UiAutomator2 server APKs ship inside the npm graph, and how the
  driver checks or reinstalls them.
- MCP protocol-version negotiation between a 2.x client and appium-mcp's 1.x
  server. Whether both SDK generations can sit in one lockfile, and which
  client the private connection should use (spec "Entry and composition").
- Node 24 engine compatibility and licenses of the added graph.

Sources: `.scratch/appium-mcp-migration/candidate-stack/package-lock.json`, the
[freeze manifest](../../appium-mcp-migration/evidence/phase1-freeze-20261018.json),
`scripts/build-plugin.mjs`, `package.json`, and upstream source and docs at the
pinned versions. Reading only: no install into the repo, no device run.

## Completion criterion

A sourced answer with the viable delivery options and their trade-offs, the
recommended client package, the exact changes to the Phase 3 specification's
"Entry and composition" section, and any choice left for the owner, which then
becomes a grilling ticket.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md)
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md)
- [Published spec](../../appium-mcp-migration/spec.md), Decision 8, Testing Decision 7

## Comments

Charted on 2026-10-22.
