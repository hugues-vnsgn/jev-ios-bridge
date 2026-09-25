---
name: test-ios
description: Verify an iOS app by submitting a scenario to the jev-ios-bridge MCP server, then read its report. Use when the user requests iOS UI verification and the bridge tools are available.
---

# Verify an iOS scenario

1. Establish the app bundle ID, dedicated simulator UDID, goal, assertions, and synthetic values to type. Arrange any required account or app data before the run. The bridge launches an installed app; it does not build, install, or seed it.
2. Read an existing scenario JSON file or choose one of two shapes. For a single desired screen state, use `goal`, `app: {bundleId}`, `assertions: [{id, claim}]`, `values: {name: literal}`, and optionally `device: {udid}`. For a flow, use `app`, optional `device`, and 2 to 10 ordered `checkpoints: [{id, goal, assertions, values?}]`, with unique IDs. The checkpoint form has no root goal, assertions, or values. State each goal as an observable end state and supply only the values needed at that checkpoint. Typed values must use printable US-keyboard characters and must not begin with a hyphen under MobileBuildMCP 2.7.1.
3. Call the bridge's `start_scenario` tool with `{scenario}` and optionally `limits: {maxSteps, wallTimeMs}` for a longer flow. Limits apply to the whole run. Save the returned run ID and show the local watch URL to the user. Screen text and the active checkpoint's supplied values are sent to TypeSafe; screenshots stay local.
4. Call `get_report` with the run ID and `waitMs: 45000`; repeat only if its status is still running. Running replies contain progress only. Read the evidence report once the run finishes. Let the bridge control the simulator throughout the run.
5. Report the recorded verdict and evidence. Passed means the bridge established completion and the assertions; failed identifies a false assertion at completion; inconclusive leaves verification unresolved. An interrupted run is inconclusive and cannot be resumed in this version.
6. When asked to stop, call `cancel_run` with the run ID, then read the report.

The task is complete when the user has the recorded verdict and any evidence needed to investigate. A missing tool, missing simulator, or inconclusive result is not a passing verification.
