# Allowed device effects of a session

Type: prototype
Status: claimed
Claimed by: root (Claude); evidence built by the Codex worker (brief ~/.codex/reports/jev-ios-bridge/phase3-build/P17-device-effects-brief.md); owner decides
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 04

## Question

Today's drivers install nothing and change no device setting. Which device and
host changes made by an Appium session will the owner accept, on which paths,
and with which capability set?

## Required investigation or discussion

Start from the
[side-effect report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/session-device-side-effects/.scratch/appium-phase3/research/session-device-side-effects.md)
(its tables, the minimum-effect capability sets, and "Not yet observed").

On the private pair, record device state before and after a session that uses
those minimum-effect capability sets. The state to record:

- Android: global settings including the hidden-API keys, installed packages
  and their grants, the Doze whitelist, adb forwards, the foreground app and
  activity.
- iOS: Simulator and DeviceHub preference files under the child's `HOME`, the
  in-simulator keyboard defaults, installed apps (WDA), the foreground app.

Also run:

- a second Android session over the already-installed packages
- a session with `skipDeviceInitialization`, `skipServerInstallation`,
  `skipUnlock` and `autoLaunch: false`, with no `appPackage`
- one unclean exit, to see what it leaves behind

Show the owner the diffs. Settle the report's owner choices:

1. Android helper and server packages: does the first session install them,
   or are they provisioned once and skipped after that?
2. Privileges on a physical phone: notification listener, `PROJECT_MEDIA`,
   permission grants, mock location.
3. Hidden-API policy: should `ignoreHiddenApiPolicyError` be set, and who
   restores the keys after an unclean exit?
4. Which `HOME` the iOS child gets, and which hardware-keyboard value.
5. How `isHeadless` is chosen, and whether a simulator restart is ever
   acceptable.
6. `skipLogCapture` on both platforms. The XCUITest driver kills other
   simulator `log stream` processes.

## Completion criterion

The owner locks the allowed-effects list for each path (run, driven, observed,
capture, attach), the pinned capability sets, and the recovery rule for
leftover effects. Write them into the "Operation contract" section of the
Phase 3 specification, and link the diffs as an asset. Any effect that
contradicts a preserved mode is a blocker to report.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Operation contract" and "Mode compatibility"
- [Published spec](../../appium-mcp-migration/spec.md), Decisions 9, 17, 25 and 26
- Today's effects: `src/device/index.ts`, `src/device/android/driver.ts`

## Comments

Graduated on 2026-10-22 from Device side effects of an Appium session (owner
choices 1, 2, 3, 4, 6 and 8 of its report).
