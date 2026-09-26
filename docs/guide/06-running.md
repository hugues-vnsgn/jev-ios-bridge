# Run

## From the terminal

```sh
node --env-file=.env node_modules/jev-ios-bridge/dist/cli.js run checks/login.json
```

| Command | What it does |
| --- | --- |
| `run <script.json>` | Runs a script. Prints the watch URL to stderr, then the report to stdout. |
| `run <script.json> --json` | The same, but prints [`report.json`](reference/report-json.md) instead of the prose report. |
| `report <run-id> [--json]` | Prints a recorded run's report again. |
| `logs <run-id>` | Follows a live run's app output in this terminal. |
| `mcp` | Starts the MCP server for Claude Code. |
| `--version`, `--help` | |

**Options for `run`:**
- `--max-steps N` (1–100, default 100) and `--timeout-ms N` (default 300 000, at most one hour) limit the whole run. They never change how claims are judged.
- `--no-log-pane` skips the log pane window.

**Exit codes:**

| Code | Meaning |
| --- | --- |
| 0 | passed |
| 1 | failed |
| 2 | inconclusive |
| 3 | couldn't start: invalid script, missing `TYPESAFE_API_KEY`, no dedicated simulator, unknown run |
| 130, 143 | stopped by SIGINT or SIGTERM |

`report` returns the same code the run did.

## From Claude Code (MCP and `/test-ios`)

Register the server and copy the skill as in the [quickstart](01-quickstart.md#6-let-claude-code-run-it). Then ask Claude to verify something with `/test-ios`. The skill writes the script from your app's source and identifiers, or uses one you give it, and submits it once.

| Tool | Input | Returns |
| --- | --- | --- |
| `start_scenario` | `scenario` (the script), optional `limits: {maxSteps, wallTimeMs}` | `{runId, watchUrl, logsCommand}` |
| `get_report` | `runId`, optional `waitMs` (up to 45 000) | Progress while running; the full report when done |
| `cancel_run` | `runId` | Stops the run and waits for cleanup |

While a run is going, `get_report` shows progress only, never screen contents. Claude can't steer a run once it's started. Closing the server cancels its runs.

Codex can use the same MCP server and skill (copy the skill to `.agents/skills/test-ios/SKILL.md`). Support for Codex is best effort.

## Watching a run

- **Watch page:** the watch URL opens a local page (on `127.0.0.1`) that shows each step, its screenshot, the judgments, and the verdict as they're recorded. Its token opens only that run, and only while the bridge process is alive.
- **Log pane:** once the app launches, a terminal window opens with the app's own output, like Xcode's console:
  - `[app]` lines are what the app prints: `print`, `NSLog`, Kotlin `println`;
  - `[os]` lines are `os_log`/`Logger` messages whose subsystem is the app's bundle ID;
  - errors are red;
  - values from your script are masked as `[value:<key>]`;
  - if the app dies mid-run, the pane says so.

  When the run ends, the pane prints the verdict and where the evidence is. After a pass it closes itself after a few seconds; otherwise it stays open until you close it.

**Log pane settings:**
- **Terminal app:** the window opens in the app macOS uses for `.command` files (Terminal, unless you've changed it). `JEV_LOG_PANE_APP=iTerm` picks another.
- **Turning it off:** `--no-log-pane` or `JEV_LOG_PANE=off`. It's also off over SSH, in CI, and with no desktop session. In those cases the bridge prints a `logs` command instead. Under MCP, `logsCommand` holds the same command.

## Cancelling and the device lock

Cancelling stops new work, waits for any device command already sent, then stops the app. A cancelled run is inconclusive (`CANCELLED`).

Only one run uses a simulator at a time. The lock is a file, `$TMPDIR/jev-ios-bridge-device-locks/<UUID>.lock`, holding the owning bridge process's ID.

- **A lock left by a process that has exited** is cleared by the next run.
- **A command that never answered:** if cleanup couldn't confirm a device command, the lock stays until that command answers. Then the bridge finishes cleanup itself.
- **`DEVICE_BUSY`** names the process holding the lock and the lock file. If it's a bridge you don't need, stop that process (for example, restart the MCP server), and the next run clears the lock.
- **Never delete a lock whose process is still running;** a device command may still be in flight.
