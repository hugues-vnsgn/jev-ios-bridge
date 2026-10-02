---
name: test-android
description: Verify an Android app (Jetpack Compose, Compose Multiplatform, or classic Views) on an emulator or phone with a jev-ios-bridge script and report the recorded verdict. Use when asked to check, verify, or test Android app behaviour on screen and the jev-ios-bridge MCP tools are available.
---

# Verify an Android app with jev-ios-bridge

The bridge runs one complete script on a dedicated emulator or phone and returns a recorded verdict. You author the script and submit it once; the bridge drives the device, and Jev judges the checkpoint claims. The guide ships with the bridge at `node_modules/jev-ios-bridge/docs/guide/`, and each step below names the page it relies on.

## Steps

1. **Establish the target.** Find the app's package name (`applicationId` in the app's `build.gradle.kts`) and confirm that it's installed on the dedicated device (a running emulator, or a phone), with the test data the check needs already in place. Name the device in the script: `device.avd` for an emulator, `device.serial` for a phone (guide `12-android-setup.md`). The bridge restarts the app, so the script starts from whatever screen it opens on; `app.activity` and `app.intentExtras` give a stable start screen (guide `02-prepare-your-app.md`, `reference/script-format.md`). Done when you know the package, the device, the launch screen, and the data.

2. **Author the script, or take the one you're given.** If the user supplies a script, use it unchanged. Otherwise, write it from the app's source, its `testTag`s or resource IDs, and a real capture of each screen you touch. `capture` reads whatever screen is up and never launches or restarts the app, so ask the user to bring each screen up first. Pass the device explicitly, from the script or from the user, because your shell doesn't see the plugin's Android device setting:

   ```sh
   npx jev-ios-bridge capture --avd <name>       # or --serial <serial>
   ```

   It prints one JSON line per element, as a run sees it. Exit code 3 means it couldn't capture; its stderr names the reason code (guide `08-troubleshooting.md`). Read guide `04-writing-scripts.md`, `03-identifiers.md`, and `reference/script-format.md` before your first script. Done when:
   - the script starts with `"version": 1` (or 2 for driven mode, below) and `"platform": "android"`, names `app.package` (guide `reference/script-format.md`), and ends with a checkpoint;
   - every step has a guard of anchors that only its screen has;
   - every action's selector matches exactly one element in the capture: an identifier, or a `role` plus `label`;
   - no guard anchor or selector relies on an element marked `"selectable": false`, which never matches;
   - every typed literal lives in `values`; a credential is `{ "fromEnv": "NAME" }`, never written into the script (guide `reference/script-format.md`, "Values from the environment").

   **When Compose elements have no identifiers,** tell the user to add `testTagsAsResourceId` once, on the root composable in `androidMain`, and show them where (guide `12-android-setup.md`):

   ```kotlin
   // androidMain, MainActivity.onCreate: wrap the app's root composable.
   // import androidx.compose.ui.semantics.semantics
   // import androidx.compose.ui.semantics.testTagsAsResourceId
   // Older Compose versions also need @OptIn(ExperimentalComposeUiApi::class).
   setContent {
       Box(Modifier.semantics { testTagsAsResourceId = true }) {
           App()
       }
   }
   ```

   Change or rebuild the app only if the user asks you to. Until they add it, write `role` plus `label` selectors.

3. **Write claims Jev can decide.** Jev sees the screen's text (roles, labels, values, identifiers), not the screenshot. See it exactly as Jev will with `npx jev-ios-bridge capture --avd <name> --jev`. Follow guide `05-writing-claims.md`:
   - one piece of printed evidence per claim ("The order total reads $5");
   - numbers quoted exactly as the app prints them (`2.500.000`, not `2,500,000`; guide `05-writing-claims.md`);
   - an empty field's grey hint is its `placeholder`, so never claim a field "contains" it (guide `05-writing-claims.md`);
   - a password field shows dots, one per character (guide `09-data-handling.md`);
   - a custom tab or toggle needs a selected or checked state before a claim can read it; without one, claim its printed text (guide `12-android-setup.md`);
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

   Present the verdict as recorded: **passed** means every step and checkpoint passed; **failed** means a claim was confidently false (≤ 0.1); **inconclusive** means verification is unresolved, which is never a pass. For an inconclusive run, point to guide `08-troubleshooting.md` for its reason code. A `GUARD_*` or `TARGET_*` code means the script, not the app, needs fixing. Mention the limits that apply (guide `10-limits.md`): non-English text types exactly, but Jev's accuracy promise covers English screens, and real phones are untested.

7. **To stop a run,** call `cancel_run` and read the report it leaves. A verdict already recorded stays final.

## Driven mode (experimental, only when it's on)

