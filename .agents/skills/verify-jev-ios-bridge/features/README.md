# Verification feature map

Use this index to select the public behavior affected by a change, then read its recipe. Record each unvisited entry point and its unmet precondition.

## Sub-features

| Feature | Public entry points | Observable proof |
| --- | --- | --- |
| [Scripted checks and refusal](scripted.md) | CLI `run`; MCP `start_scenario` | Actions and checkpoint verdict, or refusal before a run exists |
| [Reports and logs](reports.md) | CLI `report`, `logs`; MCP `get_report`; watch URL | Stored verdict agrees with retrieval, events, and visible progress |
| [MCP lifecycle](mcp.md) | `start_scenario`, `get_report`, `cancel_run`; stdio close | One start, bounded polling, explicit cancellation, and cleanup |
| [Android capture](capture.md) | CLI `capture`, `capture --jev` | Current-screen elements or Jev text, followed by owned cleanup |
| [Driven handbacks](driven.md) | Version 2 `do`; MCP `resolve_step` | Enabled discovery, bound pause and answer, or timeout |
| [Observed actions](observed.md) | Seven `observed-*` CLI commands and their MCP equivalents | Committed allocation/action authority, visible predicates, and retained evidence |

## How to get to it (user POV)

Build this checkout's `dist/cli.js` through the [main skill](../SKILL.md). Users run the CLI directly or connect a stdio MCP client to `node dist/cli.js mcp`. The feature files name the exact commands and tool arguments.

## Driving it with the CLI and MCP

Preconditions:

- Complete the main skill's Launch and Doctor before any drive.
- Use a fresh project, an absolute retained evidence directory, and the device assignment from the task.
- Obtain the owner's go-ahead for real admission-store access before any live iOS scripted/driven drive or observed operation. Without that approval, record those branches as owner-gated and continue authorized Android or device-free checks.

- **Select coverage.** Record the feature ID and entry point beside each command/request, stdout/response, stderr, and exit code. Separate CLI and MCP coverage.
- **Drive.** Follow each selected recipe's initial state and literal guards. Capture the action and resulting state, then inspect its files and cleanup result.
- **Keep evidence.** Retain the actual report, events, screenshots, and command receipts after cleanup. A fixture test proves its contract boundary only.
- **Report gaps.** Record an unavailable app build, unassigned device, missing client, missing owner approval, or other unmet precondition. Preserve the journey's expected result.

## Gotchas

- The smoke helper covers version/help, malformed JSON, and unknown-report refusal. It proves no live device behavior and does not certify the whole map or a release.
- A worktree or isolated evidence directory does not isolate a device or the per-user admission store. Android capture also takes a lease and starts automation.
- Observed actions are experimental and owner-gated. Their outcomes and evidence differ from scripted verdicts and reports. Read [observed actions](observed.md) before any observed command.
- Source contracts are `src/cli.ts`, `src/mcp/`, `docs/guide/06-running.md`, `13-driven-steps.md`, `14-observed-actions.md`, and `docs/guide/reference/`. Goldens under `tests/golden/` freeze CLI exits, schemas, reports, evidence names, and Android representations.
