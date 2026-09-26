---
name: test-ios
description: Verify an iOS app (SwiftUI, UIKit, or Compose Multiplatform) on a simulator with a jev-ios-bridge script and report the recorded verdict. Use when asked to check, verify, or test iOS app behaviour on screen and the jev-ios-bridge MCP tools are available.
---

# Verify an iOS app with jev-ios-bridge

The bridge runs one complete script on a dedicated simulator and returns a recorded verdict. You author the script and submit it once; the bridge drives the device, and Jev judges the checkpoint claims. The guide ships with the bridge at `node_modules/jev-ios-bridge/docs/guide/`, and each step below names the page it relies on.

## Steps

1. **Establish the target.** Find the app's bundle ID and confirm that it's installed on the dedicated, booted simulator, with the test data the check needs already in place. The bridge restarts the app, so the script starts from whatever screen the app opens on. Done when you know the launch screen, the data, and any debug `launchArgs` that give a stable start (guide `02-prepare-your-app.md`).

2. **Author the script, or take the one you're given.** If the user supplies a script, use it unchanged. Otherwise, write it from the app's source, its accessibility identifiers or `testTag`s, and a real capture of each screen you touch (`npx mobilebuildmcp ui-automation snapshot-ui --simulator-id <UUID> --verbose --output json`). Read guide `04-writing-scripts.md`, `03-identifiers.md`, and `reference/script-format.md` before your first script. Done when:
   - every step has a guard of anchors that only its screen has;
   - every action's selector matches exactly one element in the capture: an identifier, or a `role` plus `label`;
   - every typed literal lives in `values`;
   - the script starts with `"version": 1` and ends with a checkpoint.

3. **Write claims Jev can decide.** Jev sees the screen's text (roles, labels, values, identifiers), not the screenshot. Follow guide `05-writing-claims.md`:
   - one piece of printed evidence per claim ("The order total reads $5");
   - absence only through text the app prints ("No Results");
   - the app's own totals instead of row counts;
   - persisted state only on the screen after saving;
   - printed text rather than widget meaning ("A button labelled ON is visible").

   Done when every claim names text you can point to in a capture.

4. **Submit once.** Call `start_scenario` with `{scenario}` and optional `limits: {maxSteps, wallTimeMs}`. Show the user the `watchUrl`, and mention `logsCommand` for following the app's own output. A log pane window usually opens by itself.

5. **Wait for the verdict.** Call `get_report` with `{runId, waitMs: 45000}`, and repeat while the status is running. Running replies carry progress only; the run follows its script to the end. Done when the status is finished or interrupted.

6. **Report what was recorded.** Give the user:
   - the verdict and its reason code;
   - the decisive checkpoint and its claim probabilities;
   - the evidence path;
   - any setup, selector, device, or TypeSafe problem the report names.

   Present the verdict as recorded: **passed** means every step and checkpoint passed; **failed** means a claim was confidently false (≤ 0.1); **inconclusive** means verification is unresolved, which is never a pass. For an inconclusive run, point to guide `08-troubleshooting.md` for its reason code. A `GUARD_*` or `TARGET_*` code means the script, not the app, needs fixing.

7. **To stop a run,** call `cancel_run` and read the report it leaves. A verdict already recorded stays final.

## Data

Checkpoint screen text, including typed values, goes to TypeSafe. Screenshots and logs stay local. Author checks against test data in apps the user controls (guide `09-data-handling.md`).
