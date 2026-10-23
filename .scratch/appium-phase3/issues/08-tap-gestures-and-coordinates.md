# Tap, gestures and coordinates

Type: prototype
Status: resolved
Claimed by: root (Claude); evidence built by the Codex worker (brief ~/.codex/reports/jev-ios-bridge/phase3-build/P08-tap-gestures-brief.md); owner decides
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 04, 05

## Question

How should tap, swipe, scroll and back be dispatched so that each authorized
input is exactly one native attempt, with today's geometry and action-path
meaning? And how do Android screenshot coordinates map to device input?

## Required investigation or discussion

On the private pair:

- Compare an element click with a W3C pointer tap at the resolved frame
  centre. Count native inputs, and check for hidden retries in appium-mcp's
  gesture handlers.
- Swipe and scroll as W3C sequences matching today's geometry and timing
  (largest-scrollable versus screen-middle `actPath`).
- Android BACK key. iOS back through the navigation button or a left-edge
  swipe.
- The observed iOS single tap with a hold.
- Android screenshot pixel size against the window rect and orientation. Use a
  second screen size only if a second private AVD costs nothing extra;
  otherwise two-size proof stays in Phase 4.

Added from What the old vendors give us today:

- Screenshot size and format. Both vendors return a ≤800 px JPEG today;
  Appium returns a native PNG. The choice decides the `tapAt` pixel space,
  the evidence file names and the observed 10 MiB cap.
- No AXe tap exists in code. iOS `tapAt` is a refusal today, so there is
  nothing to port for it.

## Completion criterion

The owner locks the dispatch form for each operation, which operations need
the extension, and the coordinate conversion and refusal rule. Write these
into the "Operation contract" section of the Phase 3 specification.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Operation contract"
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md), "Tap, swipe, back, scroll" and "Screenshot-coordinate tap"
- `src/device/index.ts` (`backButtonOf`, `largestScrollable`, `scrollFinger`, `screenPointOf`, `tapOnce`), ADR-0007

## Comments

Charted on 2026-10-22.
Resolved on 2026-10-23 by the root under the owner's grant to decide.

## Answer

Prototype `prototype/tap-gestures` at `50810ecac`. Evidence is in
`~/.codex/reports/jev-ios-bridge/phase3-build/P08-evidence/`.

- One app callback for every element click, W3C centre tap, vertical stroke
  and back action, on both platforms.
- The frozen convenience handlers hide retries (up to three mutations for an
  iOS swipe, two for a long press), so every input becomes one explicit W3C
  sequence.
- The iOS scroll keeps the actual 28% stroke. The Android identity conversion
  is proved at 320×640.
- The iOS edge stroke did not navigate. It is kept, and its parity goes to
  Phase 4.

The locked text is "Locked tap and gestures" in the Phase 3 specification.
