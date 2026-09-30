# Phase 4: close, the factory wiring, and the end-to-end run

Status: ready-for-agent
Blocked by: 14, 15

Spec: [../spec.md](../spec.md), "Phase 4". The work is [the release spec's phase 4](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) item 8, the factory sentence at the top of phase 4, and item 9's `close` tests. Read them in full, and the domain model's device lease (decision G). The detail below only adds acceptance criteria.

## What to build

1. **`close`**, keeping the lease's invariant: when the lease is released, nothing the run started can still act on the device. The run always calls `close`, even after a failed `prepare`, so `close` undoes only what this run actually did.
   - Once `close` begins, set the stop flag Issues 14 and 15 check, so the driver issues no new device work.
   - Then, in this order, tolerating "not running" at each step:
     1. Wait, within `close`'s time limit, for every tracked `adb` command to exit, including the one that starts the agent. A command still running at the limit, or with an unknown outcome, keeps the lease: `close` fails with `UI_ACTION_UNCONFIRMED`, and the run ends inconclusive with `CLEANUP_FAILED`, as on iOS. When it exits later, finish the steps below and release late (`releaseLate`).
     2. **Fence** the bridge's own agent: kill only the pid this run started, after checking it's still the bridge's own (open point 22), then confirm it's gone. A confirmed fence calls `fence('agent')`, which ends every agent request, including an unknown one. An unconfirmed fence keeps the lease the same way.
     3. Force-stop the app, but only if this run restarted it.
     4. *(Phase 5: stop this run's `logcat` streams.)* Leave a marked, empty step here.
     5. Remove this run's forward, by its port.
     6. Disown what was confirmed stopped, then release the lease.
   - Leave the agent file on the device: it's inert. Any other failure keeps the lease and fails `close` (`CLEANUP_FAILED`).
2. **The factory** (`src/device/factory.ts`) builds the Android driver for Android scripts, and no longer refuses them. The phase 3 tests that pinned the refusal (the factory, `BridgeService`, the CLI stderr test in `tests/contract.test.ts` and the MCP test in `tests/mcp.test.ts`) change with their contract (owner ruling, 2026-09-30). Each must end at a deterministic Android error instead, not one that depends on whether the machine has `adb`: for example `ANDROID_TOOLS_UNAVAILABLE`, with `ANDROID_HOME`, `ANDROID_SDK_ROOT` and `PATH` pointed at an empty folder. Keep `DriverUnavailableError` if something still throws it; otherwise remove it and its tests.
3. **The CLI's SIGINT and SIGTERM handlers** close the service, which calls this same `close`; check that the existing handlers already do this for Android, and add a test if none covers it.

**From Issue 14 (coordinator, 2026-09-30):**
- The Android driver takes the script's `device` and `JEV_ANDROID_DEVICE` as constructor options, because `runScriptedScenario` doesn't pass an Android script's device to `prepare`. The factory passes them in.
- Whether this run restarted the app stays in the driver's memory, not in the lease's holder record: the crash sweep never acts on the app, and an owned entry would block release. `close`'s step 3 reads that memory.
- A refusal before the app restart already releases the lease inside `prepare`, as the iOS driver does. `close` after such a refusal must stay a no-op that succeeds.

**From Issue 15 (coordinator, 2026-09-30):**
- `close` already sets the stop flag before it rejects (Issue 15 needed it for its "abandoned replace text" test). Keep setting it as `close`'s first step.
- The factory passes the screenshot folder the run wants; without one, the driver makes its own temporary folder.

## Acceptance

- `close` tests with the fakes:
  - the order, and the tolerance of each step;
  - a `DEVICE_BUSY` refusal followed by `close`: the foreign agent keeps running, the app isn't stopped, and the lease is released;
  - a cancel while the agent is starting: `close` waits for the start command, then fences the agent it started, and no agent is left;
  - after `close` begins, an abandoned `prepare` or replace-text issues no further device command;
  - a cancel during `am start -W`: the app is stopped only after the launch returns, never before;
  - an agent request that times out: the fence ends it and the lease is released, but when the fence can't be confirmed the lease stays;
  - a late `adb` exit after `close`'s limit: the lease is kept, then released when the command exits;
  - an `adb` command that never exits: the lease stays;
  - a failed cleanup step: the lease stays, and the run doesn't pass.
- **The end-to-end run** (spec, "Testing Decisions"): `runScriptedScenario` with the real Android driver, a fake `adb` runner and a fake agent client, runs an Android script with a replace-text step and a checkpoint to a verdict. It pins the `adb` commands and agent calls sent, the `prepared`, `action` and `step` events (`shownValue`, `settled`), a `screen-N.jpg` per observation, and a released lease with no agent, forward or restarted app left. Its typed value ends with a space: the shown value keeps it, and `run.jsonl` masks it.
- An iOS script still gets the MobileBuildMCP driver, and every iOS test and golden entry is unchanged.
- `npm run check` passes. No device is touched.
