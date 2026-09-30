# Phase 3: choosing the Android device, the entry points, and refusing Android until phase 4

Status: claimed
Claimed by: implementer-06
Blocked by: 03, 04

Spec: [../spec.md](../spec.md), "Phase 3". The work is [the release spec's phase 3](../../android-support/release-spec.md#phase-3-contract-additions-how-a-script-names-an-android-app-and-device-what-jev-sees-on-android-decisions-1-to-2-actions-across-android-versions-items-2-to-4-log-pane-and-app-exit-detection-item-6-where-android-plugs-into-the-code-items-4-8-and-9) items 2, 6 and 7, with their part of item 8, and [open point 20](../../android-support/release-spec.md#open-points-for-the-executor). Read them in full. The detail below only adds acceptance criteria.

## What to build

1. **Device choice** (item 2): split today's `selectDeviceId` (`src/device/index.ts`) by platform. iOS is unchanged. Android takes the script's `device.serial` or `device.avd`, then `JEV_ANDROID_DEVICE` (a serial or an AVD name; empty counts as unset), then fails with `NO_DEVICE`. No config file, no "any device" shortcut. An Android run never needs `JEV_DEVICE_UDID`, and an iOS run never needs `JEV_ANDROID_DEVICE`. `JEV_ANDROID_DEVICE` must match one of open point 20's patterns, otherwise `INVALID_DEVICE`; whether a valid value is a serial or an AVD name is decided in phase 4, where `adb devices` is read, so keep that decision out of this Issue.
2. **The CLI's pre-run check** (`src/cli.ts`): an Android script with no device, or a malformed `JEV_ANDROID_DEVICE`, exits 3, and `INVALID_DEVICE`'s message names the Android patterns. iOS messages and exit codes stay byte-identical.
3. **Entry points** (item 6): the MCP `start_scenario` description says "an explicit iOS or Android action script". The CLI help names `JEV_ANDROID_DEVICE`. The server name stays `jev-ios-bridge`.
4. **Refuse Android until phase 4** (item 7): the driver factory (`src/device/factory.ts`) refuses an Android script with a clear "Android isn't available in this build" start error, so an Android script never reaches the iOS driver. Test it through the factory and through `BridgeService`.
5. **Golden** (item 8): `cli-exit-codes.json` gains an Android script with no device (3) and a malformed `JEV_ANDROID_DEVICE` (3). The test's environment helper in `tests/contract.test.ts` also deletes `JEV_ANDROID_DEVICE`, so the result doesn't depend on the shell.

## Acceptance

- Every existing `cli-exit-codes.json` entry and every iOS message stays byte-identical.
- No existing test changes except the environment helper's added `delete`.
- `npm run check` passes.
- No device, simulator or emulator is touched.

## Comments
