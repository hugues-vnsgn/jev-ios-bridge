# Device actions: back, scroll, tapAt

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: none

## What to build

Add three actions to `Action` in `src/contracts/index.ts` and implement them on both drivers (E6–E8):

- `{ kind: 'back' }`. **Android:** the system Back key through the existing adb/agent path, then the settle rule. **iOS:** if the snapshot has a navigation-bar back button (a `button` in the top bar whose label or identifier is the platform back button, e.g. `BackButton`, or the leftmost button in the nav bar area with a back-like label), tap it; otherwise an edge swipe from the left edge (MobileBuildMCP 2.7.1 has gesture presets; check `ui-automation` help for the pinned binary). Record which path was used.
- `{ kind: 'scroll'; direction: 'up' | 'down' }`: swipe inside the largest visible element whose actions include scrolling (Android `scrollable`, iOS scroll views), else the screen's middle 70% → 30% (down) or the reverse (up), reusing the swipe timing each driver already uses.
- `{ kind: 'tapAt'; x: number; y: number }`: coordinates in screenshot points (iOS) or pixels as the screenshot shows them (Android); reject values outside the screen with `UNSUPPORTED_ACTION`.

Each returns the settled screen where the driver already does so. The scripted runner never produces these actions (no script schema change here).

## Acceptance

- Unit tests per driver with the existing fakes: the exact device commands for each action and fallback (iOS back button vs edge swipe; scroll inside a scrollable vs screen middle; tapAt bounds).
- Every existing test and golden file passes unchanged; `npm run check` passes.
