# Phase 6: the `capture` command

Status: ready-for-agent
Blocked by: phase 5 merged into `agent/android-v1.2-phase6`

Spec: [../spec.md](../spec.md), "Phase 6". The work is [the release spec's phase 6](../../android-support/release-spec.md#phase-6-the-capture-command-the-test-android-skill-and-the-plugin-the-test-android-skill-how-a-script-names-an-android-app-and-device-default-device) item 1, with [open point 12](../../android-support/release-spec.md#open-points-for-the-executor). Read them in full. The detail below only adds acceptance criteria.

## What to build

1. **A capture-only path in the Android driver.** It runs `prepare`'s parts without the restart and without the logcat streams:
   - tools;
   - device name to serial and identity;
   - take the lease;
   - agent check and sweep, including a dead holder's leftovers;
   - device checks and wake;
   - push, start and verify the agent.

   It then takes one settled snapshot and returns it. `close` stays the only cleanup: it fences the agent, removes the forward and releases the lease, and never force-stops the app, because the app wasn't restarted. Keep `prepare` itself unchanged in behaviour. No screenshot.
2. **`jev-ios-bridge capture [--serial S | --avd A] [--jev]`** in the CLI:
   - **Device:** `--serial` wins over `--avd`, and then `JEV_ANDROID_DEVICE`, through `selectAndroidDeviceName`. An empty `JEV_ANDROID_DEVICE` counts as unset.
   - **Options:** `--serial` and `--avd` go through the same patterns as the script's `device` fields, and a bad value is `INVALID_DEVICE`. `--json`, `--no-log-pane` and the run limits are refused for `capture`, as the other commands refuse options that don't apply.
   - **Output:** one JSON line per element, in snapshot order, with `role`, `label`, `value`, `identifier`, `placeholder` and the element's state flags, plus `"selectable": false` on lifted texts. Omit absent fields. Never print `ref` or internal fields. `--jev` prints `renderAssertionState(snapshot, 'android')` exactly.
   - **Key:** no `TYPESAFE_API_KEY` needed.
   - **Exit codes:** 0 when it printed. 3 on any refusal or failure, with the reason code and a plain message on stderr; never print an agent or `adb` message, which can carry screen text.
   - **Signals:** SIGINT and SIGTERM close the driver before exiting, as a run's handlers do.
   - **Help:** `--help` lists `capture` and its options.

## Acceptance

- **The end-to-end test.** The CLI's capture path, with the driver's fake `adb` runner and fake agent client injected, replays one of the phase 4 capture fixtures. It asserts:
  - the JSON lines against a new golden file;
  - `--jev` equal to that fixture's Android render golden;
  - no `am force-stop` and no `am start`;
  - the agent fenced, the forward removed, and the lease released.
- **Refusals:** `NO_DEVICE`, `INVALID_DEVICE` (bad `--serial`), `ANDROID_TOOLS_UNAVAILABLE` and `DEVICE_BUSY` (a foreign agent, left untouched) each exit 3 with the code on stderr. Add them as new entries in `tests/golden/cli-exit-codes.json`, and don't change existing entries.
- **Help:** the `--help` test still passes and now shows `capture`.
- **iOS:** no iOS output changes.
- `npm run check` passes. No device is touched.
