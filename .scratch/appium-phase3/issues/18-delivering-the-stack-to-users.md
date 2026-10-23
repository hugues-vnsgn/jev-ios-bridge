# Delivering the stack to users

Type: grilling
Status: resolved
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
Resolved on 2026-10-23 by the owner in a grilling session with the root; every choice took the recommended option.

## Answer

The owner accepts the recommended delivery: delivery option 3 with WDA option A
and client `@modelcontextprotocol/sdk` 1.32.1. It is recorded in
[ADR-0013](../../../docs/adr/0013-frozen-appium-stack-ships-as-release-archives.md),
and the locked text is in the Phase 3 specification's "Entry and composition".

1. **Apple-derived binaries.** Ship the exact Phase 1 runner. Apple's licence
   terms are unverified, and the owner accepts that risk.
2. **Size.** Accept it as-is, with no pruning. The shipped tree is the qualified tree.
3. **Host.** Apple silicon only. Any other host refuses before effects.
4. **iOS range.** Claim iOS 26.5 with Xcode 27.0 only. Other versions warn and
   continue, named as unsupported in the report and `doctor`.
5. **Node range.** Node 24 or later. Phase 4 adds one live case on Node 24.
6. **npm tarball.** Keep both channels supported.
7. **Extraction location.** One shared, content-addressed copy under the bridge's
   per-account location (`~/Library/Application Support/jev-ios-bridge/`).
8. **Licences.** A full third-party notices file at release: libvips (LGPL)
   unmodified with its licence and source link, CC-BY attributions, WDA's BSD
   text verbatim, and a hand check of packages with no licence metadata.
9. **Runtime download.** None, for any part, including the npm graph.
10. **Re-freezing.** Owner-triggered only, from a written recipe that the build
    plan adds.

- **Client package.** `@modelcontextprotocol/sdk` 1.32.1 is confirmed.
- **The qualified WDA runner.** The root made a read-only backup on 2026-10-23
  (`~/.codex/reports/jev-ios-bridge/phase3-build/wda-16.14.2-backup`, file-hash
  digest `24e98539…`, identical to the source). The 7.5 MB archive and its
  provenance record are committed in the first build PR that adds `stack/`.
  Until then, do not delete the `feat/appium-mcp-migration` worktree.

Spikes for the build plan or Phase 4: installing a roughly 100 MB archive plugin
from a real release, concurrent first use by two processes, the space in the
Application Support path, and the runner on other Xcode or iOS versions.
