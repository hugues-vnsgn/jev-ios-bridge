---
status: accepted
date: 2026-10-02
---

# Simulator presentation and a bounded iOS point-tap exception

[ADR-0002](0002-mobilebuildmcp-as-device-layer.md) says the bridge drives an iOS simulator only through pinned MobileBuildMCP, with no direct `simctl`, AXe or other device automation. Version 1.3 needs two things MobileBuildMCP 2.7.1 can't do. They aren't the same kind of thing, so this record treats them separately. Showing the simulator's window is presentation and never changes the app's screen. Claude's point tap changes the app's screen, and it's the only device automation the bridge may run outside MobileBuildMCP. Both stay behind the existing `MobileBuildMcpDriver`: the window in `prepare`, the tap in `act`.

```
MobileBuildMcpDriver
├── prepare
│   └── deviceWindow → open Simulator      optional presentation
└── act
    ├── ordinary actions → MobileBuildMCP
    └── Claude's tapAt → bundled AXe       the one automation exception
```

## Presentation: the simulator window

During `prepare` the driver runs `open -a Simulator --args -CurrentDeviceUDID <udid>` so a person can watch the run (live-test finding, 2026-10-01). MobileBuildMCP's `simulator open` takes no device ID.

- **Booted first.** Opening Simulator on a device that isn't running boots it, so the driver reads the device's state through MobileBuildMCP first. It opens the window only when the run's simulator is already booted, and fails the run as not booted otherwise, exactly as it would without a window. If the state can't be read, it skips the window with a warning.
- **Never fatal.** If `open` fails or takes more than 10 seconds, the run gets a warning and carries on.
- **Optional.** On by default; `--no-device-window` or `JEV_DEVICE_WINDOW=off` turns it off.

The window doesn't touch the app's screen, so it isn't an action, isn't in the device lease's command ledger, and needs no hand-back rules.

## Automation: Claude's `tapAt` through bundled AXe

Some screens have nothing MobileBuildMCP can tap, because every tap it offers needs an element reference: a system photo picker, a row swipe target, the area outside a popover. In driven mode Claude may answer a hand-back with `{ "kind": "tapAt", "x", "y" }`. On iOS the driver will carry that out with the AXe binary that the pinned MobileBuildMCP bundles, running only `axe tap -x -y` with the environment MobileBuildMCP itself sets (`DYLD_FRAMEWORK_PATH`). This record authorizes that path. It isn't built in 1.3: iOS stays out of `TAP_AT_PLATFORMS` until the evidence below exists.

Jev never chooses coordinates. Only Claude's `resolve_step` answer reaches this path, and it's logged like any other action, with `decidedBy: "claude"`.

**Coordinates.** `x` and `y` are whole pixels of the paused screenshot, the file the hand-back names. Its size comes from the file's header (MobileBuildMCP shrinks screenshots to at most 800 pixels on the longest side). The bridge rejects an answer outside `0…width-1`, `0…height-1` before anything runs. The driver scales the point to iOS screen points using the screen size from the same snapshot. It refuses the tap (`UNSUPPORTED_ACTION`, nothing sent) when the screenshot or screen size is unknown, or when the two shapes don't match, which means the device rotated between the screenshot and the screen read.

**The screen is checked again before the tap.** A pause can last minutes, and a driver can't always tell that its capture went stale (Android's can't). So after every hand-back the bridge captures the screen again before it carries out Claude's answer. If the screen changed, nothing is sent: the bridge hands back `SCREEN_CHANGED` with the fresh screenshot, and Claude answers for that screen. On the same screen, the answer is carried out on the new capture: an element found again, a point as given. If even the new capture turns out stale, the bridge hands back `SCREEN_CHANGED` again; a point is never retried or moved. This holds on every platform and for every answer.

**Completion and cleanup.** The driver owns the AXe process from start to exit:

- it's started through the run's device lease and entered in the lease's command ledger before it starts, like every MobileBuildMCP action;
- it runs under the action's deadline and the run's cancellation signal; on either, the driver stops it and waits for it to exit;
- the ledger entry closes only when the process has exited. A non-zero exit is `AXE_FAILED`, reported without AXe's own output;
- if the driver can't confirm the process has exited (it timed out, couldn't be stopped, or its exit wasn't seen), the outcome is unknown. The tap is reported as `UI_ACTION_UNCONFIRMED` and the lease is kept, so no other run takes the device, until the process can no longer act.

**Evidence before iOS is switched on.** Adding `ios` to `TAP_AT_PLATFORMS` needs tests and one real simulator run that show:

1. scaling: a point on an 800-pixel screenshot lands on the matching screen point, on at least two device sizes;
2. a stale screenshot hands back `SCREEN_CHANGED` and sends no tap;
3. a rotated or unknown-size screenshot is refused without a tap;
4. cancellation and the deadline stop AXe and wait for its exit, and an unconfirmed exit keeps the lease;
5. a real tap on a control with no accessibility element (for instance, outside a popover to dismiss it) changes the screen as expected.

## What ADR-0002 now says

ADR-0002's statements that the bridge has "no direct `simctl`, AXe or other device automation" and "contains no simulator or UI automation code" now carry two exceptions: the Simulator window (presentation) and Claude's iOS `tapAt` through bundled AXe (automation, once the evidence above exists). Everything else stays as ADR-0002 says: reading the screen, element taps, typing, swipes, launching the app and screenshots go through MobileBuildMCP.

iOS `"start": "attach"` was built with direct `xcrun simctl` and `log stream` calls and was removed instead of excepted: MobileBuildMCP can't tell which app is in front, and attach must refuse unless the app under test is.

## Consequences

- Each exception is retired on its own. If MobileBuildMCP adds a per-device window command, the bridge moves the window to it; if it adds a tap at a point, the bridge moves `tapAt` to it. Each move updates this record, and the record is superseded when both are gone.
- Upgrading MobileBuildMCP means rechecking both calls, and the AXe path and arguments in particular.
- Until iOS `tapAt` ships, Claude's hand-back answers on iOS don't list `tapAt`; a screen with nothing to tap ends in `revise` or `stop`.
