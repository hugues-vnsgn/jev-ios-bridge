# Spec: jev-ios-bridge v1.2.0, Android support (execution)

Status: ready-for-agent

This file is the execution index for [the v1.2.0 release spec](../android-support/release-spec.md). The release spec is the source of truth: read it, and read the [domain model](../android-support/domain-model.md) and [ADR-0006](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md) before building. Each phase of the release spec is one Issue here, and one PR.

## Settled context (owner decisions from the planning conversation, 2026-09-29)

- The owner accepted the release spec, owner decisions A to J, and every open-point default. Where the release spec and a ticket's Answer disagree about mobilecli's CLI or daemon, the domain model wins (decision G). Anything else that disagrees: stop and ask.
- The glossary is in `CONTEXT.md`. Use its terms in code and docs: **device lease** (not lock), **device identity**, **device agent**, **foreign agent**, **fence**, **settled snapshot**, **shown value**, **launch options**.
- **The 1.x contract (ADR-0005):** only add. iOS scripts, iOS error messages (byte for byte, including `DEVICE_BUSY`'s "is locked by" wording), `report.json` for iOS runs, exit codes and the golden files in `tests/golden/` stay exactly as they are, except where the release spec's Rules allow a change.
- **One PR per phase.** The owner approves every merge. Don't push or open PRs from an implementer.
- **Never commit `.mcp.json`**, which the owner has modified. Never read, print or commit `.env` or any credential file.
- **Devices:** phase 2 needs none. Don't touch simulators, emulators or phones in phase 2. Later phases follow the release spec's device rules: emulators only, and a private adb server.
- The Android driver never runs mobilecli (ADR-0006). That matters from phase 4 on.

## Gates

`npm run check` (typecheck, then `npm test`, then build), run in the worktree. Log each run to `$TMPDIR/implement-delegate-<issue>-<gate>.log`. `node_modules` resolves from the main checkout's root, because worktrees live under `.worktrees/`.

## Test seams per Issue

- **01, phase 2:**
  - the driver factory, a pure function in `src/device/`, tested with scenarios;
  - `BridgeService`'s injected `createDriver` (`tests/service.test.ts`);
  - the device lease's own interface in `src/device/lease.ts`, tested directly with a temporary lease root, as `tests/device.test.ts` already uses `lockRoot`;
  - the MobileBuildMCP driver through its injected `CliRunner` fake (`tests/device.test.ts`), whose existing tests must pass unchanged;
  - `runScriptedScenario` with a fake driver that carries the tap alias rule (`tests/scripted-run.test.ts`);
  - `renderAssertionState(snapshot, platform?)` (`tests/scripted-jev.test.ts`, `tests/scripted-production-parity.test.ts`);
  - the golden tests (`tests/contract.test.ts` and the others that read `tests/golden/`).

## Phase 3: contract additions (execution, from 2026-09-29)

The work is [the release spec's phase 3](../android-support/release-spec.md#phase-3-contract-additions-how-a-script-names-an-android-app-and-device-what-jev-sees-on-android-decisions-1-to-2-actions-across-android-versions-items-2-to-4-log-pane-and-app-exit-detection-item-6-where-android-plugs-into-the-code-items-4-8-and-9), items 1 to 9, plus the app-identity reshape moved there from phase 2 item 6. It is split into Issues 03 to 07, built on one feature branch, `agent/android-v1.2-phase3` (the phase 2 branch `agent/android-v1.2` is already merged), and shipped as **one PR**. The owner approves the merge.

### Settled context for phase 3 (owner, 2026-09-29)

- **iOS stays byte-identical:** iOS scripts, messages (at the same paths), `report.json` for iOS runs, `started` and `prepared` events for iOS runs, the iOS observation text, and exit codes.
- **Golden files only gain entries.** The only changes to existing entries are the two the release spec allows: the new reason codes appended to `vocabulary.json`'s `reasonCodes`, and the `start_scenario` input schema diff in `mcp.json` exactly as phase 3 item 1 describes (owner decision A). Every `scripts.json` message and path, the three `report-json.json` runs and `evidence-layout.json`'s `startedFields` stay as they are. Add new entries to an existing golden file where one fits; add a new golden file only where none does (for example the Android renderer's output).
- **Existing tests** (those that existed before phase 3, at `819ea10`): add tests freely. Don't change an existing test's assertions. Tests added during phase 3 may change with the contract they pin (owner ruling, 2026-09-30). The only edits to existing test code allowed are:
  - the two `startLogStream({ bundleId: … })` calls in `tests/logpane.test.ts` (lines 45 and 70), which become `app: { bundleId: 'com.example.app' }` (owner ruling below);
  - the CLI test's environment helper in `tests/contract.test.ts`, which also deletes `JEV_ANDROID_DEVICE` (release spec item 8).
  - `tests/service.test.ts:134`, `built.push(scenario.app.bundleId)`, which becomes `built.push(appLabel(scenario.app))` with a new import line, so `ScriptedScenario` can type Android scripts truthfully (owner ruling, 2026-09-30).
- **The open-point defaults apply** (the owner accepted them all): 2 (Android typed values: any Unicode except control characters, at most 2,048 characters and 32 values, a leading `-` allowed), 3 (`DEVICE_UNSUPPORTED` and `ANDROID_TOOLS_UNAVAILABLE` are added in phase 3 with the seven item 3 codes, making nine), 4 (`selectable?: false` on `Element`), 5 (the Android report and `started` fields), 11 (`shownValue`, `settled: false`, `typedFields`), and 20 (device name patterns). Each Issue's report says which defaults it used.
- **No Android driver exists yet.** Where phase 3 adds a field the Android driver fills in phase 4 (the `prepared` fields, the shown value, `settled: false`, `placeholder`, `selectable`), phase 3 adds the contract and the code that records it, and tests it with fakes. The driver factory refuses Android scripts until phase 4 (item 7).
- **Devices:** phase 3 needs none. Don't touch simulators, emulators or phones.
- The gates, the `.mcp.json` rule and the `.env` rule above still apply.

### Test seams for phase 3

- **03, script fields and the app's identity:**
  - `scriptedScenarioSchema` and `parseScriptedScenario` (`tests/scripted-schema.test.ts`);
  - the golden tests for `scripts.json` and `mcp.json` (`tests/contract.test.ts`, `tests/mcp.test.ts`);
  - `startLogStream` (`tests/logpane.test.ts`);
  - `BridgeService` with its injected `createDriver` (`tests/service.test.ts`);
  - the MobileBuildMCP driver through its `CliRunner` fake (`tests/device.test.ts`), for the reshaped `ScenarioContext.app`;
  - `tests/docs.test.ts` for `docs/guide/reference/script-format.md`.
- **04, reason codes:**
  - the vocabulary in `src/scripted/vocabulary.ts` and the `vocabulary.json` golden (`tests/contract.test.ts`);
  - `runScriptedScenario` with a fake driver that throws, for the scoped pass-through in `failureOf` (`tests/scripted-run.test.ts`), plus the `deviceError` golden run in `report-json.json`;
  - `tests/docs.test.ts` for `docs/guide/reference/reason-codes.md`.
- **05, the element and Jev's Android view:**
  - `renderAssertionState(snapshot, 'android')` (`tests/scripted-jev.test.ts`) and a golden of the Android render on hand-written elements;
  - selection in `src/scripted/select.ts` with hand-written snapshots, for `selectable: false`;
  - `tests/scripted-production-parity.test.ts`, unchanged, as proof the iOS text didn't move.
- **06, choosing the device and the entry points:**
  - a pure Android device-choice function in `src/device/`, tested with script fields and environment values;
  - the CLI's pre-run check through the `cli-exit-codes.json` golden (`tests/contract.test.ts`);
  - the driver factory (`tests/device-factory.test.ts`) and `BridgeService`'s start error (`tests/service.test.ts`);
  - the MCP `start_scenario` description (`tests/mcp.test.ts`).
- **07, the run log and report:**
  - `runScriptedScenario` with a fake driver (`tests/scripted-run.test.ts`) for the `started`, `prepared`, `action` and `step` fields;
  - the run-log allowlist in `src/log/index.ts`, through its existing tests;
  - `report.json` building in `src/scripted/report-json.ts` with a new Android run in the `report-json.json` golden, and the prose report in `src/scripted/report.ts`.

## Phase 4: the Android driver (execution, from 2026-09-30)

Status: ready-for-agent

The work is [the release spec's phase 4](../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8), items 1 to 9. Item 0, the tracer, passed on both emulators (see the rulings below). It is split into Issues 10 to 16, built on one feature branch, `agent/android-v1.2-phase4`, and shipped as **one PR**. The owner approves the merge. The release spec is the source of truth for every command, value and order below; this section only frames the work and fixes the seams.

### Problem Statement

A script author who writes an Android script today gets "Android isn't available in this build". Phase 3 taught the bridge to read Android scripts, record Android fields in the run log and `report.json`, and choose an Android device by name, but no driver can act on an Android device. So the author can't run a checkpoint on an Android emulator at all, and the owner can't start the qualification that v1.2.0 needs.

### Solution

An Android device driver that runs a script end to end on an Android 12 or later emulator, with the same run, verdict, evidence and cleanup guarantees an iOS run has. It drives mobilecli's device agent directly (ADR-0006): the bridge reads the agent out of the pinned mobilecli package, checks it against the pinned SHA-256, starts it on the device with `adb`, and speaks JSON-RPC to it. It never runs mobilecli. It takes the device lease before touching the device, refuses when another tool's agent is running, restarts the app with its launch options, reads the screen through the element mapping the prototype settled, acts on settled snapshots only, and on `close` undoes exactly what its own run started. From the author's side, an Android script now runs like an iOS one, and an Android refusal names its reason code.

### User Stories

1. As a script author, I want an Android script to run on the emulator I name, so that I can check an Android screen the way I check an iOS one.
2. As a script author, I want to name the device by its serial, its AVD name or `JEV_ANDROID_DEVICE`, so that a script works whichever port the emulator started on.
3. As a script author, I want two scripts that name `emulator-5554` and its AVD name to share one device lease, so that they never drive the same emulator at once.
4. As a script author, I want a clear `ANDROID_TOOLS_UNAVAILABLE` refusal when `adb` or the pinned mobilecli package is missing, so that I know to install the Android SDK or run `npm install`.
5. As a script author, I want the tools check to run before the device lookup, so that a missing tool is the first thing I'm told.
6. As a script author, I want `DEVICE_NOT_CONNECTED`, `DEVICE_UNAUTHORIZED`, `DEVICE_NOT_BOOTED`, `DEVICE_LOCKED`, `APP_NOT_INSTALLED`, `DEVICE_UNSUPPORTED` and `DEVICE_AMBIGUOUS` refusals, so that I can fix the device instead of reading a stack trace.
7. As a script author, I want a screen that is only off to be woken for me, so that a sleeping emulator doesn't fail the run.
8. As a script author, I want the bridge never to change a device setting, so that my emulator stays as I configured it.
9. As a script author, I want the app force-stopped and started again with `am start -W`, so that every run starts from the app's first screen.
10. As a script author, I want `app.activity` and `app.intentExtras` passed to the launch, so that a debug entry point opens straight to the screen under test.
11. As a script author, I want every launch argument quoted for the device shell, so that an extra holding spaces, quotes, `&`, `;` or `%` arrives unchanged.
12. As a script author, I want the app's data never cleared, so that a signed-in test account stays signed in.
13. As a script author, I want a tap to land on the centre of the element my step matched, so that a tap does what the script says.
14. As a script author, I want replace text to clear the field reliably on Compose and classic fields, so that the typed value is the whole field.
15. As a script author, I want a typed value that starts with `-` to reach the field unchanged, so that negative numbers work.
16. As a script author, I want Vietnamese and other non-English text typed exactly, so that I can test localized input.
17. As a script author, I want the field's shown value recorded after typing, without failing the step on a formatting difference, so that I can see what the app displayed.
18. As a script author, I want a password field's shown value to be dots, never its text, so that a secret never reaches the evidence.
19. As a script author, I want a swipe within the element I named, in the direction I named, so that a list scrolls the way it does on iOS.
20. As a script author, I want a multi-line text field that reports `scrollable` to stay a text field, so that I can still type into it.
21. As a script author, I want any node with `scrollable: true` treated as a scroll view, so that a Compose `LazyColumn` can be swiped.
22. As a script author, I want each action to wait until the screen settles, and to be told "screen still changing" when it never does within 3 s, so that a checkpoint isn't judged on a moving screen.
23. As a script author, I want one screenshot per observation, taken on the settled snapshot, so that the evidence shows what Jev judged.
24. As a script author, I want Jev to see exactly the Android text the 10-screen check validated, so that verdicts stay as good as the prototype measured.
25. As a script author, I want the `prepared` event to record the device identity, serial, agent SHA-256 and whether leftovers were swept, so that the report names what ran where.
26. As a user of another UI-automation tool, I want the bridge to refuse with `DEVICE_BUSY` and leave my agent running, so that the bridge never breaks my session.
27. As a script author, I want a crashed earlier run's leftovers swept, and only those, so that one crash doesn't block the device forever.
28. As a script author, I want `close` to kill only the agent my run started, by its pid, and confirm it's gone, so that no agent of mine blocks other tools after the run.
29. As a script author, I want the app stopped at the end only if my run restarted it, so that a run refused before its restart leaves my app alone.
30. As a script author, I want my run's forward removed, and no one else's, so that two emulators' runs don't break each other.
31. As a script author, I want the lease kept, and the run to end inconclusive with `CLEANUP_FAILED`, whenever cleanup can't be confirmed, so that the next run never races something still acting on the device.
32. As a script author, I want a cancelled run to stop issuing device work at the next step of whatever it was doing, so that Ctrl-C really stops the run.
33. As a script author, I want an agent request that times out never to be sent again, so that a tap is never repeated.
34. As a script author, I want an agent error's message kept out of the evidence, so that screen text in an error never lands in `run.jsonl`.
35. As a script author, I want a typed value with a trailing space kept exactly and still masked in the run log, so that redaction never misses it.
36. As the owner, I want the bridge never to execute the mobilecli program, and a test that proves it, so that ADR-0006 holds in code and not just on paper.
37. As the owner, I want the agent file checked against the pinned SHA-256 on every run, cache included, so that a tampered file is never pushed to a device.
38. As the owner, I want `adb` to run with `TYPESAFE_API_KEY` stripped and `ANDROID_ADB_SERVER_PORT` kept, so that the key never reaches a child process and the private adb server is honoured.
39. As the owner, I want every Android unit test to run without the Android SDK, so that CI on Linux stays green.
40. As the owner, I want every iOS script, message, report and golden entry unchanged, so that the 1.x contract holds.

### Implementation Decisions

- **Modules.** A new Android device module holds the driver and its parts: the agent supply (reading the agent out of the pinned mobilecli package, the cache), the `adb` runner and the tools lookup, the device agent's client, the element mapping, the settle rule and the preparation checks. The iOS driver stays where it is and doesn't change. The phase 2 driver factory builds the Android driver for Android scripts, and stops refusing them only in the last Issue.
- **Injected runners, as `CliRunner` is for MobileBuildMCP.** The Android driver takes an `adb` runner (arguments, signal → stdout, stderr, exit code), a device agent client (method, params, signal → result), a clock (now, sleep), a screenshot folder and the device lease. The production runner spawns `adb` with `adbEnvironment()`; the production client speaks HTTP/1.1 JSON-RPC to the forwarded port.
- **The device agent's client is the anti-corruption layer** (domain model). Only it knows JSON-RPC, the agent's method names and parameter shapes, and its errors. The tracer confirmed the shapes against mobilecli 1.0.14's source: `device.version` returns `dexSha256`; `device.dump.ui {waitUntilIdle}` returns `{hierarchy: [...]}`; `device.io.tap {x, y}` and `device.io.swipe {x1, y1, x2, y2, duration}` take whole numbers; `device.io.keys {keys: [{keycode, modifiers?}]}`; `device.io.text {text}`; `device.io.button {button}`; `device.clipboard.set {text}`, `.clear`, `.get`; `device.screenshot {format, maxSize}` returns base64 `data`.
- **The device lease** (phase 2) gains two command kinds, `adb` and `agent`, so the driver can fence the agent's requests without touching `adb`'s. Its key is the device identity (open point 7). The driver records what it starts (the agent's pid, the forward's port, whether it restarted the app) as owned processes, so a crash takeover can sweep exactly that.
- **Order of `prepare`:** tools check → device name to serial and device identity → take the lease → agent check and sweep → device checks (API level, boot, lock, app installed) → wake → force-stop and `am start -W` → push, start and verify the agent. A refusal after the lease is taken still ends in `close`, which releases it.
- **Waking a screen that is only off** uses `adb shell input keyevent KEYCODE_WAKEUP`. It runs before the agent starts, so it can't be an agent call. The spec's "don't use `adb shell input`" is about typing (item 6) and still holds there.
- **Owner rulings that apply:** the clipboard ruling (non-ASCII typed values go through the clipboard, with no extra code; phase 7 documents it), and every accepted open-point default.
- **Contracts are unchanged.** Phase 3 already added every field and reason code phase 4 fills in (`prepared`'s fields, `shownValue`, `settled: false`, `placeholder`, `selectable: false`, the nine Android codes). Phase 4 adds no golden entry to an existing file except the new element golden file.

### Testing Decisions

- **A good test here** drives a public interface with fakes at the injected runners and asserts what reaches the device (the exact `adb` arguments and agent calls, in order), what the run records, and what the lease allows. It never asserts private state.
- **The end-to-end test for the phase** (Issue 16): `runScriptedScenario` with the real Android driver, a fake `adb` runner and a fake agent client, runs an Android script with a replace-text step and a checkpoint to a verdict. It pins the `adb` commands and agent calls sent, the `prepared`, `action` and `step` events recorded (`shownValue`, `settled`), a `screen-N.jpg` per observation, and a released lease with no agent, forward or app left running.
- **Wire and persistence tests** pin exactly what is sent or stored: the push path and start command, the forward, `am start -W` with quoted extras, the two separate `device.io.keys` calls and the 0.2 s pause, the clipboard sequence, swipe coordinates, the agent's version check, the kill-by-pid fence, the lease file's owned processes, and `run.jsonl`'s masking of a typed value with a trailing space.
- **Fixtures from real devices.** The 10 captures and 10 judged texts come from the prototype branch at `2366759`. The `adb` outputs the fakes replay (`devices -l`, `getprop`, `ps -A -o PID,NAME,ARGS`, `forward --list`, `pm path`, the launcher lookup, `am start -W`, the lock and screen state) are recorded once from both emulators through the private adb server, following the device rules, so the fakes answer as real devices do.
- **Prior art:** `tests/device.test.ts` (the MobileBuildMCP driver through its `CliRunner` fake), `tests/device-lease.test.ts` (the lease with a temporary root), `tests/scripted-run.test.ts` (runs with fake drivers), `tests/scripted-jev-android.test.ts` (the Android render), and the golden tests in `tests/contract.test.ts`.
- **No device in `npm test`.** CI runs on Linux without the Android SDK. Any live check is evidence under `spikes/benchmarks/results/v1.2.0/`, never a test the suite depends on.

### Out of Scope

- The log pane, `logcat` streams and app-exit detection (phase 5). `close` leaves a clearly marked place for step 4, stopping `logcat`.
- The `capture` command, the `/test-android` skill and the plugin (phase 6).
- Docs, the version bump and the CHANGELOG (phase 7), including the clipboard note from the owner's ruling.
- Release checks on real apps, and anything on a phone (phases 8 and 9). The Xiaomi `2985e9c` and any other phone stay untouched.
- Any change to the iOS driver, iOS output or an existing golden entry.

### Further Notes

- The tracer (`spikes/android/agent-tracer.mjs`) is the reference for the agent's real behaviour on both emulators. Its code is evidence, not a base to copy from.
- The prototype's mapping trims a text field's text; the release spec's item 5 correction (keep it exactly) wins.

### Settled context for phase 4 (owner, 2026-09-30)

- The phase 3 settled context carries over: iOS stays byte-identical; golden files only gain entries (phase 4 adds a new element golden file); tests that existed before phase 4 (`f93645a`) keep their assertions, and tests added during phase 4 may change with their contract.
- **Devices:** Issues 10 to 13 need none. Issues 14 to 16 may use `jev-actions-api31` and `Medium_Phone_API_36.1` only to record `adb` output fixtures, strictly under the release spec's device rules: the private adb server on port 5099, the `adb devices` check before each command, `-no-snapshot-save`, one emulator at a time, and shutting down what you started. Never touch port 5037 or any phone. Never run mobilecli.
- The gates, the `.mcp.json` rule and the `.env` rule above still apply.

### Test seams for phase 4

- **10, the pinned agent and the tools:** the agent supply's own interface, with synthetic program bytes and a temporary cache folder; the tools lookup and `adbEnvironment()` with environment values; a runner spy proving nothing executes the mobilecli program.
- **11, the `adb` runner and the device agent client:** the client against a local HTTP server started by the test; the lease's ledger through `tests/device-lease.test.ts` for the two new command kinds; the production `adb` runner's argument and environment handling with a fake spawn.
- **12, element mapping:** the mapping as a pure function over the captures, a new element golden file, and `renderAssertionState(snapshot, 'android')` emitting each judged text byte for byte.
- **13, the settle rule:** the rule as a function over an injected capture call and a fake clock.
- **14, prepare:** the Android driver's `prepare` and `preparation()` with a fake `adb` runner replaying the recorded fixtures, a fake agent client, and a temporary lease root.
- **15, actions:** the driver's `observe` and `act` with the same fakes, a fake clock and a temporary screenshot folder; `run.jsonl` through `withRunLog` for the trailing-space value.
- **16, close and wiring:** the driver's `close` with the fakes; the driver factory (`tests/device-factory.test.ts`); `BridgeService`; and the end-to-end run through `runScriptedScenario`.

## Phase 5: the log pane and app-exit detection (execution, from 2026-09-30)

Status: ready-for-agent

The work is [the release spec's phase 5](../android-support/release-spec.md#phase-5-the-log-pane-and-app-exit-detection-log-pane-and-app-exit-detection-on-android-where-android-plugs-into-the-code-item-7), items 1 to 7, plus step 4 of phase 4's `close` ("stop this run's `logcat` streams"), which the Android driver left as a marked placeholder. The measurements behind it are in [the log pane findings](../android-support/findings/06-log-pane.md), and the prototypes are `logcat-line.mjs` and `exit-watch.mjs` in `findings/06-assets/`. The release spec is the source of truth for every command, value and order below; this section only frames the work and fixes the seams. It is built on one feature branch, `agent/android-v1.2-phase5`, and shipped as **one PR**. The owner approves the merge.

### Problem Statement

An Android run is blind to the app. When a script author runs an Android script today, the log pane never opens, because the Android driver has no log to offer. The step's `logTails` are empty, and `jev-ios-bridge logs` has nothing to follow. When the app crashes, is killed, or freezes behind "App isn't responding", the run doesn't know. The next capture shows the launcher or the dialog, the step fails on a symptom (element not found, checkpoint false), and the author has to guess what happened. On iOS, the pane's "app stopped" check still works out the app's state itself, by reading a process ID from a MobileBuildMCP log file name. That is fragile, and it is a second, private answer to a question the driver already answers.

### Solution

For every Android run, the driver starts two `logcat` streams before it launches the app:

- **The app's log**, filtered to the app's uid. It is written to an owner-only file, and that file feeds the live pane, the per-step log tails and the `logs` command, exactly as MobileBuildMCP's log files do on iOS.
- **A small stream of process events**, folded into a running, exited or not-responding state that the driver answers synchronously.

When a step fails because the app crashed, was killed or quit, the run ends `APP_EXITED`. When it failed because the app froze, the run ends `APP_NOT_RESPONDING`. The pane names the cause. Script values are masked in the pane and redacted in `run.jsonl`, as on iOS. `close` stops both streams and waits for them to exit, and a crash takeover sweeps a dead run's streams before the next run goes on. The pane's "app stopped" check asks the driver on both platforms, so there's one answer to "is the app still running?".

### User Stories

1. As a script author, I want the log pane to open for an Android run, so that I can watch the app's output while the script runs, as I do on iOS.
2. As a script author, I want every line the app logs, from any tag, in the pane, so that I don't miss the line that explains a failure.
3. As a script author, I want `System.out` and `System.err` lines shown as `[app]`, so that my `println` output reads like the app's console on iOS.
4. As a script author, I want other tags shown as `[os] [Tag]`, so that I can tell structured logging from console output.
5. As a script author, I want error, fatal and assert lines in red and verbose and debug lines dim, so that problems stand out as they do on iOS.
6. As a script author, I want the pane to keep following the app when the bridge restarts it, so that I see the launch's first lines.
7. As a script author, I want a Java crash's stack and a native crash's dump in the pane, so that I can see why the app died.
8. As a script author, I want only my app's lines, never other apps' or the keyboard's, so that the pane isn't noise and other apps' data never reaches it.
9. As a script author, I want no line logged before my run started, so that an earlier run's lines don't confuse me.
10. As a script author, I want each script value masked as `[value:<key>]` in the pane, so that a typed secret doesn't show on screen.
11. As a script author, I want the same values shown as `[REDACTED]` in `run.jsonl`'s log tails, so that the evidence never holds them.
12. As a script author, I want each step's log tail to hold the app's last lines, so that the watch page and the report show what the app said at that step.
13. As a script author, I want `jev-ios-bridge logs <run>` to follow a live Android run, so that I can attach a pane myself when no window opened.
14. As a script author, I want `logs` on a finished Android run to name its logcat file, so that I can read the full log afterwards.
15. As a script author, I want the pane's header to say where an Android run's log comes from, so that I know what I'm looking at.
16. As a script author, I want a run whose app crashed to end `APP_EXITED`, not with the failed step's own symptom, so that the reason names the real problem.
17. As a script author, I want a crash on a background thread, where the process lingers behind the "app has stopped" dialog, to count as `APP_EXITED`, so that the dialog doesn't hide the crash.
18. As a script author, I want a native crash to count as `APP_EXITED`, so that a crash in native code is caught too.
19. As a script author, I want a kill, a quit, or a force-stop the bridge didn't send to count as `APP_EXITED`, so that anything that ends the app mid-run is named.
20. As a script author, I want a frozen app to end the run `APP_NOT_RESPONDING`, so that I can tell "it froze" from "it died".
21. As a script author, I want the bridge's own force-stops, at the restart and in `close`, never to count as the app exiting, so that a clean run isn't marked as a crash.
22. As a script author, I want an old native crash still in the device's buffer to be ignored, so that a fresh launch isn't marked exited by a crash from yesterday.
23. As a script author, I want the pane to say what happened, for example "crashed: FATAL EXCEPTION on main", "native crash: SIGSEGV", "force-stopped by another process", "exited" or "not responding", so that I don't have to dig through the log.
24. As a script author, I want going to HOME not to count as an exit, as on iOS, so that the rule is the same on both platforms.
25. As a script author, I want a checkpoint verdict that was already given to stand, so that the app check only explains a step that failed, as on iOS.
26. As a script author, I want the run to go on when the log stream fails or ends early, with the app check answering "can't tell", so that a logging problem never fails a run by itself.
27. As a script author, I want `close` to stop both streams and wait for them to exit before the lease is released, so that no `adb … logcat` of my run outlives it.
28. As a script author, I want the lease kept, and the run to end `CLEANUP_FAILED`, when a stream can't be confirmed stopped, as for any other cleanup step, so that cleanup is never assumed.
29. As a script author, I want a crashed run's streams swept by the next run, once it holds the lease and before it goes on, so that a crash doesn't leave `adb logcat` processes running on my Mac.
30. As a script author, I want that sweep to kill a process only if it is still that run's `adb … logcat`, so that a reused pid never kills an unrelated process.
31. As a script author, I want `sweptLeftovers: true` in `prepared` when the sweep stopped a leftover stream, so that the report says a takeover happened.
32. As a script author, I want log files older than 3 days deleted at the next Android run, so that logs don't pile up in my temp folder.
33. As a script author, I want the log folder readable only by me (0700) and each file too (0600), so that other users on my Mac can't read my app's log.
34. As an iOS script author, I want the pane's "app stopped" note to keep working, so that iOS runs lose nothing.
35. As an iOS script author, I want my pane, reports, messages and golden entries unchanged, so that the 1.x contract holds.
36. As the owner, I want the streams started with `TYPESAFE_API_KEY` stripped and the private adb server honoured, so that the key never reaches a child process.
37. As the owner, I want the crash, freeze, kill and stale-crash behaviour tested from the lines recorded on real emulators, so that the watcher is proven against what devices really print.
38. As the owner, I want every phase 5 test to run without the Android SDK, so that CI on Linux stays green.

### Implementation Decisions

- **Modules.**
  - A pure logcat line parser sits beside the iOS `appLine` and `osLine` in the log pane's formatter, lifted from the prototype.
  - A pure app-exit watcher in the Android device module folds `am_*` event lines into a state, lifted from the prototype, and adds the start-time filter below.
  - The Android driver gains the two streams, the uid and device-time reads, `pidof`, the log folder, `close`'s step 4 and the takeover sweep.
  - The log pane's stream takes the app check from its caller instead of parsing `_helperpid`.
  - `BridgeService`, the run and the CLI's `logs` fallback pass the new source through.
- **The new seam is a logcat stream starter** injected into the Android driver, beside the `adb` runner. It is needed because the `adb` runner only runs commands that finish.
  - **`start`:** starts a long-running `adb` command with `adbEnvironment()`, sends its output to a file or delivers it line by line, and returns the process's pid, a way to stop it (SIGTERM, then SIGKILL after 1 s, resolving once it has exited), and its exit.
  - **The sweep:** answers whether a pid on the Mac is still a given serial's `adb … logcat`, and kills it (same escalation).

  The production starter spawns `adb` directly, with no shell. The app log's stdout goes straight to the file descriptor, so nothing is buffered in the bridge.
- **Order inside `prepare`**, extending phase 4's:
  1. tools check;
  2. device name to serial and device identity;
  3. take the lease;
  4. agent check and sweep, plus the dead holder's logcat sweep;
  5. device checks and wake;
  6. **delete logs older than 3 days**, then **read the uid** by an exact package match in the full `pm list packages -U` output, **read the device time** with `date +%s.%3N`, with its UTC offset (`%z`) in the same call for the watcher, and **start both streams from that time**;
  7. force-stop and `am start -W`;
  8. **`pidof` once**, never earlier;
  9. push, start and verify the agent.
- **The streams.**
  - **The app log:** `adb -s <serial> logcat -v threadtime,year,uid --uid=<uid> -T <device time>`, written to `<run ID>.log` in the private log folder.
  - **The events stream:** `adb -s <serial> logcat -b events -v threadtime,year -T <device time>` with the filter `am_proc_start:I am_proc_died:I am_crash:I am_anr:I am_kill:I *:S`, read line by line into the watcher and not written to disk.
  - **Both** are recorded as owned processes in the lease's holder record (`logcat <serial> <pid>`, beside phase 4's `agent …` and `forward …` entries) as soon as they start, and disowned only once confirmed stopped.
  - **Neither is a tracked command in the ledger.**
- **The watcher.**
  - **What it reads:** it is fed the package, the launched pid (set once `pidof` answers), the device start time and the device's UTC offset. The events lines carry local time with no zone, so it converts each with the offset and ignores any line stamped before the start time. That covers a stale native crash even if logcat replayed one.
  - **Exits:**
    - a Java crash matches by pid;
    - a native crash matches by package plus `Native crash`;
    - `am_kill` with a `stop …` reason is a force-stop, and any other reason is a kill;
    - `am_proc_died` for the pid is an exit.
  - **A freeze:** `am_anr` for the pid is "not responding". The app is still running, but a later exit still counts.
  - **Expected stops:** the driver tells the watcher when a stop is its own (the force-stop in `close`). The restart's force-stop comes before the pid is known, so it can't match.
  - **Can't tell:** before `pidof` answers, when `pidof` found nothing, or when the events stream ended on its own, the state is "can't tell" (`undefined`).
- **The driver's answer, on both platforms.**
  - `appRunning()` stays synchronous and keeps its meaning.
  - A new optional method beside it returns the problem: `APP_EXITED` or `APP_NOT_RESPONDING`, plus a plain pane note naming the cause. It returns nothing when the app is fine or the driver can't tell.
  - The iOS driver gets the same method from its existing helper-pid check. Its note is today's iOS note, word for word.
  - The release spec leaves the exact interface open; the Issue fixes it.
- **The run.**
  - Where a step's error is replaced by `APP_EXITED` today, the run asks the driver's problem first: `APP_NOT_RESPONDING` or `APP_EXITED`. It falls back to `appRunning() === false` for a driver without the method.
  - A cancel still wins, and a verdict already given (a false checkpoint) stands, as on iOS.
- **The pane.**
  - `startLogStream` takes the app check as a callback and notes the problem once, unless a stop is expected. `expectStop()` and the socket protocol are unchanged.
  - The `hello` message's sources gain an optional `logcat`.
  - For an Android run, the pane's header names the logcat file and the app's uid filter in place of the two iOS source lines. An iOS run's header is unchanged byte for byte.
  - The logcat follower uses the new parser. Masking is the existing masker: `[value:<key>]`, longest first, and an upper-case copy isn't masked.
- **Log tails and `logs`.**
  - `logSources()` gains an optional `logcat` path, recorded in the `prepared` event as the iOS paths are.
  - The Android driver's observations carry `logTails: { logcat: … }` from the shared tail reader, redacted in `run.jsonl` by the run log's existing rule.
  - The CLI's `logs` fallback lists the logcat file with the iOS files.
- **`close`**, step 4 of phase 4's order:
  - **Stopping:** after the app stop, it stops both streams and waits for them to exit, tolerating one that already ended, then disowns each.
  - **Failure:** a stream that can't be confirmed stopped keeps the lease, and the run ends `CLEANUP_FAILED`.
  - **Ordering:** the watcher is told the stop is expected before `close` force-stops the app.
  - **A failed `prepare`:** `close` runs even after one, so it stops whichever streams were started, whether or not the app was restarted.
- **The takeover sweep:**
  - **What it stops:** a dead holder's `logcat <serial> <pid>` entries. It kills each pid only if the Mac process is still that serial's `adb … logcat` and otherwise leaves it alone, then disowns the entry.
  - **When:** before the device checks, so the crashed run's streams are gone once the next run has prepared (release check 15).
  - **The record:** stopping any stream sets `sweptLeftovers: true`, as a swept agent does.
- **The log folder:**
  - **Where:** `jev-android-logs/` under the OS temp folder, created 0700, with files created 0600.
  - **Checks:** a folder that exists but isn't a directory owned by this user is refused rather than used.
  - **Clean-up:** at each Android `prepare`, files there older than 3 days by modification time are deleted, and a failure to delete never fails the run.
- **Contracts.**
  - `APP_EXITED` and `APP_NOT_RESPONDING` are already in the vocabulary (phase 3). No new reason code.
  - Existing golden entries don't change. If the Issue finds a golden file that lists `prepared` or `hello` fields, the `logcat` source is added to it, and nothing else changes.

### Testing Decisions

- **A good test here** drives a public interface with fakes at the injected runners and the stream starter. It asserts what reaches the device and the Mac (the exact `adb` arguments, in order), what the run and pane record, and what the lease allows. It never asserts private state.
- **The end-to-end test for the phase:** `runScriptedScenario` with the real Android driver, a fake `adb` runner, a fake agent client and a fake stream starter. It is fed lines recorded on the emulators:
  - a crash partway through gives `APP_EXITED`, and a freeze gives `APP_NOT_RESPONDING`;
  - a normal run passes;
  - in all three, `close` stopped both streams, disowned them, and released the lease, with no agent, forward or app left.
- **Wire and persistence tests** pin exactly:
  - the two logcat commands, and the uid, time and `pidof` reads, and their order around `am start -W`;
  - the holder record's `logcat <serial> <pid>` entries, added at start and removed at stop;
  - the log file's and folder's modes;
  - the 3-day clean-up;
  - `prepared`'s `logSources.logcat`;
  - a step's `logTails.logcat` in `run.jsonl`, with a script value redacted;
  - the pane's masked line for the same value;
  - the takeover sweep: only a pid whose command line is still that serial's `adb … logcat` is killed, and `sweptLeftovers: true`.
- **Parser and watcher tests** feed the recorded lines from `findings/06-assets/captures/`, copied into `tests/fixtures/android/` so tests don't depend on `.scratch`.
  - **The watcher:**
    - it sorts every captured run as the prototype did;
    - it ignores a stale native crash placed before the start time;
    - it doesn't count the bridge's own expected stop;
    - `probe-anr` gives `APP_NOT_RESPONDING`, the only evidence for it, since there's no live freeze run.
  - **The parser:** every captured app-log line parses or is a divider, with the source, level and tag rules pinned.
- **The pane:** `startLogStream` with an injected app check. The existing iOS test that plants `_helperpid` in a file name changes to the new callback, the one existing-test edit this phase allows (release spec item 7). A new test pins the Android header and the cause note. The iOS header stays byte for byte.
- **The iOS driver:** its problem method through the existing `CliRunner` fake, with the same helper-pid cases as `appRunning`.
- **Prior art:**
  - `tests/android-driver.test.ts` (the Android driver with fake `adb` and agent);
  - `tests/logpane.test.ts` (the pane over a socket);
  - `tests/device.test.ts` (log tails);
  - `tests/scripted-run.test.ts` (runs with fake drivers, and the leak test that scans the whole evidence);
  - `tests/device-lease.test.ts` (owned processes).
- **No device in `npm test`.** Live evidence (the crash run, crash takeover and cleanup gate) belongs to phase 8.

### Out of Scope

- The `capture` command, the `/test-android` skill and the plugin (phase 6).
- The troubleshooting entries (`adb logcat -b crash -d`, `dumpsys activity exit-info`), the data-handling page's note on the log folder, and the rest of the docs (phase 7).
- The live crash run in the owner's desktop session, the crash takeover run and the cleanup gate (phase 8).
- Detecting HOME or backgrounding, on either platform.
- Masking an upper-case copy of a value, on either platform.
- Any phone, including the Xiaomi `2985e9c`. MIUI's logcat access is untested.
- Changing how iOS finds its log files, or any iOS output.

### Further Notes

- The findings measured `cmd package list packages -U`. The release spec says `pm list packages -U`, which prints the same list. Either is fine, as long as the match is exact on the whole package name. A package name passed as a filter matches substrings.
- Seen once and not chased: after `kill -SEGV`, the next capture took 5.1 s. The settle cap already bounds it.
- A likely split, to be confirmed at `/to-spec` for Issues:
  - 18: the parser and the watcher, both pure;
  - 19: the stream starter, the driver's streams, `close` step 4 and the sweep;
  - 20: the pane, the run's problem check on both drivers, the `logs` fallback, and the end-to-end test.

  18 and 19 can run in parallel, and 20 needs both.

### Settled context for phase 5 (owner, 2026-09-30)

- **Carried over from phases 3 and 4:**
  - iOS stays byte-identical, and golden files only gain entries.
  - Tests that existed before phase 5 (`b4ede43`) keep their assertions. Tests added during phase 5 may change with their contract.
  - The one allowed edit to an existing test is the `_helperpid` pane test, which moves to the new app-check callback.
- **Devices:** none needed. The captures from the findings are the fixtures. If an Issue must record one more line, it follows the release spec's device rules:
  - the private adb server on port 5099;
  - the `adb devices` check before each command;
  - emulators only, one at a time;
  - `-no-snapshot-save`;
  - shut down what you started;
  - never port 5037, never a phone, never mobilecli.
- The gates, the `.mcp.json` rule and the `.env` rule above still apply.

### Test seams for phase 5 (owner accepted, 2026-09-30)

- **The run, end to end:** `runScriptedScenario` with the real Android driver, fake `adb` runner, fake agent client and fake stream starter, fed recorded lines (`tests/android-driver.test.ts`, `tests/scripted-run.test.ts`).
- **The one new seam:** the logcat stream starter injected into the Android driver (start, stop, and the sweep's check and kill by pid). Its production form is tested with a fake spawn, as the `adb` runner's is (`tests/fixtures/adb-spawn.ts`).
- **Pure functions over the captures:** the logcat line parser and the app-exit watcher.
- **The log pane:** `startLogStream` with the injected app check (`tests/logpane.test.ts`).
- **The `logs` fallback:** through the existing CLI tests.

## Phase 6: the `capture` command, the `/test-android` skill, and the plugin (execution, from 2026-09-30)

Status: ready-for-agent

The work is [the release spec's phase 6](../android-support/release-spec.md#phase-6-the-capture-command-the-test-android-skill-and-the-plugin-the-test-android-skill-how-a-script-names-an-android-app-and-device-default-device), items 1 to 4, with open points 12, 13 and 14. It is split into Issues 21 and 22 on the feature branch `agent/android-v1.2-phase6`, stacked on phase 5's branch, and shipped as **one PR** whose base is phase 5's branch until that merges. The owner approves the merge. The release spec is the source of truth; this section frames the work and fixes the seams.

### Problem Statement

A person writing an Android script has no good way to see what the bridge will see. They can guess identifiers from the app's source, or run mobilecli by hand. mobilecli shows raw Android classes without the bridge's roles, `scrollable`, `password`, `placeholder` or `selectable: false`, and it leaves its agent and forward behind, which blocks other tools. The agent that helps them has no `/test-android` skill, so it writes Android scripts as if they were iOS ones. The plugin still requires a simulator UDID and has no Android setting, so a user with only an Android emulator can't install it usefully.

### Solution

- **`jev-ios-bridge capture`:** prints the current Android screen exactly as a run would read it, as one JSON line per element, or with `--jev` as Jev's text. It never launches or restarts the app, holds the device lease while it works, refuses on a foreign agent as a run does, and leaves nothing behind.
- **The `/test-android` skill:** walks an agent through the same seven steps as `/test-ios`, with Android details, using `capture` to see each screen.
- **The plugin:** ships the skill, and makes the simulator optional and an Android device optional, so either platform alone works.

### User Stories

1. As a script author, I want `jev-ios-bridge capture --avd <name>` to print the current screen's elements, so that I can write selectors from what the bridge really sees.
2. As a script author, I want each element as one JSON line with role, label, value, identifier, placeholder and state, so that I can read or `grep` it.
3. As a script author, I want lifted texts marked `"selectable": false`, so that I don't write a selector that can't match.
4. As a script author, I want `--jev` to print Jev's text for the screen, byte for byte as a run sends it, so that I can write claims Jev can decide.
5. As a script author, I want `capture` to pick the device by `--serial`, then `--avd`, then `JEV_ANDROID_DEVICE`, so that it matches how my script picks one.
6. As a script author, I want `capture` to leave my app on the screen it was on, so that I can capture a screen deep in a flow.
7. As a script author, I want `capture` to wait for the screen to settle, so that it shows what a run would see.
8. As a script author, I want `capture` to need no TypeSafe key, so that I can author scripts before I have one.
9. As a script author, I want `capture` to refuse with the same reason codes a run uses, on stderr with exit code 3, so that I know what to fix.
10. As a user of another UI tool, I want `capture` to refuse, and leave my agent alone, when my tool's agent is running, so that authoring never breaks my session.
11. As the owner, I want `capture` to hold the device lease and clean up as `close` does, so that it never races a run or leaves an agent or forward behind.
12. As a script author, I want `--help` to list `capture`, so that I can find it.
13. As an agent using the plugin, I want a `/jev-ios-bridge:test-android` skill that follows the same seven steps as `/test-ios`, so that I author Android scripts the proven way.
14. As an agent, I want the skill to use `capture` instead of mobilecli, so that I see roles and flags and leave nothing running.
15. As an agent, I want the skill to tell the user to add `testTagsAsResourceId` when Compose elements have no identifiers, and to show where, so that selectors become stable, without editing the app unless asked.
16. As an agent, I want the skill to point me to the right guide page for each Android note (package, device, activity and extras, placeholder, password dots, numbers, tabs and toggles, non-English text, real phones), so that I don't guess.
17. As an agent, I want the skill to pass `--avd` or `--serial` to `capture` explicitly, so that it works in a shell that lacks the plugin's `JEV_ANDROID_DEVICE`.
18. As an Android-only user, I want to install the plugin without a simulator UDID, so that it works for me.
19. As an iOS-only user, I want to leave the Android device empty, so that nothing changes for me.
20. As a plugin user, I want an optional "Android device" setting passed as `JEV_ANDROID_DEVICE`, so that my scripts needn't name a device.
21. As a plugin user, I want the MCP server to start with either device setting empty, so that one platform's gap never blocks the other.
22. As an npm user, I want the skill in the package with `npx jev-ios-bridge capture` and `node_modules` guide paths, so that it works outside the plugin.
23. As the owner, I want the plugin build to fail loudly if a path it rewrites in the Android skill is missing, as it does for `/test-ios`, so that a stale copy never ships.
24. As the owner, I want the descriptions and keywords in `package.json`, `plugin.json` and the marketplace entry to say iOS and Android, with names unchanged, so that people find it.

### Implementation Decisions

- **`capture` in the Android driver.** The driver gains a capture-only path that reuses `prepare`'s parts in order: tools check, device name to serial and identity, take the lease, agent check and sweep, device checks and wake, push, start and verify the agent. It skips the restart and the logcat streams. It then takes one settled snapshot through the same mapping. `close` then does what it always does: fences the agent and removes the forward. The app is never force-stopped, because this path never restarted it. No screenshot is taken (open point 12).
- **The CLI.** `capture` is a new command. Its options are `--serial`, `--avd` and `--jev`. It prints to stdout and exits 0. A refusal or failure prints the reason code and a plain message on stderr and exits 3. It needs no `TYPESAFE_API_KEY`. SIGINT and SIGTERM close the driver, as a run's handlers do. Device choice reuses `selectAndroidDeviceName`, with `--serial`/`--avd` standing in for the script's device, and an empty `JEV_ANDROID_DEVICE` counts as unset.
- **Output.** Default: one JSON object per element, in snapshot order. The fields are `role`, `label`, `value`, `identifier`, `placeholder` and the state flags the element carries, plus `"selectable": false` only on lifted texts. Absent fields are omitted, never `null`. `ref` and internal fields aren't printed. `--jev`: exactly `renderAssertionState(snapshot, 'android')`.
- **The skill.** `skills/test-android/SKILL.md` is self-contained and mirrors `/test-ios`'s structure and length. It is written with the `writing-for-agents` skill, then `unslop`. `/test-ios` is untouched.
- **The plugin build.** It copies the new skill with the open point 13 rewrites (`npx jev-ios-bridge capture` becomes `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" capture`, and the guide path becomes `${CLAUDE_PLUGIN_ROOT}/docs/guide/`), throwing when either string is missing.
- **`plugin/plugin.json`.** `simulator_udid` becomes `required: false`. A new optional `android_device` setting goes into `env` as `JEV_ANDROID_DEVICE`. The server must start with both empty.
- **Descriptions** (open point 14): say iOS and Android in `package.json`, `plugin.json` and the marketplace entry. Names stay.

### Testing Decisions

- **A good test** drives the CLI or the driver's public path with the existing fakes, and asserts stdout, stderr, exit code, the `adb` and agent calls sent, and the lease left behind. It never asserts private state.
- **The end-to-end test for `capture`:** the CLI's capture path with the Android driver over a fake `adb` runner and fake agent client replaying a real capture fixture. It asserts:
  - the JSON lines, pinned by a new golden file;
  - `--jev`'s text equals the Android render golden for that fixture;
  - no `am force-stop` and no `am start`;
  - the agent fenced, the forward removed, and the lease released.
- **Exit codes:** 0 on success; 3 with the reason code for `NO_DEVICE`, `INVALID_DEVICE`, `ANDROID_TOOLS_UNAVAILABLE` and `DEVICE_BUSY`. These are added as new entries to `cli-exit-codes.json`, and existing entries don't change.
- **Help:** the `--help` text gains `capture`, and the existing help test still passes.
- **The plugin:**
  - a test reads `plugin/plugin.json` for the optional settings and the env mapping;
  - a test runs the build's skill rewrite on the Android skill and on a copy missing a path, which must throw;
  - the MCP server starts with `JEV_DEVICE_UDID` and `JEV_ANDROID_DEVICE` both empty.
- **The skill:** `tests/docs.test.ts`-style checks that every guide page the skill links exists, and that it never mentions `mobilecli`.
- **Prior art:** `tests/contract.test.ts` (CLI goldens and help), `tests/android-driver.test.ts`, `tests/scripted-jev-android.test.ts`, `tests/mcp.test.ts`, `tests/docs.test.ts`.
- **No device in `npm test`.** A live `capture` on each emulator is part of phase 8's evidence.

### Out of Scope

- `capture` for iOS.
- Screenshots from `capture`.
- Editing or rebuilding the user's app from the skill.
- Guide pages, CHANGELOG and version (phase 7).
- Installing the plugin for real (phase 8, with the owner).

### Further Notes

- Issue 21 (`capture`) touches the Android driver and the CLI, which phase 5 also changes, so it starts once phase 5 is merged into this branch. Issue 22 (skill and plugin) touches neither, and can start at once.

### Settled context for phase 6 (owner, 2026-09-30)

- The phase 3–5 settled context carries over: iOS stays byte-identical, golden files only gain entries (the help text change is allowed by release spec item 1), and tests that existed before phase 6 keep their assertions.
- **Devices:** none in `npm test`, and the Issues need none.
- The gates, the `.mcp.json` rule and the `.env` rule above still apply.

### Test seams for phase 6

- **21, `capture`:** the CLI's capture path (the `tests/contract.test.ts` style, with the driver's fakes injected), and the Android driver's capture path with the fake `adb` runner, agent client and lease root.
- **22, skill and plugin:** the plugin build's rewrite step as a function, `plugin/plugin.json` read by a test, the MCP server start with empty device settings (`tests/mcp.test.ts`), and a docs-style check of the skill.

## Rulings during execution

- **2026-09-29, phase 2 item 6 (owner):** existing tests build test data with `app: { bundleId }` (`tests/device.test.ts:10,825`) and `startLogStream({ bundleId })` (`tests/logpane.test.ts:45,70`), so renaming those inputs would break existing tests. Phase 2 renames only what no existing test touches: the iOS driver's private field, the log pane's internal `hello` message field, and `BridgeService`'s local use. Renaming `ScenarioContext.app` and `startLogStream`'s option moves to **phase 3**, which adds Android's `app.package` and reshapes the app type once, as an iOS or Android identity.
- **2026-09-29, phase 3 (owner):** `startLogStream` takes the app's identity (`app`, the iOS or Android identity) instead of `bundleId`. The two existing calls in `tests/logpane.test.ts` (lines 45 and 70) change to `app: { bundleId: 'com.example.app' }`; nothing else in that file changes. `startLogStream` doesn't keep accepting `bundleId`.
- **2026-09-29, phase 3 (owner):** phase 3 is split into Issues 03 to 07 on the feature branch `agent/android-v1.2-phase3`, one PR.
- **2026-09-30, phase 3 item 1 (owner):** scripts are parsed by platform. An iOS script goes through the 1.1 schema, plus an optional `platform: "ios"`, so iOS error output (messages, paths, order, and the CLI's printed list) matches 1.1 for every input, including scripts with several errors. An Android script has its own schema. One merged object schema generates only the MCP input schema, and the `mcp.json` diff stays exactly as decision A says. This replaces the release spec's "one object schema plus a platform-aware refinement": zod skips a refinement when the base object fails, and a review found 189 of 697 multi-error iOS inputs printing different output.
- **2026-09-30, phase 3 Issue 03 (owner):** `ScriptedScenario` types each platform truthfully: an Android script's `app` has a required `package` and no `bundleId`. The one existing test that reads `scenario.app.bundleId` for every script, `tests/service.test.ts:134`, may change to `built.push(appLabel(scenario.app))` with a new import line. Its assertions stay the same.
- **2026-09-30, phase 3 (owner):** "existing tests" means the tests that existed before phase 3 (`819ea10`). Tests added during phase 3 may change with the contract they pin. First use: Issue 07 extends the Android half of Issue 03's `started` test (`tests/scripted-run.test.ts`) to the full Android `started` fields and `android-full-text-v1`. Its iOS half stays byte for byte.
- **2026-09-30, phase 4 item 0 (tracer):** passed 19 of 19 steps on `jev-actions-api31` and `Medium_Phone_API_36.1` (`82e5825`; `spikes/benchmarks/results/v1.2.0/tracer/`). ADR-0006 stands, and phase 4 continues from item 1.
- **2026-09-30, phase 4 item 6 (owner):** the tracer found that Gboard keeps pasted text as a clipboard suggestion after `device.clipboard.clear`, on API 31 and 36. Build replace text as the spec says (non-ASCII through the clipboard, then `device.clipboard.clear`), with no extra code. Phase 7 says plainly, in `docs/guide/reference/script-format.md` and in the v1.2.0 release notes, that a non-English typed value passes through the device clipboard and the keyboard may keep it, so it shouldn't be a real secret. ASCII values are typed with `device.io.text` and never touch the clipboard.
- **2026-09-30, phase 4 (owner):** phase 4 is split into Issues 10 to 16 on the feature branch `agent/android-v1.2-phase4`, one PR, with the test seams in "Test seams for phase 4". Issues 10 to 13 can run in parallel; 14 needs 10 and 11; 15 needs 12, 13 and 14; 16 needs 14 and 15. Android stays refused until Issue 16 wires the driver into the factory.
- **2026-09-30, phase 5 (owner):** the phase 5 test seams are accepted as listed in "Test seams for phase 5": one new seam, the logcat stream starter injected into the Android driver.
- **2026-09-30, phase 5 (owner):** phase 5 is split into Issues 18 to 20 on the feature branch `agent/android-v1.2-phase5`, one PR. 18 (parser and watcher) and 19 (the driver's streams, `close` step 4, the sweep) run in parallel; 20 (pane, run check, `logs`, end to end) needs both.
- **2026-09-30, phase 6 (coordinator, owner away overnight with a standing handoff):** phase 6 is split into Issues 21 (`capture`) and 22 (skill and plugin) on `agent/android-v1.2-phase6`, stacked on phase 5's branch. 22 starts at once; 21 waits for phase 5's merge into the branch, because both change the Android driver and the CLI. Review-fix Issues take the next free numbers.
