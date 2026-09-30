# Phase 6: the `capture` command

Status: claimed
Claimed by: claude-issue-21
Blocked by: none (phase 5 merged in at 169ff02)

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

## Comments

### 2026-09-30, claude-issue-21: built, ready for the coordinator

**What I built** (commits `0732d03`, `6d901d3`):
- **`AndroidDriver.capture(signal)`** (`src/device/android/driver.ts`). It runs, in `prepare`'s order:
  - tools;
  - device name to serial and identity;
  - lease;
  - the takeover sweep (the dead holder's logcat streams, then the agent check and sweep);
  - API, boot and screen checks, and the wake;
  - push, start and verify the agent.

  It then returns one settled snapshot, mapped as `observe` maps it, with no screenshot and no log tail. There is no restart and no logcat stream. A refusal releases the lease as `prepare`'s does, and `close` is unchanged.
  - To share the code, `prepare`'s first steps moved into `takeDevice` and `sweepLeftovers`, and the snapshot literal into `snapshotOf`.
  - `checkDevice` skips `pm path` when no package is given, which only capture does.
  - `prepare`'s behaviour and its `adb` call list are unchanged, and its pinned-order test passes as it was.
- **`src/capture.ts`, `captureCommand(request, context)`:** the command itself. `src/cli.ts` parses `--serial`, `--avd` and `--jev`, refuses `--json`, `--no-log-pane` and the run limits for `capture`, refuses the three new options on other commands, and wires SIGINT and SIGTERM. Those abort the capture, and the process exits 130 or 143 once the driver has closed.
- **Help:** a usage line and a four-line paragraph.

**Deviations and choices, and why:**
1. **The command body lives in `src/capture.ts`, not `src/cli.ts`.** `cli.ts` runs `main()` when imported, so a test can't inject fakes into it. `cli.ts` only wires the command. The end-to-end test drives `captureCommand` with the fakes, and the option refusals are covered through the real CLI in subprocess golden entries.
2. **"That fixture's Android render golden"** is read as `tests/fixtures/android/observations/<screen>.txt`, the per-fixture judged text that `tests/android-mapping.test.ts` pins. `tests/golden/android-render.json` holds a single hand-written render, not one per fixture.
3. **The replayed fixtures:** `settings-2-display` and `cmp-3-number-input`. Between them they cover identifiers, values, a placeholder, `focused`, and `selectable: false`. The new golden is `tests/golden/android-capture.json`.
4. **The `DEVICE_BUSY` entry in `cli-exit-codes.json`** (`captureWithForeignAgent`) is computed in-process over the fake `adb` and agent, inside the existing golden test. A subprocess can't get a fake device, and the pinned agent's program exists only on macOS, which CI isn't. `NO_DEVICE`, `INVALID_DEVICE` and `ANDROID_TOOLS_UNAVAILABLE` run through the real CLI.
   - I also added entries for an empty `JEV_ANDROID_DEVICE`, `--json`, `--max-steps`, `--no-log-pane`, and `--jev` on `report`. All exit 3. No existing entry changed.
5. **The output format.**
   - Keys come in this order: `role`, `label`, `value`, `identifier`, `placeholder`, `state` (the element's state object, nested, as Jev's text has it), then `selectable: false`.
   - `frame` and `actions` aren't printed. The Issue doesn't list them, and they are internal to the run.
   - An element with both a label and a placeholder prints both, as the element carries them.
   - An empty screen prints no lines and exits 0.
6. **`--jev` prints the render byte for byte, with no trailing newline.** This follows the release spec's "byte for byte", as the review pointed out.
7. **The command prints only after `close` succeeds**, so exit 0 always means both the screen and the cleanup worked.
   - A cleanup failure is `CLEANUP_FAILED`, as in a run, followed by `close`'s own message, which says whether the lease was kept.
   - When the capture also failed, its reason is printed first, on its own line.
8. **stderr messages:**
   - A `DeviceReasonError` prints `CODE: <its message>`. Every such message is written by the bridge and never quotes `adb` or agent output.
   - Any other error prints `EXECUTION_ERROR: capture stopped on an unexpected error.`, never its own message. A test checks this with a message carrying screen text.
   - `--jev` on a screen with nothing for Jev prints `EMPTY_SCREEN` (or `STATE_BUDGET`) with the vocabulary's description.
   - An interrupt prints nothing.
9. **Device checks before the driver.**
   - `--serial` and `--avd` are each checked against the script's patterns when given. So a bad `--avd` next to a good `--serial` is still `INVALID_DEVICE`.
   - `NO_DEVICE` (with the wording "Pass --serial or --avd, or set JEV_ANDROID_DEVICE") and the `JEV_ANDROID_DEVICE` pattern check both run before the tools check, as `run`'s pre-check does.
10. **The takeover sweep includes the dead holder's logcat streams.** The Issue says "including a dead holder's leftovers". Capture never starts a stream of its own.
11. **The shared test fakes moved.** `FakeAdb`, `fakeAgents`, `fakeClock` and `FakeStreams` moved unchanged from `tests/android-driver.test.ts` to `tests/fixtures/android-device.ts`, so the capture tests and the contract test can use them. Only imports changed in the old file, and no assertion changed.

**Tests added:**
- `tests/android-capture.test.ts`, 18 tests.
  - The driver:
    - the exact `adb` call list, with no restart, stream, `pm path` or screenshot;
    - `close` after capture, with no `am`;
    - a live lease holder;
    - a foreign agent left alone;
    - a crash takeover that sweeps an agent, a forward and a stream;
    - wake and lock;
    - a second capture or `prepare` refused.
  - The CLI path:
    - the golden JSON lines, with no `am`, the agent fenced, the forward removed and the lease released;
    - `--jev` equal to the judged text;
    - device precedence;
    - seven device refusals;
    - `ANDROID_TOOLS_UNAVAILABLE`;
    - `DEVICE_BUSY`;
    - an unexpected error that closes the driver without printing its message;
    - `EMPTY_SCREEN`;
    - `CLEANUP_FAILED`;
    - a capture failure followed by a cleanup that keeps the lease;
    - an interrupt, which closes the driver.
- `tests/contract.test.ts`:
  - the nine new exit-code entries;
  - `--help` lists `capture`;
  - a subprocess check that `NO_DEVICE`, `INVALID_DEVICE` and `ANDROID_TOOLS_UNAVAILABLE` print their code on stderr with no `TYPESAFE_API_KEY`.

**Review** (`/code-review`, fixed point `9d2ff75`):
- **Standards:** 0 hard violations and 6 judgement calls. Fixed in `6d901d3`:
  - the duplicated snapshot literal;
  - a comment on why the device checks run before the driver.

  Kept on purpose:
  - capture's own `EXIT` and `CLEANUP_MS`, because `cli.ts` and `run.ts` can't be imported for them;
  - the per-command option guards in `cli.ts`, which follow the existing style;
  - `takeDevice`'s return shape.
- **Spec:** nothing missing and no scope creep, with 3 points to consider. Fixed in `6d901d3`:
  - `--jev`'s newline;
  - a cleanup failure that hid the capture's reason and "lease kept".

  The third, that the end-to-end test drives `captureCommand` rather than `cli.ts`, is choice 1 above.

**Gate:** `npm run check` passed, 512 of 512 tests, then the build, at `6d901d3` (log: `$TMPDIR/implement-phase6-21-check.log`). No device, adb server or mobilecli was touched. No iOS output or existing golden entry changed.
