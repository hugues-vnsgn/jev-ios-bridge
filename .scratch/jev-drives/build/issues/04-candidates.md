# Candidate builder

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: none

## What to build

Move the spike's builder (`spikes/jev-drives/candidates.ts`) into `src/driven/candidates.ts` as product code, taking a `Snapshot`'s elements (both platforms already map to `Element`) and the step's allowed value keys. Same keys and order as the spike: types first, then taps, then `scroll:up`, `scroll:down`, `back`, `step_done`, `none_fits`; capped at 255; deterministic. Exclude elements marked `selectable: false`, invisible, disabled, or without the needed action. Keep the spike's blind-spot comment. Also export a lookup from a chosen key back to the `Action` (and the element) it means.

## Acceptance

- Tests ported from `tests/jev-drives-candidates.test.ts` against the spike captures in `spikes/jev-drives/captures/` (they are public fixtures), plus key → Action mapping and the 255 cap.
- The spike files stay as they are (frozen record).
