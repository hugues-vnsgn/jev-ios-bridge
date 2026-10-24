# iOS app output and crash detection without MobileBuildMCP

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 03

## Question

Once MobileBuildMCP's console helper is gone, which bounded, read-only native
helper supplies iOS app prints, platform output and `APP_EXITED` attribution?
And how does it start relative to an Appium launch, so that launch arguments,
app filtering, value masking, late-event attribution, unavailable-versus-empty
status and expected-shutdown suppression keep their meaning?

## Required investigation or discussion

Start from the vendor inventory's account of today's console helper, the log
pane, headless `logs` and step tails. Weigh these options:

- a native launch that also streams the console, alongside Appium-owned
  observation and input
- a `log stream` observer plus an Appium launch and an app-state watch
- another bounded helper

Keep the helper within ADR-0010's native-helper boundary: read-only, owned,
bounded, and never a UI fallback. Compare Android, which keeps logcat and
exit-watch.

## Completion criterion

The owner locks the helper and its lifecycle. Write them into the "Diagnostics
and allowed native helpers" section of the Phase 3 specification, along with
what remains a Phase 4 live claim.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Diagnostics and allowed native helpers"
- `src/device/index.ts:563` (console helper), `src/device/logs.ts`, `src/logpane`
- ADR-0010, [Published spec](../../appium-mcp-migration/spec.md), Decision 16, Testing Decision 12

## Comments

Charted on 2026-10-22.
Resolved on 2026-10-23 by the owner in a grilling session with the root.

## Answer

Native launch with a console: the first option. The bridge runs
`simctl launch --console-pty` with the launch arguments and owns the console
process. That keeps `print()` output in the log pane, `logs` and step tails, and
keeps `APP_EXITED` as the console process's exit, with the PID recorded at launch
instead of parsed from a file name. A `log stream` filtered to the app supplies OS
logs. Appium handles observation and input only and never relaunches the app
(`autoLaunch: false`). Expected stops are marked first, and a lost source reads
unavailable and unknown, never empty or healthy. Recorded in
[ADR-0014](../../../docs/adr/0014-native-launch-and-preparation-steps-beside-appium.md)
and under "Locked native steps" in the Phase 3 specification.

The second option was rejected because Appium's launch gives no stdout, so
`print()` output would be lost and `queryAppState` is not causal.

- **Unproven, for the session prototype (06).** An Appium iOS session that
  observes and acts on an app the bridge launched natively, without
  relaunching it.
- **Phase 4 live claims.** Prints, OS logs and crash attribution on a real run.

Proved on 2026-10-23 by the fixture-app build (PFX, `prototype/fixture-apps` at
`556731ebd`). Three `FIXTURE_EVENT` lines from Appium taps arrived on the
`simctl launch --console-pty` console while the session was attached. The
console PID (19936) was unchanged. Native launch with an attached Appium
session is proved; crash attribution remains a Phase 4 live claim.
