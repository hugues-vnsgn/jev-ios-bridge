# Phase 6: fix the whole-branch review findings

Status: ready-for-agent
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 6", and Issues 21 and 22 with their comments. A two-axis `/code-review` of phase 6 (`agent/android-v1.2-phase5...agent/android-v1.2-phase6`) found the items below. Fix each, test first, and keep every other behaviour as it is.

## Spec findings

1. **P1: a capture that fails after starting the agent can leave the bridge's agent running.**
   - **Where:** `captureIssued`'s catch (`src/device/android/driver.ts`) runs `if (this.lease.releasable) await this.lease.release()` whatever step failed. `prepare` only releases before the restart, and the restart always comes before `startAgent`; capture has no restart.
   - **The failure:**
     1. The agent start command succeeds.
     2. A SIGINT, or an `adb forward` failure, comes before the forward is owned.
     3. Nothing is owned, so the lease is released.
     4. `close` sees the lease not held and returns without the fence.
     5. The bridge's agent stays on the device.
   - **The fix:** release in that catch only when the agent start was never issued (`!this.agentStartIssued`). Otherwise leave it to `close`, which fences.
   - **Tests:** an abort just after the start command, and a failing `adb forward`. In both, `close` fences the agent and releases the lease, and no agent is left.
2. **P3: an interrupt after the snapshot still prints the screen.** If the signal is aborted once `driver.capture` returns, print nothing (Issue 21's choice: "An interrupt prints nothing"). Pin it with a test.
3. **P3: the skill's `app.package` note has no guide link.** Link it to `reference/script-format.md` or `12-android-setup.md`, as the other notes are.

## Standards findings, judgement calls

4. **Device choice in one place:** `captureCommand` has its own `NO_DEVICE` check and calls `selectAndroidDeviceName` only for its side effect. Let `selectAndroidDeviceName` (or a small wrapper around it) own the choice and the message, keeping `capture`'s current stderr text and exit codes.
5. **Shared constants:**
   - capture's `CLEANUP_MS = 45_000` copies `scripted/run.ts`'s cleanup limit;
   - capture's `EXIT` table copies the CLI's exit codes.

   Share each from one place.
6. **The release guard:** `prepareIssued` and `captureIssued` each repeat the catch-and-release block. After fix 1, give both one helper that says when a failed start may release: before the restart for `prepare`, and before the agent start for `capture`.

## Recorded, no change

- **`run … --serial x` now prints "--serial, --avd and --jev apply only to capture"** instead of `parseArgs`'s unknown-option error. It happens only on an invalid invocation, and the exit code stays 3, so the coordinator accepts it (CLI usage errors aren't in a golden file).
- **`simulator_udid` changed from required to optional** in `plugin.json`. This is phase 6 item 4 as written. The CHANGELOG notes it (Issue 24).

## Acceptance

- A failing test first for 1 and 2, then the fix.
- No golden file changes, and iOS output is unchanged.
- `npm run check` passes. No device is touched.
