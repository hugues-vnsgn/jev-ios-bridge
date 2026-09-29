# Phase 2: refactors that change nothing for iOS

Status: ready-for-agent
Claimed by: implementer-01

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
6. **The app's identity replaces `bundleId` inside the code** (item 6), only where no existing test touches it: the iOS driver's private field, the log pane's internal `hello` message field, and `BridgeService`'s local use. `ScenarioContext.app` and `startLogStream`'s `bundleId` option stay as they are; phase 3 renames them as an iOS or Android identity. The script field, `run.jsonl` and `report.json` keep `bundleId`.

   2026-09-29, owner ruling: ScenarioContext.app and startLogStream's option move to phase 3.

## Acceptance

- Every existing test and every file in `tests/golden/` passes **unchanged**. Don't edit an existing test or golden file. Add new tests freely.
- New tests cover:
  - the factory;
  - the lease's interface: take, release, busy, dead-holder takeover handing over the record, keeping on an unknown outcome, late release, the fence hook, and the file format a 1.1 bridge reads;
  - the run reading the alias rule from the driver;
  - the renderer's platform parameter defaulting to iOS.
- `npm run check` passes.
- No device, simulator or emulator is touched.

## Comments

**implementer-01, 2026-09-29.** Items 1 to 5 are built and committed on `agent/android-v1.2--01`; `npm run check` passes (178 tests); no existing test case or golden file changed, existing test files only gained cases. Local choices:

- The factory is `createDriverFactory(options)` in `src/device/factory.ts`; it returns the `createDriver` function `BridgeService` takes. It ignores the script until phase 3 adds `platform`.
- `src/device/lease.ts` exports `DeviceLease`, a class the driver builds at construction, so the in-flight ledger can track `prepare` before the lease is taken (today's `pendingOperations`). It has `take(deviceId, { runId? })`, which returns the dead holder's record (`runId`, `processId`, `ownedProcesses`) on takeover; `track`, `operationsInFlight`, `operationsSettled` (operations); `command(kind)` with states in flight, exited, unknown, fenced; `fence(kind)`, which fences the unknown commands of one kind; `own` and `disown`, which rewrite the file; `releasable`; `release()`, which throws `DeviceLeaseKeptError` when not releasable; and `releaseLate(finish)` (today's `finishWhenAcknowledged`). `processAlive` and `readLogTail` moved into it.
- The lease file keeps `pid`, `token`, `deviceId` and `createdAt`, and adds `runId` when given and `ownedProcesses` only when non-empty, so an iOS lease file is a 1.1 file plus nothing. File names stay upper-cased `<ID>.lock` under `jev-ios-bridge-device-locks`.
- The iOS driver doesn't pass a `runId` to the lease: `PrepareScenarioContext` carries none, and adding one is outside this Issue's seams. The lease supports it for phase 4.
- `Platform` (`'ios' | 'android'`) lives in `src/contracts/index.ts`. The renderer's Android branch has only the header phase 3 names; the projection rule constant is left to phase 3.
- Item 6 was blocked because the full rename would change existing tests. The owner ruled on 2026-09-29 (see item 6), and it is now built as ruled: the iOS driver's `appId` field, the pane's `hello.appId`, and `BridgeService`'s local `appId`.


**implementer-01, 2026-09-29, review round 1.** Fixed in `de24561`:
- `release()` again rethrows read and parse errors other than ENOENT, as 1.1's release did, so the lease and its file stay.
- A driver test pins the iOS lease file to exactly `pid`, `token`, `deviceId` and `createdAt`.
- `lease.ts` says "device identity" for these names; only the on-disk `deviceId` field keeps its 1.1 name.
- `readLogTail` now lives in `src/device/logs.ts`. `processAlive` now lives in `src/process.ts`, used by the lease and the log pane. The pane's call site already required a positive integer pid, so its behaviour is unchanged.
- Command kinds are the `DeviceCommandKind` union, `'mobilebuildmcp'` for now.
- `lease.settle(signal)` replaces the driver's settlement loop, and `operationsInFlight` and `operationsSettled` are gone.
- `DeviceCommand` no longer has a `state` getter.
