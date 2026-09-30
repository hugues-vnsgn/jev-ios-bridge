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

## Rulings during execution

- **2026-09-29, phase 2 item 6 (owner):** existing tests build test data with `app: { bundleId }` (`tests/device.test.ts:10,825`) and `startLogStream({ bundleId })` (`tests/logpane.test.ts:45,70`), so renaming those inputs would break existing tests. Phase 2 renames only what no existing test touches: the iOS driver's private field, the log pane's internal `hello` message field, and `BridgeService`'s local use. Renaming `ScenarioContext.app` and `startLogStream`'s option moves to **phase 3**, which adds Android's `app.package` and reshapes the app type once, as an iOS or Android identity.
- **2026-09-29, phase 3 (owner):** `startLogStream` takes the app's identity (`app`, the iOS or Android identity) instead of `bundleId`. The two existing calls in `tests/logpane.test.ts` (lines 45 and 70) change to `app: { bundleId: 'com.example.app' }`; nothing else in that file changes. `startLogStream` doesn't keep accepting `bundleId`.
- **2026-09-29, phase 3 (owner):** phase 3 is split into Issues 03 to 07 on the feature branch `agent/android-v1.2-phase3`, one PR.
- **2026-09-30, phase 3 item 1 (owner):** scripts are parsed by platform. An iOS script goes through the 1.1 schema, plus an optional `platform: "ios"`, so iOS error output (messages, paths, order, and the CLI's printed list) matches 1.1 for every input, including scripts with several errors. An Android script has its own schema. One merged object schema generates only the MCP input schema, and the `mcp.json` diff stays exactly as decision A says. This replaces the release spec's "one object schema plus a platform-aware refinement": zod skips a refinement when the base object fails, and a review found 189 of 697 multi-error iOS inputs printing different output.
- **2026-09-30, phase 3 Issue 03 (owner):** `ScriptedScenario` types each platform truthfully: an Android script's `app` has a required `package` and no `bundleId`. The one existing test that reads `scenario.app.bundleId` for every script, `tests/service.test.ts:134`, may change to `built.push(appLabel(scenario.app))` with a new import line. Its assertions stay the same.
- **2026-09-30, phase 3 (owner):** "existing tests" means the tests that existed before phase 3 (`819ea10`). Tests added during phase 3 may change with the contract they pin. First use: Issue 07 extends the Android half of Issue 03's `started` test (`tests/scripted-run.test.ts`) to the full Android `started` fields and `android-full-text-v1`. Its iOS half stays byte for byte.
