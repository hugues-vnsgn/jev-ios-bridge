---
name: test-ios
description: Verify an iOS app by submitting a scenario to the jev-ios-bridge MCP server, then read its report. Use when the user requests iOS UI verification and the bridge tools are available.
---

# Verify an iOS scenario

1. Establish the app bundle ID, dedicated simulator UDID, goal, assertions, and synthetic values to type. Arrange any required account or app data before the run. The bridge launches an installed app; it does not build, install, or seed it.
2. Read an existing scenario JSON file or construct the same shape: `goal`, `app: {bundleId}`, `assertions: [{id, claim}]`, `values: {name: literal}`, and optionally `device: {udid}`. Each assertion must describe observable screen evidence. Typed values must use printable US-keyboard characters.
3. Call the bridge's `start_scenario` tool with `{scenario}`. Save the returned run ID and show the local watch URL to the user. Screen text and supplied values are sent to TypeSafe; screenshots stay local.
4. Poll `get_report` using the run ID until its status is finished. Space polls apart instead of continuously requesting the same evidence. Let the bridge control the simulator throughout the run.
5. Report the recorded verdict and evidence. Passed means the bridge established completion and the assertions; failed identifies a false assertion at completion; inconclusive leaves verification unresolved. An interrupted run is inconclusive and cannot be resumed in this version.
6. When asked to stop, call `cancel_run` with the run ID, then read the report.

The task is complete when the user has the recorded verdict and any evidence needed to investigate. A missing tool, missing simulator, or inconclusive result is not a passing verification.
