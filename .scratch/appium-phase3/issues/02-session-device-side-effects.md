# Device side effects of an Appium session

Type: research
Status: resolved
Labels: wayfinder:research
Mode: AFK
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: none

## Question

What do the pinned XCUITest and UiAutomator2 drivers change on a simulator,
emulator or phone when the bridge creates, uses and deletes a session, and
which capability or setting turns off each change?

## Required investigation or discussion

- Android: server and settings APK installs, permission grants, hidden-API
  policy, animation scales, IME or Unicode keyboard switching, device
  initialization (`skipDeviceInitialization`, `skipServerInstallation`,
  `disableWindowAnimation`), app launch and stop flags (`autoLaunch`,
  `noReset`, `dontStopAppOnReset`, `shouldTerminateApp`, `forceAppLaunch`),
  port forwards left behind, and what session deletion does.
- iOS: WDA install and launch, simulator preference writes (hardware keyboard,
  pasteboard sync, reduce motion, alerts), app launch and terminate flags,
  any simulator restart, and what session deletion does.
- appium-mcp's own defaults: `create-session.ts` merging of
  `CAPABILITIES_CONFIG`, relaxed security, and deleting sessions on
  disconnect.
- Cross-check what actually happened in Phase 1 (capabilities sent, vendor
  logs in the attempt directories under
  `.scratch/appium-mcp-migration/evidence/live-protocol/`).
- Compare with today's device effects (MobileBuildMCP launch, mobilecli's
  device agent install) so every new effect is visible.

Sources: pinned driver and appium-mcp source and docs, Phase 1 evidence. Reading
only: no device run.

## Completion criterion

A table of effect, when it happens, the controlling capability, whether
Phase 1 observed it, and whether it can be turned off. Flag every effect that
cannot be turned off, especially for Android capture and attach, which must
leave the app as it is. This feeds Session lifetime.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Operation contract" and "Mode compatibility"
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md), "Android `start=attach` and key-free capture"
- [Published spec](../../appium-mcp-migration/spec.md), Decisions 9, 17, 25 and 26

## Comments

Charted on 2026-10-22.

## Answer

Research resolution, 2026-10-22: a session on the pinned stack changes the
device far more than today's drivers, which install nothing and change no
setting.

- **Android.** Creating a session:
  - relaxes the device-global hidden-API policy
  - installs the Settings helper with all its permissions, notification-listener
    access and a `PROJECT_MEDIA` appop
  - installs two server packages
  - adds them to the Doze whitelist
  - forwards one or two ports
  - starts an instrumentation and logcat

  Unless `skipDeviceInitialization` is set, it also launches the helper in
  front of the current app and never brings the app back. Deleting the session
  removes the forwards, force-stops the server packages and deletes the
  hidden-API keys. The installed packages and grants stay.
- **iOS.** Creating a session:
  - always writes Simulator and DeviceHub preferences under the child's `HOME`
  - can restart the simulator or quit the UI client, depending on `isHeadless`
  - wipes app data unless `noReset: true`
  - reinstalls and launches WDA, and sets keyboard defaults
- **Leftovers.** In Phase 1, unclean exits left Android forwards and the WDA
  runner behind.

Four effects cannot be turned off:

- the Android hidden-API change
- the Android instrumentation
- the Android system-port forward
- package installs, unless the packages are provisioned beforehand

None of them touches the app or the foreground. Capture and attach stay safe
with `skipDeviceInitialization`, no `appPackage`, `noReset: true` and
`skipUnlock`. None of this has been run yet.

Side findings:

- appium-mcp passes capabilities straight to the driver, so no
  `appium:settings[...]` capability is ever applied.
- appium-mcp drops any capability whose value is `''`. Page-source settings
  must therefore be applied after the session is created.
- appium-mcp turns on relaxed security, which enables `adb_shell`,
  `shutdown_other_sims` and similar features. The bridge must refuse them.

[Sourced report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/session-device-side-effects/.scratch/appium-phase3/research/session-device-side-effects.md),
branch `research/session-device-side-effects` at `3c69d2931`. No device run.

Map changes from this answer:

- Owner choices 1, 2, 3, 4, 6 and 8 became the new prototype Allowed device
  effects of a session.
- Choices 5 (WDA ownership) and 7 (disconnect policy) moved into Session
  lifetime. That ticket was narrowed from "Session lifetime and allowed device
  effects".
- The settings and relaxed-security findings widen Observation mapping and
  Extension contract.
