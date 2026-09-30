---
name: test-android
description: Verify an Android app (Jetpack Compose, Compose Multiplatform, or classic Views) on an emulator or phone with a jev-ios-bridge script and report the recorded verdict. Use when asked to check, verify, or test Android app behaviour on screen and the jev-ios-bridge MCP tools are available.
---

# Verify an Android app with jev-ios-bridge

The bridge runs one complete script on a dedicated emulator and returns a recorded verdict. You author the script and submit it once; the bridge drives the device, and Jev judges the checkpoint claims. The guide ships with the bridge at `node_modules/jev-ios-bridge/docs/guide/`, and each step below names the page it relies on.

## Steps

1. **Establish the target.** Find the app's package name (`applicationId` in the app's `build.gradle.kts`) and confirm that it's installed on the dedicated device (a running emulator, or a phone), with the test data the check needs already in place. Name the device in the script: `device.avd` for an emulator, `device.serial` for a phone (guide `12-android-setup.md`). The bridge restarts the app, so the script starts from whatever screen it opens on; `app.activity` and `app.intentExtras` give a stable start screen (guide `02-prepare-your-app.md`, `reference/script-format.md`). Done when you know the package, the device, the launch screen, and the data.

2. **Author the script, or take the one you're given.** If the user supplies a script, use it unchanged. Otherwise, write it from the app's source, its `testTag`s or resource IDs, and a real capture of each screen you touch. `capture` reads whatever screen is up and never launches or restarts the app, so ask the user to bring each screen up first. Pass the device explicitly, from the script or from the user, because your shell doesn't see the plugin's Android device setting:

   ```sh
   npx jev-ios-bridge capture --avd <name>       # or --serial <serial>
   ```

   It prints one JSON line per element, as a run sees it. Exit code 3 means it couldn't capture; its stderr names the reason code (guide `08-troubleshooting.md`). Read guide `04-writing-scripts.md`, `03-identifiers.md`, and `reference/script-format.md` before your first script. Done when:
   - the script starts with `"version": 1` and `"platform": "android"`, names `app.package`, and ends with a checkpoint;
   - every step has a guard of anchors that only its screen has;
   - every action's selector matches exactly one element in the capture, never one marked `"selectable": false`: an identifier, or a `role` plus `label`;
   - every typed literal lives in `values`.

   **When Compose elements have no identifiers,** tell the user to add `testTagsAsResourceId` once, on the root composable in `androidMain`, and show them where (guide `12-android-setup.md`):

   ```kotlin
   // androidMain, MainActivity.onCreate: wrap the app's root composable.
   // import androidx.compose.ui.semantics.semantics
   // import androidx.compose.ui.semantics.testTagsAsResourceId
   setContent {
       Box(Modifier.semantics { testTagsAsResourceId = true }) {
           App()
       }
   }
   ```

   Change or rebuild the app only if the user asks you to. Until they add it, write `role` plus `label` selectors.

3. **Write claims Jev can decide.** Jev sees the screen's text, not the screenshot. See it exactly as Jev will with `npx jev-ios-bridge capture --avd <name> --jev`. Follow guide `05-writing-claims.md`:
   - one piece of printed evidence per claim ("The order total reads $5");
   - numbers quoted exactly as the app prints them (`2.500.000`, not `2,500,000`);
   - an empty field's grey hint is its `placeholder`, so never claim a field "contains" it;
   - a password field shows dots, one per character (guide `09-data-handling.md`);
   - a custom tab or toggle needs a selected or checked state before a claim can read it; without one, claim its printed text (guide `12-android-setup.md`);
   - absence only through text the app prints ("No Results");
   - the app's own totals instead of row counts;
   - persisted state only on the screen after saving.

   Done when every claim names text you can point to in a capture.

4. **Submit once.** Call `start_scenario` with `{scenario}` and optional `limits: {maxSteps, wallTimeMs}`. Show the user the `watchUrl`, and mention `logsCommand` for following the app's own output. A log pane window usually opens by itself.

5. **Wait for the verdict.** Call `get_report` with `{runId, waitMs: 45000}`, and repeat while the status is running. Running replies carry progress only; the run follows its script to the end. Done when the status is finished or interrupted.

6. **Report what was recorded.** Give the user:
   - the verdict and its reason code;
   - the decisive checkpoint and its claim probabilities;
   - the evidence path;
   - any setup, selector, device, or TypeSafe problem the report names.

   Present the verdict as recorded: **passed** means every step and checkpoint passed; **failed** means a claim was confidently false (≤ 0.1); **inconclusive** means verification is unresolved, which is never a pass. For an inconclusive run, point to guide `08-troubleshooting.md` for its reason code. A `GUARD_*` or `TARGET_*` code means the script, not the app, needs fixing. Mention the limits that apply (guide `10-limits.md`): non-English text types exactly, but Jev's accuracy promise covers English screens, and real phones are untested.

7. **To stop a run,** call `cancel_run` and read the report it leaves. A verdict already recorded stays final.

## Data

Checkpoint screen text, including typed values, goes to TypeSafe. Screenshots and logs stay local. Author checks against test data in apps the user controls (guide `09-data-handling.md`).
