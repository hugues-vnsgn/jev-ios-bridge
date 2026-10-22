# Delivering the stack to users

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: none

## Question

The research recommends shipping the frozen stack and the WDA runner as two
release-built archives (about 95–99 MB per artifact), extracted on first use,
with `@modelcontextprotocol/sdk` 1.32.1 as the private client. Does the owner
accept that delivery, and how are its open choices settled?

## Required investigation or discussion

Start from the
[shipping report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/shipping-frozen-stack/.scratch/appium-phase3/research/shipping-frozen-stack.md):
sections 7 and 8 compare the options, and section 10 lists the choices.
Settle:

1. **Apple-derived binaries.** Redistribute Apple-derived binaries inside the
   runner (`XCTRunner`, Xcode 27 XCTest, Testing and XCUIAutomation frameworks),
   or build WDA on first use (option B: about 17 s and 216 MB, and its hash
   differs from the qualified runner).
2. **Size.** Accept the size and disk cost (about 375 MB per extracted
   stack), or prune and re-qualify later.
3. **Host.** Apple silicon as the only supported host.
4. **iOS range.** The supported iOS runtime range. The runner is proven only on
   iOS 26.5 with Xcode 27.0.
5. **Node range.** Node 24 or later with host-only evidence for 24, or a live
   case on 24 in Phase 4.
6. **npm tarball.** Keep the npm tarball as a supported channel, or make the
   plugin the only one.
7. **Extraction location.** Where the extracted stack lives: the bridge's
   per-account location, or `${CLAUDE_PLUGIN_DATA}`.
8. **Licences.** A notices file, the LGPL libvips copy, the CC-BY packages,
   and WDA's BSD text under an Apache label.
9. **Runtime download.** Confirm that no runtime download is allowed, even for
   the npm graph.
10. **Re-freezing.** Who re-qualifies when Xcode or upstream changes.

Also confirm the client package, and decide whether to copy the qualified WDA
runner out of the untracked `runtime/` directory now. It exists only once.

## Completion criterion

The owner locks the delivery and each choice. Write the report's section 9
text, adjusted to those answers, into the "Entry and composition" section of
the Phase 3 specification. This choice is hard to reverse and costly to
change, so record it in an ADR. List the unverified spikes (installing a
roughly 100 MB archive plugin, first use racing in two processes) for the
build plan or Phase 4.

## Context

- [Shipping report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/shipping-frozen-stack/.scratch/appium-phase3/research/shipping-frozen-stack.md)
- [Published spec](../../appium-mcp-migration/spec.md), Decision 8, Testing Decisions 7 and 25
- `scripts/build-plugin.mjs`, `plugin/README.md`, `docs/guide/01-quickstart.md`

## Comments

Graduated on 2026-10-22 from Shipping the frozen Appium stack (section 10 of its report).
