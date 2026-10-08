# Reason codes

Every verdict and error event carries one of these codes, in `reason` and `error.code` in [`report.json`](report-json.md). The list is owned by the bridge and frozen for 1.x: releases may add codes but never rename or remove one, or change its meaning. A MobileBuildMCP error whose code isn't one of the bridge's codes shipped through 1.1 becomes `DEVICE_ERROR`, and MobileBuildMCP's own code is kept in `error.vendorCode`; this keeps a later Android-only addition from silently changing an iOS error's reason. On Android, an `adb` or device agent failure the bridge has no code for is `DEVICE_ERROR` too, with `vendorCode` `adb` or `agent`.

What to do about each: [troubleshooting](../08-troubleshooting.md).

## Outcomes

| Code | Meaning |
| --- | --- |
| `ALL_CHECKPOINTS_PASSED` | Every step ran and every checkpoint claim was established. |
| `ASSERTION_FALSE` | A checkpoint claim was confidently false (probability at or below 0.1). |
| `ASSERTION_UNCERTAIN` | A checkpoint claim was neither established nor rejected (between 0.1 and 0.9). |

## Script and screen

| Code | Meaning |
| --- | --- |
| `GUARD_MISSING` | A guard required an element that was not visible. |
| `GUARD_AMBIGUOUS` | A guard selector matched more than one visible element. |
| `GUARD_FORBIDDEN` | A guard forbade an element that was visible. |
| `TARGET_MISSING` | No element matched the action selector. |
| `TARGET_UNAVAILABLE` | The action target was hidden, disabled, or does not support the action. |
| `TARGET_AMBIGUOUS` | The action selector matched more than one usable element. |
| `INVALID_SELECTOR` | A selector had no usable field. |
| `SNAPSHOT_TRUNCATED` | The device capture was truncated, so selection was refused. |
| `SCREEN_CHANGED` | The screen changed while refreshing a stale target. |
| `WAIT_TIMEOUT` | A wait step did not see its until-guard in time. |
| `SCRIPT_INCOMPLETE` | The script ended without completing every step. |

## Limits and control

| Code | Meaning |
| --- | --- |
| `STEP_LIMIT` | The run reached its step limit. |
| `WALL_LIMIT` | The run reached its wall-time limit. |
| `CANCELLED` | The run was cancelled. |

## Checkpoint screen

| Code | Meaning |
| --- | --- |
| `TRUNCATED` | The checkpoint capture was truncated, so no judgment was requested. |
| `EMPTY_SCREEN` | The checkpoint screen had no visible evidence to judge. |
| `STATE_BUDGET` | The checkpoint screen text exceeded the judgment size budget. |

## Jev judgment

| Code | Meaning |
| --- | --- |
| `INVALID_INPUT` | The judgment request was invalid. |
| `REQUEST_BUDGET` | The judgment request exceeded its size budget. |
| `MALFORMED_RESPONSE` | Jev returned a response the bridge could not accept. |
| `INVALID_JUDGMENT` | A judgment failed the bridge's consistency checks. |
| `ABORTED` | The judgment request was aborted. |
| `TIMEOUT` | The judgment request timed out. |
| `AUTH` | TypeSafe rejected or lacks the API key. |
| `RATE_LIMIT` | TypeSafe rate-limited the judgment request. |
| `SERVICE` | TypeSafe returned a service error. |
| `NETWORK` | The judgment request could not reach TypeSafe. |
| `UNKNOWN` | The judgment request failed for an unclassified reason. |

## Device and app

