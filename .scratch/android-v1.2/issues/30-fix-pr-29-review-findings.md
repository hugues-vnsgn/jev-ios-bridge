# Phase 5: fix the PR #29 review findings

Status: closed
Closed: Committed on agent/android-v1.2-phase5
Claimed by: coordinator
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 5", and Issues 18 to 20 and 26 with their comments. An outside review of PR #29 (`b4ede43...902f3e7`, 2026-10-01) found the items below. The owner accepted the triage and the fixes on 2026-10-01.

## Findings

1. **P2 (reported as P1): a crash or freeze whose event arrives just after a step failed is missed.** `run.ts` asked `appProblem()` once, synchronously, so the run kept the step's own reason, for example `GUARD_MISSING`. The verdict was inconclusive either way; only the reason code was wrong.
   - **The fix:** a new optional `DeviceDriver.appProblemAfterFailure(signal)`. The Android driver polls its watch every 50 ms for up to 1 s (`APP_PROBLEM_WAIT_MS`), stopping at once when it finds a problem, when the driver can't tell, or on a cancel. The run asks it once after a failed step, and a failed wait never hides the step's own error. The iOS driver doesn't implement it, so iOS is unchanged.
   - **The known limit:** Android reports a freeze only after about 5 s, so a step that fails sooner keeps its own reason. Waiting 5 s on every failed step was judged too costly.
2. **P2: a failed fence or app stop left both `logcat` streams running.** `close` now stops the streams before rethrowing. The lease is still kept, and the order on success is unchanged.
3. **P3: the takeover sweep took any `adb` command line containing `logcat`.** `isLeftover` now needs exactly `-s <serial> logcat`, the shape the bridge starts.
4. **P3: the sweep's SIGKILL didn't recheck the pid.** `kill` reads the command line first, and sends SIGKILL only if the pid still names that process after the 1 s grace period.
5. **P3: the pane's cause note wasn't masked.** It now goes through the same masker as every line.
6. **No change: the reviewer read the `withDriver` setup edit as breaking the "existing tests" rule.** The owner's 2026-09-30 ruling defines existing tests as those at `819ea10`. That setup is phase 4's, so it may change with its contract. Finding 2's tests cover the gap the reviewer pointed at.

## Acceptance

- One failing test first for each of 1 to 5. All 9 new or changed tests failed with the fixes removed.
- `npm run check`: 500/500, none skipped. No golden file changes, and iOS output is unchanged. No device was touched.
