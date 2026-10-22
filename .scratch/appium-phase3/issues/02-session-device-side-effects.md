# Device side effects of an Appium session

Type: research
Status: open
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
leave the app as it is. This feeds Session lifetime and allowed device effects.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Operation contract" and "Mode compatibility"
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md), "Android `start=attach` and key-free capture"
- [Published spec](../../appium-mcp-migration/spec.md), Decisions 9, 17, 25 and 26

## Comments

Charted on 2026-10-22.