| Code | Meaning |
| --- | --- |
| `NO_DEVICE` | No device was configured for the script's platform. |
| `INVALID_DEVICE` | The configured device does not have the shape the script's platform requires. |
| `DEVICE_BUSY` | The device is in use, by another run or by another tool's UI-automation agent (a foreign agent). |
| `DEVICE_ERROR` | The device layer reported an error; its own code is kept as vendorCode. |
| `INVALID_JSON` | The device layer returned output that was not JSON. |
| `INVALID_ENVELOPE` | The device layer returned an unsupported result envelope. |
| `TERMINAL_ACK_MISSING` | The device layer did not return the expected result. |
| `INVALID_CAPTURE` | The device layer returned no runtime snapshot. |
| `EMPTY_CAPTURE` | The device layer returned no usable elements. |
| `UNSUPPORTED_ACTION` | The target does not support the requested action. |
| `MISSING_VALUE` | A typing step named a value the script did not supply, or a value's environment variable is not set. |
| `UNSUPPORTED_LEADING_DASH_TEXT` | The pinned device layer cannot type text that starts with a hyphen. |
| `UI_ACTION_UNCONFIRMED` | A device operation was never acknowledged, so the device lock was kept. |
| `CLEANUP_FAILED` | Device cleanup did not finish. |
| `APP_EXITED` | The app under test exited during the run (a crash or a quit); check its crash report. |

## Device and app (Android)

| Code | Meaning |
| --- | --- |
| `DEVICE_NOT_CONNECTED` | The named serial isn't listed by adb or is offline, or no running emulator has the named AVD. |
| `DEVICE_AMBIGUOUS` | More than one running emulator has the named AVD, so the bridge can't tell them apart. |
| `DEVICE_UNAUTHORIZED` | The device hasn't accepted this Mac's USB-debugging key. |
| `DEVICE_NOT_BOOTED` | The device hasn't finished booting, or the iOS simulator isn't booted. |
| `DEVICE_LOCKED` | The device's screen is locked. |
| `APP_NOT_INSTALLED` | The app's package isn't installed on the device. |
| `APP_NOT_RESPONDING` | The app froze (Android showed "App isn't responding") during the run. |
| `DEVICE_UNSUPPORTED` | The device is below Android 12 (API 31), which this bridge does not support. |
| `ANDROID_TOOLS_UNAVAILABLE` | adb could not be found, the pinned mobilecli package is missing, or the device agent copied out of it does not match the pinned SHA-256. |

## Driven mode (experimental)

| Code | Meaning |
| --- | --- |
| `DRIVEN_NOT_ENABLED` | The script has a do step, but driven mode isn't turned on: it needs "drivenMode": true in .jev/config.json and JEV_EXPERIMENTAL_DRIVEN set to 1 or true. |
| `HANDBACK_TIMEOUT` | A do step waited longer than the hand-back timeout for Claude's answer. |
| `STOPPED_BY_CLAUDE` | Claude answered a do step's hand-back with stop. |
| `STEP_NOT_DONE` | A do step ended without evidence that it was done: after its Jev decisions and Claude's answer, the screen still didn't show it done. |
| `LOCAL_ONLY_CHECKPOINT` | A driven run's checkpoint was on a screen that matches a localOnlyScreens rule, so it was not sent to Jev and could not be judged. |

## Start mode attach

| Code | Meaning |
| --- | --- |
| `APP_NOT_IN_FOREGROUND` | Start mode attach: another app, or none, is in front on the Android device. |
| `APP_NOT_RUNNING` | Start mode attach: the app isn't running on the iOS simulator. |

`APP_NOT_RUNNING` isn't used for now: iOS refuses start mode attach with `UNSUPPORTED_ACTION` before the simulator is touched, because the bridge can't tell which app is in front there.

A `do` step that goes back to Claude records a hand-back reason, such as `NONE_FITS` or `LOW_CONFIDENCE`. Those aren't verdict reasons; [driven steps](../13-driven-steps.md#why-a-step-was-handed-back) lists them.

## Bridge

| Code | Meaning |
| --- | --- |
| `EXECUTION_ERROR` | The run stopped on an unexpected execution error. |
| `INTERNAL_ERROR` | The bridge could not complete the run; check local setup. |
| `INTERRUPTED` | The run log has no verdict: the bridge process stopped before recording one. |
