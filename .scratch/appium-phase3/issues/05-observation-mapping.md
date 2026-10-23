# Observation mapping

Type: prototype
Status: resolved
Claimed by: root (Claude); artifact built by the Codex worker (brief ~/.codex/reports/jev-ios-bridge/phase3-build/P05-observation-prototype-brief.md); owner decides
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 03, 04

## Question

Which Appium page-source settings and XML-to-snapshot mapping keep today's
observation meaning? That covers roles, identifiers, labels, values,
placeholders, enabled/visible/focused/selected state, frames and scrollability.
How does the bridge detect an incomplete tree, and what replaces the
MobileBuildMCP tap-alias rule without invalidating a script that is valid
today?

## Required investigation or discussion

On the private pair, capture Appium XML and a screenshot for a handful of
diagnostic-app screens. Cover duplicate labels, parent/child controls,
disabled, invisible and password fields, empty hints, a scrollable list, a
changing screen and a large tree. Use candidate settings:

- iOS: `pageSourceExcludedAttributes` must not drop visible/accessible.
- Android: hierarchy compression, window selection, `snapshotMaxDepth`.

Run the captures through a rough, throwaway normalizer and diff them against
today's snapshot and rendered observation for the same screens, captured
through today's drivers. Show the owner the diffs.

Added from What the old vendors give us today:

- Record page-source latency for each platform; Settling and screen change
  under Appium needs these numbers.
- Read the UiAutomator2 and XCUITest idle and quiescence settings. Today's
  Android agent waits up to 2 s for idle.
- Decide what produces `truncated`, which has no live producer today.
- Map the iOS 15-role vocabulary (MobileBuildMCP's) and the Android roles
  against Appium element types.

Added from Device side effects of an Appium session: appium-mcp never applies
`appium:settings[...]` capabilities (iOS `pageSourceExcludedAttributes`
included) and drops `''` values. Apply the page-source settings through the
driver's settings call after the session is created, and verify they took
effect. The candidate settings above must be applied that way.

## Completion criterion

The owner reacts to the diffs and locks four things: the pinned source
settings, the role and field mapping table, the completeness and overflow
refusal rule, and the tap-alias handling (strict uniqueness, or an
Appium-specific equivalence with its own proof). Also lock who issues element
references and how they bind to the explicit session. Write the result into
the "Observation contract" section of the Phase 3 specification, and link the
prototype as an asset.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Observation contract"
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md), "Observation limits requiring explicit decisions"
- `src/device/android/mapping.ts`, `src/scripted/select.ts`
- Phase 4 judges both corpora through this normalizer, so mapping changes reach Jev.

## Comments

Charted on 2026-10-22.
Claimed and released on 2026-10-22: the owner paused work before the prototype started. A ready worker brief is at `~/.codex/reports/jev-ios-bridge/phase3-build/P05-observation-prototype-brief.md`.
Re-claimed on 2026-10-23: the owner resumed planning; the worker builds the prototype, the owner locks the mapping.
Resolved on 2026-10-23 by the owner after reviewing the prototype with the root.

## Answer

Prototype `prototype/observation-mapping` at `6e42862c9` (HTML, normalizer,
XML samples). The evidence is in `~/.codex/reports/jev-ios-bridge/phase3-build/P05-evidence/`.

- **Captures.** Both platforms were captured live on the private pair, four
  states each, with five timed captures per state. Android matched today's
  agent on every row (35 of 35). The iOS baseline is the committed MobileBuildMCP
  fixtures from 2026-09-24, because MobileBuildMCP cannot target the private
  set. Its three gaps are listed in the spec.
- **First iOS failure.** macOS remounted the iOS 26.5 runtime volume during
  boot, and CoreSimulator shut the simulator down ("a path is on an unmounting
  volume"). The retry waited for a stable mount. This is not a stack defect,
  but builds and Phase 4 should expect it.
- **Locked.**
  - the pinned source settings
  - the mapping rules
  - completeness refusal on hard signals
  - the tap alias kept as a vendor-free bridge rule, pending its unique-target
    proof
  - bridge-issued, snapshot-bound references

  The text is in "Locked observation choices" in the Phase 3 specification.
- **Not settled here.**
  - WDA's native idle and quiescence values were not read back (the prototype
    read driver-local settings). They move to Settling and screen change (16).
  - The unreachable features and the alias proof go to the new ticket
    [19](19-observation-coverage-on-a-fixture-app.md).
