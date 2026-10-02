# Show the simulator window; DEVICE_NOT_BOOTED on iOS

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: 01

## What to build

Exactly [live-test issue 01](../../../live-test-v1.2/issues/01-show-the-simulator-window.md): bring the run's simulator window to the front during iOS `prepare` (on by default, `--no-device-window` on `run` and an equivalent MCP option turn it off; a failure to open it is a run-log warning, never a failure), and refuse a shut-down simulator with `DEVICE_NOT_BOOTED` and a boot hint instead of `DEVICE_ERROR`. Docs: troubleshooting entry, the flag in `06-running.md`, the test-ios skill's step 1.

## Acceptance

As in the live-test issue. iOS golden files change only where the new event or message appears; say which in the commit.
