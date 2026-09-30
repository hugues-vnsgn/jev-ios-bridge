# Phase 4: close, the factory wiring, and the end-to-end run

Status: claimed
Claimed by: claude-issue-16
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

### 2026-09-30, claude-issue-16: built

**What I built:**
- **`close`** (`src/device/android/driver.ts`) follows the release spec's phase 4 item 8. It sets the stop flag first. After that, only `close`'s own signal may issue device work. Then, in order:
  1. It waits for every operation this run started (`lease.settle`). If it runs out of time, it fails with `UI_ACTION_UNCONFIRMED` and releases the lease late, as iOS does. An `adb` command with an unknown outcome also fails it with `UI_ACTION_UNCONFIRMED`, and nothing more is sent.
  2. It fences the agent by pid, never with `pkill`, after checking the agent is still the bridge's own, and confirms it's gone. It then calls `fence('agent')` and disowns the agent. If the fence can't be confirmed, `close` fails with `UI_ACTION_UNCONFIRMED` and the lease stays.
  3. It force-stops the app, but only if this run restarted it.
  4. A marked, empty step for phase 5's `logcat` streams.
  5. It removes this run's forward by its port and disowns it.
  6. It releases the lease.

  After a refusal before the restart, `close` does nothing and succeeds. The agent file stays on the device.
- **`DeviceLease.settled(kind)`** (`src/device/lease.ts`, an addition only) is true when every command of that kind has exited or been fenced.
- **The factory** builds `AndroidDriver` for Android scripts. It passes the script's `device`, plus the `android` options: `JEV_ANDROID_DEVICE` as `defaultDevice`, passed in from `src/cli.ts`. Nothing throws `DriverUnavailableError` any more, so I removed it. The CLI's start-error catch and the MCP `start_scenario` catch are back to their 1.1 form.
- **SIGINT and SIGTERM:** the existing handlers already reach the driver's `close` through `service.close()`. No test covered this, so I added one.

**Deviations and choices, and why:**
- **Step 1 waits for every tracked operation, including agent requests, not only `adb` commands.** A request that ends after `fence('agent')` would be recorded as unknown after the fence and keep the lease for good. Agent requests have a 10 s limit, well within cleanup's 45 s.
- **Once the start command was issued, the fence kills every bridge-owned agent it lists, by pid, not only the recorded pids.** A cancel during the start leaves an agent whose pid was never recorded, and the Issue wants no agent left. `prepare` already swept every other bridge agent while holding the lease, so any bridge agent still listed is this run's. If a recorded pid is now listed as not the bridge's own, the fence is unconfirmed and the lease stays.
- **Screenshot folder:** the factory passes none. The run has no folder to give: `createDriver` runs before the run id exists, and the run log copies each screenshot into the evidence as `screen-N.jpg` (N is the event number) when the step is recorded. So the driver uses its own temporary folder, and removes it at the end of a successful `close`. That removal wasn't asked for: it keeps screen images from piling up in `$TMPDIR`.
- **`LATE_CLOSE_MS`** is 45 s, the same as the run's default cleanup limit, and it is its own constant, as the iOS driver's is.

**Open-point defaults used:** 22 (own agent = `CLASSPATH=` entry in `/proc/<pid>/environ`; kill by pid only).

**Tests added:**
- `tests/android-driver.test.ts`, 18 new:
  - the order, and each step's tolerance;
  - a second `close` does nothing; `close` before `prepare`;
  - `DEVICE_BUSY` then `close`; a foreign agent found after the restart;
  - a cancel during the agent start, and during `am start -W`;
  - an abandoned `prepare`;
  - an agent request that timed out, one still running when `close` begins, and a fence that can't be confirmed;
  - a late `adb` exit released late, one that never exits, and one killed with no exit status;
  - a failed cleanup step;
  - the temporary screenshot folder removed;
  - the end-to-end run: it pins the `adb` commands and agent calls, the `prepared`, `action` and `step` events, one screenshot per observation, the shown value `'Ha Noi '` with its trailing space and `[REDACTED]` in `run.jsonl`, and the released lease with no agent, forward or restarted app left;
  - a run whose cleanup fails ends inconclusive with `CLEANUP_FAILED`.
- `tests/android-cli-signal.test.ts`, 2 new: SIGINT and SIGTERM through the real CLI, with a fake `adb` script.
- `tests/device-lease.test.ts`, 1 new: `settled(kind)`.
- `tests/device-factory.test.ts`: the device is passed through.
- **Changed, under the owner's 2026-09-30 ruling:** the phase 3 refusal tests in `device-factory`, `service`, `contract` and `mcp` now end at `ANDROID_TOOLS_UNAVAILABLE`. `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `PATH` and the home folder point at an empty folder. The home folder has to be empty too, because the tools lookup's last fallback is `~/Library/Android/sdk`.
- **Changed, both phase 4 tests:**
  - Issue 14's "close is not available yet" now expects `close` before `prepare` to do nothing.
  - Issue 15's abandoned replace-text test awaited `close` inside the act's own call. It now begins `close` there and awaits it afterwards, because `close` now waits for the act.

**Gate:** `npm run check` passed, 409 of 409 tests, at `f5032bf` (log: `$TMPDIR/implement-phase4-16-check.log`). No device was touched; neither `adb` nor mobilecli was run. No golden file changed.

**`/code-review` against `93dd89c`:**
- **Standards:** 0 hard violations, 5 judgement calls.
  - Fixed: `restarted` and `appPackage` are now one field; the MCP test's imports moved to the top of the file; a doc comment added.
  - Kept: `close`'s shape copies the iOS driver's, because the iOS code stays frozen; the phase 5 placeholder, because the Issue asks for it; `LATE_CLOSE_MS`, as above.
- **Spec:** 0 missing, 2 partial, 3 departures from the spec's wording, 2 not asked for.
  - Fixed: an unconfirmed fence is now `UI_ACTION_UNCONFIRMED` ("keeps the lease in the same way"); the shown value is now checked directly; added a test for a request still running when `close` begins.
  - Explained above: the wait for all operations, fencing every bridge agent it lists, the screenshot folder and its removal.
