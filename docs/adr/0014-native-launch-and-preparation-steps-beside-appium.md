---
status: accepted
date: 2026-10-23
implementation: in-progress
---

# Native launch and preparation steps beside Appium

Three device steps that are not UI observation or input stay native, beside Appium. On iOS the bridge launches the app itself with `simctl launch --console-pty` and the script's launch arguments, and owns that console process: it is the only source of the app's `print()` output, and its exit is the iOS `APP_EXITED` signal, with its PID known directly instead of parsed from a vendor file name. A read-only `log stream` filtered to the app supplies OS logs. Observed preparation on iOS boots the simulator and installs the app with bounded, owned `simctl boot` and `simctl install`, next to ADR-0009's creation. On Android the adb wake keyevent and the read-only launcher, foreground and keyguard probes stay native. Appium sessions always set `skipUnlock`, so a locked screen still refuses with `DEVICE_LOCKED` instead of being unlocked.

An Appium launch gives no stdout, so it would drop the app's prints from the log pane, `logs` and step tails, and Appium's app state does not say why an app stopped. Appium has no boot step before a session. Its unlock would change a refusal into an action on the user's device. Android's force-stop and start do touch the app, so they move to Appium (`mobile: startActivity` with stop and wait), and the exit watch keeps marking that stop as expected.

This amends [ADR-0010](0010-appium-mcp-as-the-shared-device-layer.md)'s helper list and moves the boot and install that [ADR-0009](0009-bounded-simulator-creation.md) left with the pinned provider to these helpers. No helper reads the UI tree or injects input; every one runs under ownership, deadlines and the driver lifecycle. Ordinary runs keep their preconditions: a booted device with the app installed. One part is unproven: an Appium session observing an iOS app that the bridge launched, without relaunching it. The Phase 3 prototypes check it. The [Phase 3 specification](../../.scratch/appium-mcp-migration/phases/phase-3-adapter.md#diagnostics-and-allowed-native-helpers) holds the details.
