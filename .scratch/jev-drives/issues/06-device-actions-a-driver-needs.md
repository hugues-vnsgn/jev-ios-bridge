# Device actions a driver needs

Type: task
Status: resolved
Blocked by: 03

## Question

Add the actions a driven run needs that `DeviceDriver` (`src/contracts/index.ts:96-128`) lacks, on iOS and Android, with the existing settle rule:

- **Back:** Android keyevent; iOS the navigation bar's back button or an edge swipe (MobileBuildMCP 2.7.1 has edge-swipe presets).
- **Whole-screen scroll** in both directions (MobileBuildMCP has scroll presets; Android swipe on the screen).
- **A Claude-only coordinate tap** tied to the latest screenshot, for controls the accessibility tree doesn't expose (Codex Q19). Jev never chooses coordinates; Jev picks only bridge-built semantic actions. Coordinate taps are logged and verified like any step.

Scripts may use back and scroll too.

## Answer

Owner approved 2026-10-01 (design batch E1–E15).

- **E6 back:** Android system Back key; iOS taps the navigation bar's back button when the screen has one, else swipes in from the left edge.
- **E7 scroll:** swipe inside the largest scrollable area, else the middle of the screen.
- **E8 coordinate tap:** only through Claude's `resolve_step` `tapAt`, in screenshot points; Jev never gets coordinates.
