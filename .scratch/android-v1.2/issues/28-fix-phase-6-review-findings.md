# Phase 6: fix the whole-branch review findings

Status: claimed
Claimed by: claude-issue-28
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

## Comments

### 2026-09-30, claude-issue-28: built

**What I built:**
1. **Capture keeps the lease for `close` once the agent start was issued.** A new driver helper, `releaseIfNothingToUndo`, releases the lease after a failed start only when `restartedPackage === undefined && !agentStartIssued`. Both `prepareIssued` and `captureIssued` call it. `close` then fences the agent and releases the lease.
2. **An interrupt after the snapshot prints nothing.** `captureCommand` returns 3 before writing stdout when the signal was aborted, with empty stderr, the same as an interrupt mid-capture.
3. **The skill's `app.package` note links guide `reference/script-format.md`.** I chose it over `12-android-setup.md`, which doesn't exist until phase 7.
4. **`selectAndroidDeviceName` owns the device choice and its message.** It takes an optional `noDevice` message, which defaults to `run`'s current text, so `run`'s output is unchanged. `capture` passes its own text, "Pass --serial or --avd, or set JEV_ANDROID_DEVICE", and its separate NO_DEVICE check is gone. The check order (`--serial`/`--avd` shape, then NO_DEVICE, then the JEV_ANDROID_DEVICE shape), the stderr text and the exit codes are unchanged.
5. **Shared constants:**
   - `EXIT` moved from `cli.ts` to a new `src/exit-codes.ts`, with the same values. `capture` uses `EXIT.passed` and `EXIT.couldNotStart`.
   - The cleanup limit is `DEFAULT_CLEANUP_MS`, exported from `src/scripted/run.ts`, which uses it as its default. `capture` imports it.
6. **One release guard:** the helper from 1. It is a single condition, not a per-path mode. In `prepare`, the restart always comes before the agent start, so the added `!agentStartIssued` never changes `prepare`'s behaviour. In `capture`, `restartedPackage` is always undefined, so the condition reduces to "before the agent start".

**Choices the Issue left open:**
- For 4, I used a parameter instead of a wrapper. It keeps one function owning both the choice and the message. `capture` still calls it only as a pre-driver check, as `run` does in `cli.ts`, because the driver resolves the name itself.
- For 5, `cli.ts` runs on import, so the exit codes needed their own module. The cleanup limit stays in `run.ts`, next to the run's other defaults.

**Deviations:** none.

**Tests added** (`tests/android-capture.test.ts`), each failing before its fix:
- the capture is interrupted just after the agent start command. The lease is kept, `close` kills agent 7001, no agent or forward is left, and the lease is released;
- the capture's `adb forward` fails on all three ports. The same assertions apply;
- the CLI is interrupted during `close`, after the snapshot was taken. It exits 3 with empty stdout and stderr, and the cleanup still completes.

No existing test changed, and no golden file changed.

**Review:** `/code-review` against `d1c4a7b`:
- **Spec:** 0 findings.
- **Standards:** 0 hard violations and 4 judgement calls. I applied two in `ef1627e`: a comment on what capture's exit codes mean, and no caller named in `DEFAULT_CLEANUP_MS`'s doc. I left two:
  - the `noDevice` string parameter, which finding 4 allows;
  - importing the cleanup limit from `run.ts`, because capture is already in the same CLI bundle.

**Gate:** `npm run check` passed, 522 of 522 tests, then the build, at `ef1627e` (log: `$TMPDIR/implement-phase6-28-check.log`). No device, adb server or mobilecli was touched.
