# MCP lifecycle

A stdio MCP client starts one saved scenario, waits for its report, and cancels or closes the owning server with evidence of cleanup.

## Sub-features

- `mcp-discovery` initializes a real server and discovers its public tool schemas.
- `mcp-run` submits once and polls progress through the terminal report.
- `mcp-cancel` explicitly cancels an active run and waits for cleanup.
- `mcp-shutdown` closes an owned server during a run and checks its saved result.

## How to get to it (user POV)

Connect a stdio MCP client to `node dist/cli.js mcp`. Call `start_scenario`, `get_report`, and `cancel_run` through that connection. `resolve_step` requires the [driven switch](driven.md). Observed tools have their [own contract](observed.md).

## Driving it with a stdio MCP client

Preconditions:

- Complete the main skill's Launch and Doctor. Use an available MCP client that can initialize, call `tools/list`, call tools, and close its owned server.
- Complete the Android installation and initial-state checks in [scripted checks](scripted.md). Use the same `bridge_root`, `key_file`, `proof_project`, `proof_runs`, and `assigned_serial`.
- Every live iOS scenario is owner-gated because it writes the real admission store. Use the authorized Android fixture for this job.

- **Launch and discover.** Spawn the command below through the client, record its PID, initialize MCP, then call `tools/list`. Keep stdout reserved for protocol messages. Require `start_scenario`, `get_report`, and `cancel_run`. Additional observed tools are valid.

```sh
JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" JEV_ANDROID_DEVICE="$assigned_serial" \
JEV_LOG_PANE=off JEV_DEVICE_WINDOW=off \
node --env-file="$key_file" "$bridge_root/dist/cli.js" mcp
```

- **Submit once.** Parse `examples/diagnostic-app-android/scenario.json` and call `start_scenario` with `{scenario, limits: {maxSteps: 10, wallTimeMs: 300000}}`. Require no `isError`. Parse the returned text block as JSON and retain its `runId`, `watchUrl`, and `logsCommand`.
- **Poll.** Call `get_report` with `{runId, waitMs: 1000}` until its text starts with `Status: finished`, using a 330-second client deadline. Running replies contain progress only. Require terminal prose `Run <runId>: failed` and `ASSERTION_FALSE`, plus the actual report/events/screenshots from the scripted recipe. `waitMs` accepts 0 through 45000. Cancelling a read wait does not cancel the run.
- **Cancel an active run.** For a separate case, copy the Android diagnostic and prepend the following step, keeping its final checkpoint. Submit the modified scenario once with the same limits. Poll until the saved event log reaches `holdForCancel` and `get_report` still says running, then call `cancel_run` with `{runId}`.

```json
{"id":"holdForCancel","kind":"wait","guard":{"present":[{"identifier":"selection.summary","label":"Selected: None"}]},"until":{"present":[{"identifier":"verification.never.present"}]},"timeoutMs":60000}
```

Require reply `Run <runId> stopped.` and subsequent `get_report` text `Status: finished` with `inconclusive` and `CANCELLED`. CLI `report <runId> --json` with the same evidence root must exit 2 and agree. Inspect owned agent/forward/lease cleanup. If it finished or hit `WAIT_TIMEOUT` first, the cancellation journey was not exercised.

- **Close during work.** Start a fresh cancellation scenario, wait for `holdForCancel`, and close that exact client's server stdin. Wait for the recorded server PID to exit. Retrieve its saved report from the CLI and require `inconclusive` / `CANCELLED`, exit 2, and cleanup evidence. A client that force-kills the child cannot prove graceful stdin-close behavior. Record an interrupted report or uncertain cleanup as a gap.
- **Keep proof.** Retain initialization, tool discovery, every request/reply, run IDs, server exit, and cleanup inventory. Run the main skill's Cleanup after every attempt and confirm report/event files survive.

## Gotchas

- `start_scenario` returns JSON inside a text content block. Legacy `get_report` and `cancel_run` return text, not a JSON snapshot. Preserve tool-level `isError` separately from the run verdict.
- Repeated `start_scenario` calls start new work. Poll with `get_report` using the original returned ID and the same connection.
- Cancellation waits for an already issued device command before cleanup. A process exit or stopped message alone does not establish native cleanup.
- Missing MCP client, uninstalled diagnostic, or absent device ownership blocks that entry point. A fixture server cannot substitute for the built server in a live proof.
- MCP has no `--no-log-pane` or `--no-device-window` flags. Use the launch environment above. Do not edit the owner's `.mcp.json` to register this proof server.
