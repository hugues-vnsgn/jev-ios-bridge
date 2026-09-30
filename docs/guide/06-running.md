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
| `capture [--serial S \| --avd A] [--jev]` | Android only: prints the current screen as a run sees it. See [below](#capture-an-android-screen). |
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
| 3 | couldn't start: invalid script, missing `TYPESAFE_API_KEY`, no dedicated simulator or Android device, unknown run |
| 130, 143 | stopped by SIGINT or SIGTERM |

`report` returns the same code the run did.

## Capture an Android screen

`capture` prints the screen that's up on an Android device right now, exactly as a run would read it. Use it to write selectors and guards from what's really there. It's for Android only in 1.2.

```sh
npx jev-ios-bridge capture --avd Medium_Phone_API_36.1
npx jev-ios-bridge capture --serial emulator-5554 --jev
```

**Options:**
- `--serial S` or `--avd A` names the device. Without either, it uses `JEV_ANDROID_DEVICE`. `--serial` wins when both are given. Each must match the same pattern as the script's `device.serial` or `device.avd`.
- `--jev` prints Jev's text for the screen instead: what a checkpoint would send, byte for byte.

**What it does:**
- It **doesn't launch or restart the app,** and leaves it as it is. Bring the screen you want up first.
- It runs a run's device checks (all but the installed-app check, since it names no app), holds the device lease while it captures, and refuses with `DEVICE_BUSY` when another tool's UI-automation agent (a foreign agent) holds the device. Afterwards it stops its device agent and removes its `adb forward`, as a run does.
- It waits for the screen to [settle](12-android-setup.md#animations-off-is-optional) before printing, as each step of a run does.
- It needs no `TYPESAFE_API_KEY`, and takes no screenshot.

**Output:** one JSON object per line, one line per element, in capture order:

```json
{"role":"text","label":"Selected: None","identifier":"selection.summary","state":{"enabled":true,"visible":true}}
{"role":"button","label":"Add Apple ($2)","identifier":"choose.apple","state":{"enabled":true,"visible":true}}
{"role":"text","label":"Add Apple ($2)","state":{"enabled":true,"visible":true},"selectable":false}
```

That's three lines of the diagnostic app's first screen.

- `role`, then whichever of `label`, `value`, `identifier`, `placeholder` and `state` the element has. A field the element doesn't have is left out.
- `placeholder` is an empty field's grey hint. A field with no other name also shows the hint as its `label`, so a `label` selector finds the field by it, but [claims](05-writing-claims.md) shouldn't say the field "contains" it.
- `"selectable": false` marks a text that the bridge lifted into its button's label. Jev still sees it, but no guard or selector ever matches it: select the button instead.

**Exit codes:**

| Code | Meaning |
| --- | --- |
| 0 | printed the screen, and cleaned up |
| 3 | couldn't capture. stderr holds one line, `CODE: message`, with a [reason code](reference/reason-codes.md) such as `NO_DEVICE`, `DEVICE_NOT_CONNECTED`, `DEVICE_LOCKED`, `DEVICE_BUSY`, `ANDROID_TOOLS_UNAVAILABLE` or `CLEANUP_FAILED` |
| 130, 143 | stopped by SIGINT or SIGTERM, after cleaning up |

`capture --jev` on a screen with nothing for Jev to read exits 3 with `EMPTY_SCREEN`.

## From Claude Code (MCP, `/test-ios` and `/test-android`)

Install the plugin as in the [quickstart](01-quickstart.md#6-let-claude-code-run-it). Then ask Claude to verify something with `/jev-ios-bridge:test-ios`, or `/jev-ios-bridge:test-android` for an Android app. The skill writes the script from your app's source and identifiers, or uses one you give it, and submits it once. `/test-android` looks at each screen with `capture` first.

| Tool | Input | Returns |
| --- | --- | --- |
| `start_scenario` | `scenario` (the script), optional `limits: {maxSteps, wallTimeMs}` | `{runId, watchUrl, logsCommand}` |
| `get_report` | `runId`, optional `waitMs` (up to 45 000) | Progress while running; the full report when done |
| `cancel_run` | `runId` | Stops the run and waits for cleanup |

While a run is going, `get_report` shows progress only, never screen contents. Claude can't steer a run once it's started. Closing the server cancels its runs.

### Without the plugin

With the npm install from the quickstart, register the server in your project's `.mcp.json`, using absolute paths:

```json
{
  "mcpServers": {
    "jev-ios-bridge": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/your-project/.env",
        "/absolute/path/to/your-project/node_modules/jev-ios-bridge/dist/cli.js",
        "mcp"
      ],
      "env": { "JEV_DEVICE_UDID": "<UUID>", "JEV_ANDROID_DEVICE": "<AVD name or serial>" }
    }
  }
}
```

Leave out whichever device you don't use. Then copy the skills, and restart Claude Code. They're `/test-ios` and `/test-android` this way:

```sh
mkdir -p .claude/skills/test-ios .claude/skills/test-android
cp node_modules/jev-ios-bridge/skills/test-ios/SKILL.md .claude/skills/test-ios/
cp node_modules/jev-ios-bridge/skills/test-android/SKILL.md .claude/skills/test-android/
```

Codex can use the same MCP server and skills (copy each skill to `.agents/skills/<name>/SKILL.md`). Support for Codex is best effort.

## Watching a run

- **Watch page:** the watch URL opens a local page (on `127.0.0.1`) that shows each step, its screenshot, the judgments, and the verdict as they're recorded. Its token opens only that run, and only while the bridge process is alive.
- **Log pane:** once the app launches, a terminal window opens with the app's own output, like Xcode's console:
  - `[app]` lines are what the app prints: `print`, `NSLog`, Kotlin `println`;
  - `[os]` lines are `os_log`/`Logger` messages whose subsystem is the app's bundle ID;
  - on Android, the pane follows `logcat` for the app's own uid: `[app]` lines are `System.out` and `System.err`, and `[os]` lines are every other tag, shown as `[Tag] message`;
  - errors are red;
  - values from your script are masked as `[value:<key>]`;
  - if the app dies mid-run, the pane says so. On Android it names the cause, such as a crash or "not responding".

  When the run ends, the pane prints the verdict and where the evidence is.
  - **After a failed or inconclusive run,** the pane keeps running, so its output stays in front of you until you close it.
  - **After a pass,** the pane finishes a few seconds later. Terminal then shows `[Process completed]` and keeps the window until you close it (⌘W). To have Terminal close these windows by itself, set Terminal → Settings → Profiles → Shell → "When the shell exits" to "Close if the shell exited cleanly". The bridge doesn't close windows itself: that would need macOS Automation permission.

**Log pane settings:**
- **Terminal app:** the window opens in the app macOS uses for `.command` files (Terminal, unless you've changed it). `JEV_LOG_PANE_APP=iTerm` picks another.
- **Turning it off:** `--no-log-pane` or `JEV_LOG_PANE=off`. It's also off over SSH, in CI, and with no desktop session. In those cases the bridge prints a `logs` command instead. Under MCP, `logsCommand` holds the same command.

## Cancelling and the device lease

Cancelling stops new work, waits for any device command already sent, then stops the app. A cancelled run is inconclusive (`CANCELLED`).

Only one run uses a device at a time. The device lease is a lock file, `$TMPDIR/jev-ios-bridge-device-locks/<UUID>.lock`, holding the owning bridge process's ID. On Android the file is named after the device identity in capitals (the AVD name for an emulator, the serial for a phone), and `capture` takes the same lease. On Android, the lease is released only once the bridge's device agent is confirmed stopped.

- **A lease left by a process that has exited** is cleared by the next run. On Android, that run also stops the device agent, `adb forward` and `logcat` processes the crashed run left behind, and its `prepared` event records `sweptLeftovers: true`.
- **A command that never answered:** if cleanup couldn't confirm a device command, the lock stays until that command answers. Then the bridge finishes cleanup itself.
- **`DEVICE_BUSY`** names the process holding the lock and the lock file. If it's a bridge you don't need, stop that process (for example, restart the MCP server), and the next run clears the lock.
- **Never delete a lock whose process is still running;** a device command may still be in flight.
