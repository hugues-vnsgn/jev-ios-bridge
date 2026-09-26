# Capture reuse (tuning option B): rejected for 1.0

Checked on 2026-09-26 on the dedicated simulator with the diagnostic app, `mobilebuildmcp@2.7.1`, and the phase 4 driver.

[`transition-check.ts`](transition-check.ts) taps Apple, Bread, and Complete order. After each tap it compares the settled capture MobileBuildMCP returned with the action against a fresh capture taken just after. The result is in [`transition-check-output.txt`](transition-check-output.txt), and it reproduced on a second run.

- **Taps that don't navigate:** the two captures match, with the same screen hash and elements.
- **The Complete order tap, which pushes a new screen:** the "settled" capture (hash `0zhihht`, 21 elements) is taken **mid-transition**. It holds the old screen sliding out (elements at `x: -116`, such as "Selected: Apple, Bread" and "Add Apple ($2)") mixed with the new screen. The fresh capture (hash `02byema`, 9 elements) shows only the confirmation screen. MobileBuildMCP's settle rule (unchanged for 100 ms) was satisfied during the animation.

A guard or checkpoint that used that capture would see both screens: stale text could reach Jev, and an `absent` guard could fail for no reason. The spec requires that no tuning change weaken guards or evidence, so capture reuse ships **off**. The driver keeps it behind `reuseActionCapture: true` for a future MobileBuildMCP that settles on transitions. 1.0 ships option A (no `npx`) and option C (concurrent screenshot).

Found by the release's own screenshot agreement check (`JEV_VERIFY_SCREENSHOT_AGREEMENT=1`). In the diagnostic run it recorded `screenshotAgreement: false` on the final checkpoint.
