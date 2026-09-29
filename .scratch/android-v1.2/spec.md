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

## Rulings during execution

- **2026-09-29, phase 2 item 6 (owner):** existing tests build test data with `app: { bundleId }` (`tests/device.test.ts:10,825`) and `startLogStream({ bundleId })` (`tests/logpane.test.ts:45,70`), so renaming those inputs would break existing tests. Phase 2 renames only what no existing test touches: the iOS driver's private field, the log pane's internal `hello` message field, and `BridgeService`'s local use. Renaming `ScenarioContext.app` and `startLogStream`'s option moves to **phase 3**, which adds Android's `app.package` and reshapes the app type once, as an iOS or Android identity.
