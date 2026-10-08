# Live observed tap integration diagnosis

The user assigned sole live simulator operation to Orca pane
b0e5a4b6-106b-4dab-a49a-b3933445d4ef:1b178e31-086e-40c9-b4e2-b9a3dd45ad90.
Supervisor reviews evidence and owns source fixes.

## Observed failure

At f91ada4, the experimental CLI submitted one tap acknowledged by MobileBuildMCP,
but the SwiftUI navigation fixture stayed on Home through 19 actual captures and
30 seconds. The runner correctly returned inconclusive and retained quarantine.
Direct bundled AXe semantic tap on a second fresh device returned success at the
correct activation point (201, 527.1667) without navigation. See ../live/ordinary/
and ../live/axe-semantic/.

## Ranked hypotheses and probes

1. Incorrect AX activation point: compare resolved point with visible frame. The
   direct probe resolved its center correctly, weakening this hypothesis.
2. The default simulator tap path does not activate this control on this runtime:
   compare the same fixture with one vendor touch-down/up request and a 50ms hold.
3. Fixture/runtime issue independent of input mechanism: both paths would fail;
   inspect a different installed runtime or simple control only if necessary.

## Candidate change, contingent on live evidence

If touch succeeds, make only experimental tapOnce use existing pinned vendor
`ui-automation touch` with down/up in ONE invocation. No fallback or retap. Require
the chosen element to advertise both tap and touch. Preserve normal act behavior,
explicit target UDID, journal admission and uncertainty semantics. Keep vendor
receipt separate from visible outcome; neither proves native settlement.

Write a regression for exact request shape/no reissue, test refusal for missing
capability and stale reference, run affected and full tests. Have the live agent
rerun normal/already-satisfied/lost-reply cases and independent review the diff.
