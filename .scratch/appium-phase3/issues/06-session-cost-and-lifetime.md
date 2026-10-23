# Session startup cost and lifetime

Type: prototype
Status: resolved
Claimed by: root (Claude); evidence built by the Codex worker (brief ~/.codex/reports/jev-ios-bridge/phase3-build/P06-session-cost-brief.md); owner decides
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 04

## Question

How long does one owned Appium session take to start on each platform, and
what happens to it during a long idle pause or when the process that created
it exits?

## Required investigation or discussion

On the private pair, one run per check:

- Time from MCP child spawn to session ready, and to the first page source.
  Measure cold (WDA or UiAutomator2 server not yet running) and warm.
- Leave a session idle for typical driven hand-back pauses, about 1, 5 and
  15 minutes, then act. Record what `newCommandTimeout`, the WDA and
  UiAutomator2 servers, and the device itself do in the meantime.
- What survives when the creating process exits normally (the observed
  prepare, park, then action handover).
- Today's per-run startup on the same devices, for comparison.

Added from Device side effects of an Appium session:

- Idle for longer than 300 s: `newCommandTimeout` looks inert under
  appium-mcp, which never calls `executeCommand`.
- Whether the MCP child exits once stdin ends.
- What `APPIUM_MCP_ON_CLIENT_DISCONNECT=delete_all` does when stdin is closed
  and when the bridge is killed.

Added from iOS app output and crash detection (ticket 12): on iOS, launch the
diagnostic app natively with `simctl launch --console-pty` and launch
arguments, then create the Appium session with `autoLaunch: false` and no
relaunch. Show that the session observes and acts on that same app instance (the
console PID is unchanged, and the console still streams). Show what deleting the
session does to it. If this fails, the owner revisits ticket 12.

Automation timing is not app performance. Label these numbers as session cost.

## Completion criterion

The owner reacts to the numbers. The result is the evidence that Session
lifetime decides from. Link the measurements as an
asset.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Mode compatibility"
- Phase 1 budgets in the [freeze manifest](../../appium-mcp-migration/evidence/phase1-freeze-20261018.json) (`startupMs`, `wdaLaunchMs`)

## Comments

Charted on 2026-10-22.
Resolved on 2026-10-23: the evidence is in. The owner reacts to the numbers in Session lifetime (10), which decides from them.

## Answer

Prototype `prototype/session-cost` at `a72466168`. The evidence is in
`~/.codex/reports/jev-ios-bridge/phase3-build/P06-evidence/`. The private pair was
used, and every number below is session cost, not app performance.

| | Cold: ready / first source | Warm: ready / first source |
| --- | --- | --- |
| iOS | 77.8 / 78.5 s (n=1) | WDA running: 5.83 / 5.92 s medians (n=3; ready 5.63–6.34 s) |
| Android | 12.4 / 13.4 s (n=1) | cached restart: 6.80 / 6.99 s medians (n=3; ready 5.51–7.75 s) |

Today's committed preparation figures are about 2.0–2.4 s (n=1 each, other
devices). That comparison is inconclusive, but an Appium session costs several
seconds even when warm.

- **Idle.** After 60, 310 and 900 s, both platforms resumed and accepted taps.
  Both drivers report `newCommandTimeout` 300000 ms with no active timer, so it is
  inert under appium-mcp.
- **Exit.** On a normal parent exit with `skip`, the child and session stay.
  With `APPIUM_MCP_ON_CLIENT_DISCONNECT=delete_all`, both stdin EOF and killing
  the creating parent delete the sessions and end the child, on both platforms.
  Killing the MCP child directly leaves native components with no disconnect
  receipt.
- **Leftover forward.** On Android, a retained `tcp:18200 → tcp:6790` forward
  blocked the next session create. Fencing (11) must clear owned forwards.
- **iOS native-launch attach (ticket 12).** Attach works. Appium observed and
  tapped the app that `simctl launch --console-pty` started. The app PID and the
  console PID were unchanged, and the console survived session deletion and
  ended when the device shut down. `print()` streaming is unproven, because the
  frozen app never prints. The fixture-app build (PFX brief) proves it.
- **Not proved.**
  - Android warm start with the server already running.
  - The final Android action handover. A retry hit "System UI not
    responding", which reached the retry limit.
- **Host gate.** One full `npm run check` during the run was red (4 failures
  and 9 cancelled, all in observed tests that did not change). The four files
  passed 268 of 268 when run alone. They are logged in FOLLOW-UPS as
  load-sensitive.