Driven mode is on when the jev-ios-bridge MCP server offers a `resolve_step` tool. If it doesn't, write version 1 scripts only: a script with a `do` step is refused with `DRIVEN_NOT_ENABLED`. Read guide `13-driven-steps.md` before your first driven script.

In a `do` step you name an outcome and Jev picks the actions; when Jev can't, the step comes back to you.

1. **Write a version 2 script.** Start it with `"version": 2`, and add a `goal` saying what the whole script is for. Use a `do` step for a stretch the user describes as an outcome; keep version 1 action steps where you know the selectors. Each `do` step is `{ "id", "kind": "do", "intent", "doneWhen", "effect" }`, plus `values` when it types:
   - `intent`: what to do, in the app's own words;
   - `doneWhen`: text that will be visible once the step is done;
   - `effect`: `none` (reads or navigates), `test_write` (writes test data; Jev acts only if the project's preflight passed), or `destructive` (you decide every action). When unsure, pick the riskier one;
   - `values`: the value keys the step may type. A credential is `{ "fromEnv": "NAME" }`. A value can't contain `⟦` or `⟧` (refused with `INVALID_VALUE`);
   - `"localOnly": true` for a step whose screens must not go to TypeSafe.

   Add `"start": "attach"` only when the user wants to start from the screen already showing.

2. **Keep checkpoints for the expected result.** Write their claims from what the developer said the app should show. A `doneWhen` only tells Jev when to stop acting; it checks nothing. If the user hasn't said what the result should be, ask: never invent expected results. Done when the script ends with a checkpoint whose claims come from the user.

3. **Submit once,** as in step 4 above.

4. **Poll and answer.** Call `get_report` with `{runId, waitMs: 45000}`:
   - status running: call it again;
   - status `needs_claude`: a step was handed back and the run is paused, holding the device. Read the package: the reason, the step's intent and `doneWhen`, the screen text, the element refs, Jev's numbers, and the screenshot path, a file in the run's evidence folder (open it when the text isn't enough). Typed values in it read `⟦value:<key>⟧`. Jev's numbers are labelled: "Jev's choice" gives the confidence the bridge compared with its floor (0.80, or 0.90 in a `test_write` step); "Jev's step-done probability" is the done check, which completes the step at 0.90; "Jev's top picks" are each option's probability, which is a different number from the confidence. Reason from the confidence and the done probability, not from a pick's probability. Then call `resolve_step` with `{runId, pauseId, answer}` and exactly one answer:
     - one action: `{ "kind": "tap", "ref": "..." }`, `{ "kind": "type", "ref": "...", "valueKey": "..." }`, `{ "kind": "scroll", "direction": "down" }`, or `{ "kind": "back" }`. `{ "kind": "tapAt", "x": 120, "y": 640 }` taps a point given in pixels of the screenshot file the package names, for a control with no ref. If the screen changed before it runs, nothing is tapped and the run pauses again with the new screen.
     - `{ "kind": "done" }` when the screen already shows the step done;
     - `{ "kind": "revise", "steps": [ ... ] }` when the rest of the plan is wrong: the steps replace the remaining ones, are checked like a script, and must end with a checkpoint. Include the current step to retry it;
     - `{ "kind": "stop" }` when the run can't go on safely. It ends `INCONCLUSIVE` with `STOPPED_BY_CLAUDE`.

     For `RISKY_ACTION` or `DESTRUCTIVE_STEP`, take the action only if the user's request covers it; otherwise stop. A refused answer comes back with its reason and the pause stays open: correct it and answer again. Then call `get_report` again;
   - status finished or interrupted: report as in step 6.

   A pause expires after 5 minutes by default (`handbackTimeoutMs` in `limits`), ending the run `HANDBACK_TIMEOUT`, so answer each one as soon as it comes. Time paused doesn't count toward `wallTimeMs`.

5. **Report who decided what.** The report's driven section says who decided each action (`decidedBy` in `report.json`: `script`, `jev`, `claude`, or `bridge` for the scrolls of the bridge's target search), who completed each `do` step (`doSteps`, `completedBy`: `jev` when Jev's done check ended it, `claude` when you answered `done`), and lists each hand-back with its reason, your answer and the wait. Tell the user which steps Jev did by itself and which you did; a step where you acted but Jev's done check ended it was shared. Done when the user has the verdict, the decisive checkpoint, and that split.

## Data

Checkpoint screen text, including typed values, goes to TypeSafe. In driven mode, the screen text also goes to TypeSafe at every decision in a `do` step, with typed values masked, except for `localOnly` steps and the project's local-only screens; tell the user this before their first driven run. Screenshots and logs stay local. Author checks against test data in apps the user controls (guide `09-data-handling.md`).
