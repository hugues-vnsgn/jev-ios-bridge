---
status: accepted
date: 2026-10-23
implementation: not-started
---

# The frozen Appium stack ships as release archives

The bridge ships the Phase 1 Appium stack as two archives built at release time, both inside the npm tarball and the plugin zip: the installed stack tree with a per-file hash manifest, and the exact WebDriverAgent runner that passed Phase 1's twelve live cases. On first use the bridge verifies and extracts them once, offline, into one content-addressed directory under its per-account location, which the CLI and the plugin share. Nothing is installed, built or downloaded at run time. A lockfile cannot carry the stack: Claude Code's plugin installer refuses the Phase 1 lock, and the npm tarball ignores a shipped lock for transitive versions. Building WebDriverAgent on the user's Mac would need Xcode, cost about 17 s and 216 MB, and produce a runner whose hash Phase 1 never proved.

The trade-offs are size, about 95 to 99 MB per artifact and about 375 MB on disk; redistributing Apple's XCTRunner and Xcode 27 framework copies inside the runner, which Appium also does but whose licence terms were not verified here; Apple silicon as the only host; and a support claim limited to iOS 26.5 with Xcode 27.0, where other versions warn instead of refusing. Changing the stack is an owner-triggered re-freeze: new lock, new runner, new hashes and the six iOS cases again. The private MCP client is `@modelcontextprotocol/sdk` pinned at 1.32.1, the SDK frozen inside the stack. This builds on [ADR-0010](0010-appium-mcp-as-the-shared-device-layer.md). The [Phase 3 specification](../../.scratch/appium-mcp-migration/phases/phase-3-adapter.md#entry-and-composition) holds the details, and the [shipping report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/shipping-frozen-stack/.scratch/appium-phase3/research/shipping-frozen-stack.md) holds the evidence.
