# Running the bridge

The v0.1.0 implementation is under verification. The feasibility gate is still open; current policy defaults are provisional. See the [release plan](../.scratch/jev-ios-bridge/release-plan.md) for evidence required before publication.

## Local setup

Use Node 24 or later and a Mac with Xcode and an iOS simulator runtime. Install dependencies and build:

```sh
npm ci
npm run build
node dist/cli.js --help
```

The bridge invokes `mobilebuildmcp@2.7.1` through `npx`. Its first invocation may download the pinned package. Configure a dedicated simulator, separate from the one used for interactive development. Set `JEV_DEVICE_UDID`, supply `scenario.device.udid`, or put `sessionDefaults.simulatorId` in `.mobilebuildmcp/config.yaml`. The bridge only launches already-installed apps in this initial implementation.

Keep `TYPESAFE_API_KEY` in the environment or a private `.env`. Node can load it without the bridge copying the file:

```sh
node --env-file=/absolute/path/to/.env dist/cli.js run scenario.json
```

## Scenario

A scenario supplies the goal, bundle ID, assertions, and every value the bridge may type. Save it as JSON:

```json
{
  "goal": "Open Settings and verify the Settings title is visible.",
  "app": { "bundleId": "com.apple.Preferences" },
  "assertions": [
    { "id": "title", "claim": "The screen shows the Settings title." }
  ],
  "values": {}
}
```

Typed values must use printable US-keyboard characters and replace the entire field value. MobileBuildMCP 2.7.1's AXe input path rejects a leading hyphen, so the bridge rejects values beginning with `-` before device work. Preconditions describe setup the author must arrange; the bridge does not seed accounts or reset app data. Assertions describe the current screen.

Run the scenario with `node dist/cli.js run scenario.json`. The command prints a local watch URL to stderr and a final report to stdout. Exit codes are 0 for passed, 1 for failed, and 2 for inconclusive or startup failure.

For a flow across screens, the experimental checkpoint form gives each stage an observable desired state:

```json
{
  "app": { "bundleId": "com.sentry.weather.Weather" },
  "checkpoints": [
    {
      "id": "settings",
      "goal": "The Weather Settings sheet is open with Temperature choices visible.",
      "assertions": [{ "id": "choices", "claim": "The Temperature controls show °C and °F choices." }]
    },
    {
      "id": "fahrenheit",
      "goal": "The °F Temperature control is selected in Settings.",
      "assertions": [{ "id": "selected", "claim": "The °F Temperature control is selected." }]
    }
  ]
}
```

Use 2 to 10 checkpoints with unique IDs. Put typed `values` only inside the checkpoint that needs them; omitted values mean none. The checkpoint form rejects root-level `goal`, `assertions`, or `values`. The bridge prepares the app once, records each passing checkpoint, and passes the run only after every checkpoint passes in order. A failed or uncertain checkpoint ends the run. This input form is still awaiting its live feasibility result.

Step and time limits cover the whole run. Override them with `--max-steps 60 --timeout-ms 600000`, or the MCP `limits` object. These options do not change the judgment thresholds.

## MCP hosts

Start the stdio server with `node --env-file=/absolute/path/to/.env /absolute/path/to/dist/cli.js mcp`. Register this command with the host using the consuming app's repository as its working directory. Export `JEV_DEVICE_UDID` to select its dedicated simulator.

The server exposes:

| Tool | Input | Result |
| --- | --- | --- |
| `start_scenario` | `scenario` object, optional `limits: {maxSteps, wallTimeMs}` | A run ID and local watch URL |
| `get_report` | `runId`, optional `waitMs` up to 45000 | Progress while running; the recorded outcome and evidence once finished or interrupted |
| `cancel_run` | `runId` | Cancellation after cleanup |

The host submits once and waits for the report with `get_report` and `waitMs: 45000`. Running replies contain progress only; per-step screen evidence stays out of the host's context until the final report. It must leave the simulator to the bridge during a run. The bridge uses text content for its responses so hosts receive the complete report. Closing the server cancels active runs and ends the watch page.

Copy [the test-ios skill](../skills/test-ios/SKILL.md) into the consuming repository's `.claude/skills/test-ios/SKILL.md` for Claude Code, or `.agents/skills/test-ios/SKILL.md` for Codex. Register the MCP server separately. Codex support remains best effort.

## Evidence and data handling

Run logs and copied screenshots live in `.jev-runs/<run-id>/` in the current directory. Override the root with `JEV_RUNS_DIR`. Directories use owner-only permissions, as do logs and screenshot files. Artifacts remain until the owner removes the run directory; there is no automatic retention cleanup.

Screen text and supplied values go to TypeSafe. The scenario and report enter the host model's context. Every supplied value and the API key are redacted from textual run events. Screenshots are images: text redaction does not remove visible private data from them. Use synthetic test data and agree on data handling before testing apps containing real user information. Screenshots never go to Jev.

The watch server binds to `127.0.0.1` on an available port. Its URL contains a private access token. Anyone with that URL on the machine can read the run evidence while the server lives. The page shows per-step captures, recorded judgments, and bounded runtime/OS log excerpts supplied by the device layer. Each log excerpt is at most 4 KiB; unavailable logs are identified. These excerpts remain local and are excluded from Jev's observation. The page does not stream video.

After a process interruption, use `node dist/cli.js report <run-id>` from the same evidence directory. A log without a final verdict is reported as inconclusive. This version does not resume interrupted runs or escalate to the host agent.
