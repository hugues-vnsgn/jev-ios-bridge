# Shipping the frozen Appium stack

Type: research
Status: resolved
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

## Answer

Research resolution, 2026-10-22: the frozen stack cannot reach users through a
lockfile.

- **The plugin installer refuses it.** Claude Code 2.1.307's automatic plugin
  install refuses the Phase 1 lock for three reasons:
  - appium-mcp's optional `applesign` pulls two git-hosted dependencies
  - both drivers bundle copies of their dependencies (514 `inBundle` entries)
  - a fresh lock without the bundle flags fails in npm with `EUSAGE`

  This was tested in an isolated `/tmp` config; the real `~/.claude` was not
  touched.
- **The npm tarball doesn't freeze it either.** A tarball installed from a
  local file ignores its own shrinkwrap, so even today's tarball channel does
  not pin transitive versions.

Recommended delivery: two archives built at release time. Each is a plain file
outside `node_modules`, in both the npm tarball and the plugin zip.

1. **A stack archive.** It holds the tree from `npm ci --ignore-scripts` on the
   byte-identical Phase 1 lock, with a per-file manifest: about 88–91 MB
   gzipped, 368 MB extracted. It carries the UiAutomator2 APKs. A fresh install
   reproduced the Phase 1 tree byte for byte, apart from two optional wasm
   packages.
2. **A WDA archive.** It holds the exact Phase 1 runner: tree hash `5d1fc1c9…`,
   universal binary, 7.5 MB gzipped.

On first use the bridge verifies the hashes and extracts into a
content-addressed private directory, with no network, npm or `xcodebuild`.
Sessions then always pass `appium:usePreinstalledWDA=true` and the absolute
`appium:prebuiltWDAPath`, and refuse every other capability that selects a
WDA. The bridge never calls appium-mcp's prepare tools.

The private MCP client is `@modelcontextprotocol/sdk` pinned at exactly 1.32.1,
the version frozen inside the stack, negotiating `2025-11-25`. A 2.x client
would need legacy negotiation pinned, because `auto` starts an unowned second
child.

Other findings:

- **The qualified WDA runner exists only once.** It is untracked, inside the
  `feat/appium-mcp-migration` worktree's `runtime/`.
- **Upstream's prebuilt is not the qualified artifact.** Upstream's v16.14.2
  prebuilt zip was built with Xcode 16.4 and reports 16.14.1.
- **Both SDK generations load in the private child**, and Phase 1's
  loaded-file record left them out.
- **Apple silicon only for now.** The `@appium/coresim` native addon ships
  only a darwin-arm64 prebuild.

[Sourced report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/shipping-frozen-stack/.scratch/appium-phase3/research/shipping-frozen-stack.md),
branch `research/shipping-frozen-stack` at `ee6e24414`. Section 9 holds the
proposed text for "Entry and composition". It goes into the spec only when the
owner settles the delivery choices. No device run.

Map changes from this answer:

- The report's ten owner choices became the grilling ticket Delivering the
  stack to users.
- Session lifetime now waits on it, for WDA ownership.
- Extension contract gained the child-entry finding.
- Vendor report fields and stack provenance gained the unrecorded SDK loads.
