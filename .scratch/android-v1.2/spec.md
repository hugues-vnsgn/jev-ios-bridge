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
