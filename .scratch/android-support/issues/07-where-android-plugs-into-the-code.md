# Where Android plugs into the code

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 03

## Question

How does Android enter the codebase without disturbing the iOS path?

- **Driver choice:** where the platform picks the device driver (`BridgeService.createDriver`, `src/cli.ts`, the MCP server). Is one driver per platform behind the existing `DeviceDriver` seam right, and what can the two drivers share: device locks, the reference-refresh logic, log tails?
- **Projection and vocabulary:** `renderAssertionState` hard-codes "Current iOS screen". Decide where platform-specific projection lives, and how `bridgeRole` handles Android classes.
- **Tap alias rule:** it's MobileBuildMCP-only today. Confirm Android never enables it.
- **Tests:** a fake mobilecli runner, like `CliRunner` for MobileBuildMCP, plus golden contract tests extended without changing existing entries.

## Answer

Resolved 2026-09-29 with the owner; every recommendation accepted. Based on the code at `d4096b3`: `src/service.ts`, `src/cli.ts`, `src/mcp/index.ts`, `src/device/index.ts`, `src/scripted/observe.ts`, `run.ts`, `vocabulary.ts`, `src/log/index.ts`, `src/logpane/stream.ts`. ADR-0005 freezes the CLI, the MCP tools, scripts, reports and vocabularies. The package exports no library, so internal classes can change.

1. **Driver choice:** one function in `src/device/` builds the driver from the script's `platform`. `src/cli.ts`, which also serves MCP, passes it to `BridgeService` as `createDriver`, and `BridgeService` itself doesn't change. The checks before a run (today's `selectDeviceId`) split by platform: the simulator UUID for iOS, and `device.serial` / `device.avd` / `JEV_ANDROID_DEVICE` for Android.
2. **Layout:** a new `src/device/android/` holds the driver, the mobilecli and `adb` runners, the client for mobilecli's on-device agent, the element mapping (ported from `spikes/android/element-mapping.cjs`), the settle rule and the logcat streams. The iOS driver stays in `src/device/index.ts`. Only the device locks (`acquireLock` and friends, same lock folder, keyed by serial or AVD name) and log-tail reading move into shared files. There's no shared base class.
3. **Tap alias rule:** it moves from the `BridgeService` option onto the MobileBuildMCP driver, which now carries the rule itself. The Android driver never has it. One bridge process serves both platforms, so a process-wide option would leak onto Android runs.
4. **Jev's view:** one renderer in `src/scripted/observe.ts` takes the platform. The header and rule name are per platform: iOS keeps `Current iOS screen (full accessibility capture):` and `visible-full-text-v2`; Android uses `Current Android screen (full accessibility capture):` and `android-full-text-v1`. `Element` gains an optional `placeholder`, which only the Android driver sets. The run's `started` event records the platform's rule, and the run-log allowlist accepts both names.
5. **Roles:** the Android driver maps Android classes and Compose role markers straight to bridge roles. `bridgeRole` stays as MobileBuildMCP's translator. No new roles.
6. **Password fields:** the value shows as dots of the same length, never the characters. That matches iOS and the data-handling guide ("Secure fields show dots"). The driver knows a field is a password from the `password` flag it reads from mobilecli's agent.
7. **Log pane:** `logSources()` gains an optional `logcat` path. `src/logpane/stream.ts` gains a logcat line reader. The pane's "app stopped" check moves from MobileBuildMCP's helper-pid file name onto the driver's `appRunning()`.
8. **Tests:**
   - The Android driver takes injected runners for mobilecli, `adb` and the agent client, like `CliRunner`, so tests use fakes.
   - The 10 emulator captures (on `prototype/android-element-mapping`) become golden tests: raw tree, then elements, then Jev's text.
   - New golden entries are added, and existing entries don't change.
9. **Shared reason codes and wording:**
   - `NO_DEVICE`, `INVALID_DEVICE` and `DEVICE_BUSY` serve both platforms, with their descriptions reworded (for example "No device was configured for the script's platform").
   - The MCP `start_scenario` description says "an explicit iOS or Android action script".
   - The CLI help names `JEV_ANDROID_DEVICE`.
   - The server name `jev-ios-bridge` stays until 2.0.
