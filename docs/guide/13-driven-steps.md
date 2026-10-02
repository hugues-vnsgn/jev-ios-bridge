# Driven steps (experimental)

In a version 1 script you name every tap. A `do` step names the outcome instead: "Sign in with the test account", done when "The home screen greets the test account". The bridge reads the screen, lists the actions it could take there, and asks Jev which one does the step. It acts, then checks on a fresh capture whether the step is done. When Jev isn't sure, the action looks risky, or the run is stuck, the step goes back to Claude: the run pauses with the device still held, and Claude answers with one action.

Checkpoints work as before, and they still decide the verdict. A `do` step gets the app to a screen; it never passes or fails a run.

Driven mode is experimental. It's off unless you turn it on, it may change in a later 1.x release, and version 1 scripts behave exactly as before.

## Turning it on

A script with a `do` step needs both of these. Without them, it's refused with `DRIVEN_NOT_ENABLED` before the device is touched.

1. **The project allows it.** `.jev/config.json` in the project folder says:

   ```json
   { "drivenMode": true }
   ```

   The project folder is `JEV_PROJECT_DIR` when it's set, else the folder the bridge was started in.
2. **The switch is on.** `JEV_EXPERIMENTAL_DRIVEN` is `1` or `true` (case doesn't matter) in the bridge's environment. With the Claude Code plugin, turn on its `experimentalDriven` setting under `/plugin` → **Installed** → `jev-ios-bridge` → **Configure**, which sets the variable for the MCP server.

A `.jev/config.json` or `.jev/preflight.json` that isn't valid JSON of the right shape refuses the script with `INVALID_PROJECT_FILE`, naming the file. A script without `do` steps never reads either file.

## Writing `do` steps

The fields are in the [script format](reference/script-format.md#version-2-do-steps-experimental). A script with a `do` step says `"version": 2`.

- **`intent`** says what to do, in the app's own words: "Open the Settings tab", not "tap the third icon".
- **`doneWhen`** names text that will be on the screen once the step is done. Jev checks it on a capture taken after the last action, and only that check completes a step. Jev's choice of action never does.
- **`effect`** says what the step may change: `none` (reads or navigates), `test_write` (writes test data), or `destructive` (deletes or changes data that matters). The bridge never sends the effect to Jev.
- **`values`** lists the value keys the step may type. Put a credential in `{ "fromEnv": "NAME" }` so it stays out of the script ([values from the environment](reference/script-format.md#values-from-the-environment)). A value can't contain `⟦` or `⟧`, the brackets driven mode masks typed values with; such a script is refused with `INVALID_VALUE`. iOS values are ASCII only, so this only matters on Android.
- **`goal`**, at the top level, says what the whole script is for. Jev reads it at every decision.
- **`start: "attach"`** starts from the screen already showing instead of relaunching the app. It works on Android only for now: the app must be the one in front, or the run ends `APP_NOT_IN_FOREGROUND`. On iOS the run ends `UNSUPPORTED_ACTION` before the simulator is touched, because the bridge can't tell which app is in front there.

**Keep checkpoints for the expected result.** The developer says what the app should show, in claims. A `do` step's `doneWhen` only says when to stop acting, so a wrong result can still finish a `do` step. Only a checkpoint catches it.

## How a `do` step runs

For each screen in the step:

1. The bridge lists the actions that screen offers: tap an element, type one of the step's values into a field, scroll up or down, go back, "the step is done", "none of these".
2. Jev picks one and gives two numbers: its confidence in the pick, and the probability that the step is already done.
3. The step is done when that probability is at least 0.90.
4. Otherwise, the bridge takes the pick only if its confidence is at least 0.80 (0.90 in a `test_write` step), and the control's label, value or identifier has none of these words: Delete, Remove, Erase, Reset, Sign out, Unsubscribe, Pay.
5. If Jev found nothing that fits, or wasn't confident enough, the bridge searches: it scrolls down up to 3 times, then up up to 3 times, asking again after each scroll that changed the screen. A screen with no scrollable element gets one try. If that scroll changes nothing, the bridge doesn't scroll that same screen to search again in the run; a new screen still gets its try.

Each action the bridge performs counts toward `maxSteps`, as does the `do` step itself. After 8 Jev decisions in one step, the step goes to Claude.

## Hand-backs to Claude

When a step can't go on by itself, the run pauses holding the device, and `get_report` returns at once with the status `needs_claude`. The package it returns holds:

- the reason, as a code and in plain words;
- the step's id, intent and `doneWhen`;
- the screen as text, with typed values masked as `⟦value:<key>⟧`;
- the screenshot's path and pixel size: the run's own copy, `screen-N.jpg` in its evidence folder;
- Jev's numbers, each labelled with what the bridge compares it with:
  - **Jev's choice** and its **confidence**, the number compared with the floor (0.80, or 0.90 in a `test_write` step). In a destructive step, or a `test_write` step without a passed preflight, the bridge never takes Jev's pick, and the package says so;
  - **Jev's step-done probability**, which completes the step at 0.90;
  - **Jev's top 3 picks** with each option's probability. That's a different number from the confidence: a pick can show 0.82 while its confidence is 0.78 and under the floor.

  A screen Jev wasn't asked about has none of these;
- the step's value keys;
- the screen's elements that accept an action, with their refs;
- the pause id, and when the pause expires.

Claude answers with `resolve_step({ runId, pauseId, answer })`. The answer is exactly one of these:

| Answer | What it does |
| --- | --- |
| `{ "kind": "tap", "ref": "..." }` | Taps an element from the package. |
| `{ "kind": "type", "ref": "...", "valueKey": "..." }` | Replaces a field's text with one of the step's values. |
| `{ "kind": "scroll", "direction": "up" }` or `"down"` | Scrolls the content. |
| `{ "kind": "back" }` | Goes back: the back button or edge swipe on iOS, the Back key on Android. |
| `{ "kind": "tapAt", "x": 120, "y": 640 }` | Taps a point, in pixels of the screenshot file the package names; the bridge scales it to the screen. Android only for now: iOS refuses it with `UNSUPPORTED_ACTION`, and the pause stays open. |
| `{ "kind": "done" }` | Declares the step done. The run log records Claude as the one who decided it. |
| `{ "kind": "revise", "steps": [ ... ] }` | Replaces the rest of the script. The steps are checked like a script's and must end with a checkpoint. To retry the current step, include it. |
| `{ "kind": "stop" }` | Ends the run `INCONCLUSIVE` with `STOPPED_BY_CLAUDE`. |

After an action, Jev takes over again. An answer that doesn't fit the paused screen, such as a ref that isn't on it, is refused with the reason, and the pause stays open for a corrected one.

A pause waits 5 minutes by default; set `handbackTimeoutMs` in `start_scenario`'s `limits` (1 second to 30 minutes). An unanswered pause ends the run `INCONCLUSIVE` with `HANDBACK_TIMEOUT` and releases the device. Time spent paused doesn't count toward the run's wall-time limit.

**Only MCP can answer.** `resolve_step` is an MCP tool, and it's published only while the switch is on. The `run` command prints each pause and keeps waiting, so from the terminal a pause always ends in `HANDBACK_TIMEOUT`.

### Why a step was handed back

| Reason | What happened |
| --- | --- |
| `NONE_FITS` | Jev found no listed action that does the step, even after scrolling to search. |
| `LOW_CONFIDENCE` | Jev wasn't confident enough in any action, even after scrolling to search. A "step is done" pick whose done probability is under 0.90 also lands here. |
| `RISKY_ACTION` | Jev picked a control with a risky word. The bridge never takes those itself. |
| `DESTRUCTIVE_STEP` | The step's effect is `destructive`, so Claude picks every action. Jev isn't asked about the first screen. After Claude's first action, Jev is asked about each new screen as usual, but its pick is never taken: only its done check counts, ending the step at 0.90. Otherwise the step comes back to Claude, who answers with the next action or `done`. |
| `PERMISSION_DIALOG` | A system permission dialog is on screen, such as an iOS alert with Allow / Don't Allow or Android's permission prompt. Jev is never asked about it; Claude answers it or adjusts the plan. |
| `LOCAL_ONLY_STEP` | The step is `localOnly`: none of its screens goes to Jev, so Claude picks every action and ends the step with `done`. |
| `LOCAL_ONLY_SCREEN` | An element on the screen matches a `localOnlyScreens` rule, so the screen isn't sent to Jev. |
| `NO_PREFLIGHT` | The step is a `test_write` step and the preflight didn't pass, so Claude picks its actions. Jev doesn't scroll to search there either. |
| `UNREADABLE_SCREEN` | The screen couldn't be read as text for Jev: empty, truncated or too large. The screenshot shows it. |
| `SCREEN_UNCHANGED` | An action and its one retry left the screen as it was. |
| `REPEATED_ACTION` | Jev picked the same action a third time in the step. |
| `SCREEN_LOOP` | The run went back and forth between two screens. |
| `DECISION_BUDGET` | The step used its 8 Jev decisions. After Claude's action, Jev checks once whether the step is done; if it isn't, the run ends `STEP_NOT_DONE`. |
| `SCREEN_CHANGED` | The screen changed before Claude's answer could be performed. Answer for the new screen. |

These reasons appear in the package, in `run.jsonl`'s `handback` events and in the report. They aren't verdict reasons, so they're not in the [reason codes](reference/reason-codes.md).

## The preflight

Before Jev may perform test writes, the project proves it's pointed at a test environment. `.jev/preflight.json` names a command:

```json
{ "command": ["./scripts/is-test-env.sh"], "timeoutMs": 10000 }
```

The bridge runs it once per run, before the first `test_write` step, in the project folder, without a shell and without the TypeSafe key. A program path containing `/` is relative to the project folder. Its output is discarded. `timeoutMs` is optional: 10 seconds by default, at most 120 seconds.

- Exit code 0: Jev may perform the actions of `test_write` steps.
- No file, any other exit code, a timeout, or a command that can't start: every action of a `test_write` step, scrolls to search included, goes to Claude as `NO_PREFLIGHT`.

The run log records one `preflight` event: `ok`, `missing` or `failed`, the exit code, and how long it took.

## Screens that stay local

Two ways keep a screen away from TypeSafe:

- **`"localOnly": true` on a step.** None of the step's screens goes to Jev. Every decision in it is Claude's.
- **`localOnlyScreens` in `.jev/config.json`.** A screen with any element that matches a rule is never sent to Jev, in any `do` step, and its decisions go to Claude:

  ```json
  { "drivenMode": true,
    "localOnlyScreens": [{ "identifier": "^payment\\." }, { "label": "Card number" }] }
  ```

  Each rule has an `identifier` pattern, a `label` pattern, or both; with both, the same element must match both. Patterns are regular expressions and case-sensitive. Hidden elements count.

Claude still sees these screens, as text in the hand-back package.

Checkpoints in a script with `do` steps follow the same rule: a checkpoint on a screen that matches a `localOnlyScreens` rule isn't sent to Jev, and the run ends `INCONCLUSIVE` with `LOCAL_ONLY_CHECKPOINT`. Move the checkpoint to a screen without the private element.

## What goes to TypeSafe

At every Jev decision, not only at checkpoints:

- the screen's text, as at a checkpoint: every visible element's role, label, value, identifier, position and state;
- the step's intent and `doneWhen`, the script's `goal`, and the last two actions, in words;
- the list of possible actions, described from the same screen text.

Every typed value is replaced by `⟦value:<key>⟧` in all of it. The brackets are U+27E6 and U+27E7, which a typed value can't contain, so a value can't be mistaken for part of a marker. A value shown on screen in another form, such as in capitals, isn't caught. The step's `effect` and screenshots are never sent. See [data handling](09-data-handling.md).

In a script with `do` steps, checkpoints are masked the same way: Jev reads `⟦value:<key>⟧` in the screen text and in the claims. So a checkpoint can't check a typed value's text there: a claim such as "The greeting shows ops@example.com" reaches Jev as "The greeting shows ⟦value:user⟧". Write claims about what the app shows besides the value. Version 1 scripts, and version 2 scripts without `do` steps, send checkpoints as before.

## What the report shows

`report.json` and the text report gain a `driven` section for runs with `do` steps: the start mode, the preflight result, the number of Jev decisions and their input tokens, who decided each action (`script`, `jev`, `claude`, or `bridge` for the target search's scrolls), who completed each `do` step (Jev's done check or Claude's `done`), and each hand-back with its reason, Claude's answer and how long it waited ([fields](reference/report-json.md#runs-with-do-steps)). The watch page shows Jev's decisions, the searches, the hand-backs and Claude's answers as they happen, and says when a run is waiting for Claude.

`run.jsonl` has these events beside the usual ones: `decision` (Jev's pick, confidence, done probability, tokens), `search` (each scroll of the target search), `handback` and `handback_answer`, and `preflight`. Each `action` event in a `do` step has `decidedBy`, and a tap or type also has `target`: the element's role, label and identifier, with typed values masked. Version 1 runs record none of them.

## Limits

- **Jev reads text only.** It can't see canvas drawing, games, maps, web views, or system sheets and alerts the accessibility tree doesn't show. Those screens go to Claude as `UNREADABLE_SCREEN`, or Jev picks from what little text there is.
- **Real iPhones aren't supported,** as for version 1 scripts. iOS needs a simulator.
- **`tapAt` is Android only** for now.
- **`attach` is Android only** for now. On iOS, use `"start": "restart"`.
- **Jev's choices were measured offline, on a small set of recorded English screens,** not on live runs of your app. Watch the first runs on a new app; the checkpoints still decide the verdict.
