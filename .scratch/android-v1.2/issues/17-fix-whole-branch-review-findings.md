# Phase 4: fix whole-branch review findings

Status: claimed
Claimed by: claude-issue-17
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 4". This fixes the whole-branch two-axis review of `agent/android-v1.2-phase4` (Issues 10 to 16 merged, reviewed `f93645a...c43b2a8`). The work is on a branch cut from the phase branch, as Issues 10 to 16 were. Read the release spec's phase 4 item 8 (`close`) and "Rules for the whole release" before starting.

## Findings

1. **P1, bug: a cancel during any `adb` command keeps the device lease for good.** The run passes its cancel signal into `prepare`. `adbRunner` (`src/device/android/adb.ts`) SIGKILLs the child on abort and throws `OutcomeUnknownError`, so `inLedger` marks the command unknown. `close` then stops at `settled('adb')` in `finishClose` (`src/device/android/driver.ts`), before the fence: the agent isn't killed, the app isn't stopped, `releaseLate` never helps (the killed command never settles), and under MCP every later run on that device is `DEVICE_BUSY` until the server restarts. Ctrl-C, `WALL_LIMIT` and `cancel_scenario` all hit it during `am start -W`, the agent start or `ps`.
   - **Fix, from the spec's own design** (item 8: "Wait, within `close`'s time limit, for every tracked `adb` command to exit, including the one that starts the agent"; "The run abandons a cancelled or timed-out driver call without waiting for it"): `adbRunner` doesn't kill a finite `adb` command on abort. It lets the child exit, records its real outcome (a known exit, so `exited()`), and then rejects with the signal's reason. The driver's stop flag already keeps the abandoned operation from issuing its next step. A child that ends with no exit status for another reason stays an unknown outcome.
   - `close`'s own time limit still applies: an `adb` command still running when it runs out keeps the lease and fails `close` with `UI_ACTION_UNCONFIRMED`, and `releaseLate` finishes the cleanup when it exits, as item 8 says.
   - **Tests:** the Issue 11 test "an abort killing the child (an unknown outcome)" changes with its contract (a phase 4 test, owner ruling 2026-09-30). Add driver tests built on the **production** `adbRunner` with a fake spawn whose child exits only after the abort: a cancel during `am start -W` (close waits for the launch to return, then fences, stops the app, removes the forward and releases the lease), and a cancel during the agent start (close waits, then fences the agent it started). The existing `FakeAdb` ignores aborts mid-call; either make it model the production runner, or keep it and add these tests on the real runner.
2. **P3: `sweptLeftovers` stays false after a takeover that kills an unlisted bridge agent.** Release spec item 2: "When the lease was taken over from a dead holder and anything was swept, `prepared` records `sweptLeftovers: true`." `checkAgents` sets it only for pids and forwards the dead holder listed; a crash between the agent start and `lease.own(agent…)` leaves exactly an unlisted one. Set it when a dead holder's takeover sweeps anything, listed or not. Test it.
3. **P3: an unauthorized emulator named by AVD returns `DEVICE_NOT_CONNECTED`, not `DEVICE_UNAUTHORIZED`.** Resolution by AVD name reads `ro.boot.qemu.avd_name` only from serials in state `device`. An `unauthorized` emulator's property can't be read, so: when no `device`-state emulator matches and an `emulator-*` serial is `unauthorized`, refuse with `DEVICE_UNAUTHORIZED`. Test it with a `devices -l` fixture line.
4. **P2, standards: the same error built three ways.** `OutcomeUnknownError` (`adb.ts`), `DeviceAgentError` (`agent-client.ts`) and `AndroidDeviceError` (`driver.ts`) each hand-declare `vendorCode`, and `failureOf` in `src/scripted/run.ts` casts to read it. Give `DeviceReasonError` (`src/device/index.ts`) an optional `vendorCode` (constructor option), have the three use it, and drop the cast. iOS errors pass none, so iOS output doesn't change. Move `OutcomeUnknownError` and `inLedger` out of `adb.ts` into a small shared module (for example `src/device/android/ledger.ts`), since agent requests use them too.
5. **P2, standards: three types for one agent tree.** `AgentNode`/`UiTree` (`settle.ts`), `AndroidNode`/`AndroidTree` (`mapping.ts`) and `dumpUi` returning `unknown[]` describe the same tree, and `driver.ts` casts twice. Define one node and tree type, owned by the agent client, returned by `dumpUi`, and used by the settle rule and the mapping.
6. **P3, standards: repeated literals.** The status bar prefix `com.android.systemui:` is defined in `settle.ts` and spelled out again in `mapping.ts`; `ro.boot.qemu.avd_name` and `emulator-` each appear twice in `driver.ts`. One constant each.
7. **P3, standards: the agent-start deadline uses a real timer.** `awaitAgent` in `driver.ts` counts with the injected `Clock` but uses a real `setTimeout` for its deadline. Use the clock, so tests can drive it.
8. **P3, standards: a copied test helper.** `refusal()` and `installed` are identical in `tests/android-agent-supply.test.ts` and `tests/android-tools.test.ts`. Share them under `tests/fixtures/`.

Not taken (judgement calls): splitting `driver.ts`; the one-line `adbEnvironment()` wrapper, which Issue 10 names.

## Acceptance

- The P1 tests fail before the fix and pass after it, on the production `adbRunner`.
- iOS scripts, messages, exit codes, the run log, `report.json`, the prose report and MCP replies stay byte-identical to `main`. Every golden entry stays byte-identical.
- Tests that existed before phase 4 (`f93645a`) keep their assertions. Phase 4 tests may change with their contract.
- No device is touched. `npm run check` passes.
