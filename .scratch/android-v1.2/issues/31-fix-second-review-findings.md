# Phase 5: fix the second review's new findings

Status: closed
Closed: Committed on agent/android-v1.2-phase5
Claimed by: coordinator
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 5", user stories 27 to 29, and Issue 26 item 2. A second outside review of PRs #29 to #32 (2026-10-01, run on the heads before Issue 30) repeated two findings Issue 30 had already fixed and found the two below. The owner accepted the triage on 2026-10-01.

## Findings

1. **P2 (reported as P1): a cancel during the takeover sweep lost a leftover stream.** `sweepStreams` owned each dead holder's entry just before killing it. A cancel after the first kill threw before the second entry was owned, so `close` released the lease and the second `adb logcat` kept running, listed nowhere.
   - **The fix:** every `logcat` entry is owned before the first kill. A cancel or crash mid-sweep leaves the rest listed for the next run.
2. **P3: a holder record that couldn't be rewritten stopped `close` from stopping the next stream.** `stopStreams` now keeps going past a failed `disown`, then fails with the first such error. The lease is kept.

## Acceptance

- A failing test first for each: both failed before the fix.
- `npm run check`: 502/502. No golden file changes, and iOS output is unchanged. No device was touched.
