# Phase 2: refactors that change nothing for iOS

Status: ready-for-agent

Spec: [../spec.md](../spec.md). The work is [the release spec's phase 2](../../android-support/release-spec.md#phase-2-refactors-that-change-nothing-for-ios-where-android-plugs-into-the-code-items-1-to-4-domain-model-decision-h), items 1 to 6. Read that section in full. The detail below only adds acceptance criteria.

## What to build

1. **The driver factory** (item 1). One function in `src/device/` builds the driver from the scenario, chosen per scenario, never per process. `src/cli.ts`, which serves MCP too, passes it to `BridgeService` as `createDriver`. For now it builds only the MobileBuildMCP driver.
2. **The device lease, shared** (item 2). `src/device/lease.ts` holds:
   - taking and releasing the lease, keyed by the device identity;
   - the holder record: the run, the process, and an optional list of owned processes (empty for iOS; phases 4 and 5 fill it);
   - a dead holder losing the lease to the next run, which gets the dead holder's record;
   - the in-flight ledger: today's `pendingOperations` and `unconfirmedCommands`. Each command is in flight, exited, unknown or fenced;
   - release only when nothing the run started can still act on the device, otherwise keep the lease and release it late (today's `finishWhenAcknowledged`);
   - a fence hook, unused by iOS.

   The MobileBuildMCP driver uses it with identical behaviour. The lock folder `jev-ios-bridge-device-locks`, the `<ID>.lock` file names and the `pid` field stay, so a 1.1 bridge and this one still exclude each other. `readLogTail` moves to a shared file. Name the concept "device lease" in code and in `docs/architecture.md` "One run" step 7, reworded to the invariant: "when the lease is released, nothing the run started can still act on the device". User-visible messages stay byte-identical.
3. **The tap alias rule moves onto the MobileBuildMCP driver** (item 3), as a read-only property the run reads. Remove the `tapAliasRule` option from `BridgeService` and `src/cli.ts`. The selection code (`src/scripted/select.ts`) keeps taking it as an option.
4. **The renderer takes the platform** (item 4): an optional parameter that defaults to iOS. iOS output stays byte for byte.
5. **`bridgeRole` moves into the iOS driver's side** (item 5): out of `src/scripted/vocabulary.ts` into `src/device/`. The role list stays in the vocabulary.
6. **The app's identity replaces `bundleId` inside the code** (item 6): in `ScenarioContext`, `BridgeService` and the log pane's messages. The script field, `run.jsonl` and `report.json` keep `bundleId`.

## Acceptance

- Every existing test and every file in `tests/golden/` passes **unchanged**. Don't edit an existing test or golden file. Add new tests freely.
- New tests cover:
  - the factory;
  - the lease's interface: take, release, busy, dead-holder takeover handing over the record, keeping on an unknown outcome, late release, the fence hook, and the file format a 1.1 bridge reads;
  - the run reading the alias rule from the driver;
  - the renderer's platform parameter defaulting to iOS.
- `npm run check` passes.
- No device, simulator or emulator is touched.
