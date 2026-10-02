# iOS scroll strokes: scroll up under a fixed header, and the screen-centre fallback

Status: ready-for-agent
Type: bug
Source: live trial 2026-10-02 (the target search scrolled down 3 times, then its scroll up reported "unchanged"); reproduced by hand with the same MobileBuildMCP calls.

## Problem

`scroll()` on iOS (`src/device/index.ts`) swipes inside `largestScrollable()` with MobileBuildMCP's default stroke, which runs from 15% to 85% of the view's height. When the largest scroll view is the whole screen and a fixed header (a search bar, tabs) sits at its top, the finger-down stroke for "scroll up" starts on the header, and the list doesn't move. MobileBuildMCP still reports success. "Scroll down" works only because its stroke starts low, inside the list.

With no scrollable element, the bridge uses AXe's gesture presets, mapped `down → scroll-down`, `up → scroll-up`. On the iOS 18.6 simulator, `scroll-up` revealed content further down and `scroll-down` revealed content above: the preset names give the finger's direction, so the mapping is inverted.

## What to build

1. The driven `scroll` action swipes inside the scroll view with `--distance 0.4`, a stroke centred in the view, between 30% and 70% of its height. That's the stroke Android already uses (70% → 30%). Measured: 307 ↔ 545 in an 852-point view, and both directions moved the list. Version 1 scripts' `swipe` action keeps MobileBuildMCP's default stroke, unchanged.
2. The screen-centre fallback maps `down → scroll-up` and `up → scroll-down`.
3. Tests: the exact commands for both paths, and that a v1 `swipe` still sends no `--distance`.

## Acceptance

- `scroll` down/up sends `swipe … --direction up|down --distance 0.4`; the fallback sends `scroll-up` for down and `scroll-down` for up.
- A v1 `swipe` step's command is byte-identical to 1.3.0's.
