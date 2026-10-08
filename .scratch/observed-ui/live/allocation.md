# Live simulator allocation

- Purpose: observed UI live validation, task `task_96375a1378ee`.
- Owned simulator name: `jev-observed-ui-live-20261008`.
- UDID: `73997430-DB8A-48C8-8146-12320CE6AEFE`.
- Device type: `com.apple.CoreSimulator.SimDeviceType.iPhone-17`.
- Runtime: `com.apple.CoreSimulator.SimRuntime.iOS-27-0` (iOS 27.0).
- Allocation command: `xcrun simctl create jev-observed-ui-live-20261008 com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-27-0`.
- Exclusively assigned to this live validation. Historical retained-study device `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7` was not selected or touched.
- Cleanup: pending; preserve if any action is uncertain.

## AXe semantic-tap diagnostic allocation

- Purpose: bounded semantic AXe tap probe directed by the coordinator.
- Owned simulator name: `jev-observed-ui-axe-20261008`.
- UDID: `2FE383F2-2D0F-4286-8797-D3ACEFCD6220`.
- Device type: `com.apple.CoreSimulator.SimDeviceType.iPhone-17`.
- Runtime: `com.apple.CoreSimulator.SimRuntime.iOS-27-0` (iOS 27.0).
- Allocation command: `xcrun simctl create jev-observed-ui-axe-20261008 com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-27-0`.
- Exclusively assigned to this diagnostic. Do not reuse if semantic tap is uncertain; coordinator instructed a separate fresh allocation for physical down/up comparison.
- Status: retained and quarantined after one acknowledged semantic AXe tap failed to produce the visible postcondition; do not reuse or shut down pending coordinator reconciliation.

## MobileBuildMCP touch comparison allocation

- Purpose: one existing-vendor physical touch down/up comparison after semantic AXe tap no-op, per coordinator direction.
- Owned simulator name: `jev-observed-ui-touch-20261008`.
- UDID: `6A8C5F93-F59A-456B-B157-10642209B734`.
- Device type: `com.apple.CoreSimulator.SimDeviceType.iPhone-17`.
- Runtime: `com.apple.CoreSimulator.SimRuntime.iOS-27-0` (iOS 27.0).
- Allocation command: `xcrun simctl create jev-observed-ui-touch-20261008 com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-27-0`.
- Exclusively assigned to the MobileBuildMCP touch comparison. If uncertain, retain and quarantine it.
- Status: the one vendor touch completed with a real success response and visible `details.heading`; no uncertainty remains from that diagnostic action.

## Final retention status

- `73997430-DB8A-48C8-8146-12320CE6AEFE`: retained booted after the pre-fix runner attempted one tap and never observed the destination. The observed-action journal is quarantined; the device lease file remains at `$TMPDIR/jev-ios-bridge-device-locks/73997430-DB8A-48C8-8146-12320CE6AEFE.lock`.
- `2FE383F2-2D0F-4286-8797-D3ACEFCD6220`: retained booted after one standalone AXe semantic tap returned success without changing the visible screen. It has no observed-run journal claim; marked quarantined for this operator task and not reused.
- `6A8C5F93-F59A-456B-B157-10642209B734`: retained booted after the controlled reply-loss case. The authoritative journal is uncertain/quarantined; the device lease file remains at `$TMPDIR/jev-ios-bridge-device-locks/6A8C5F93-F59A-456B-B157-10642209B734.lock`.
- No owned simulator was shut down, erased, deleted or reset. No claims were cleared. Historical UDID `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7` was not reused or touched.
