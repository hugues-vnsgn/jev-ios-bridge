# Observation mapping

Type: prototype
Status: open
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
