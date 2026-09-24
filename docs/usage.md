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

Typed values must use printable US-keyboard characters. Preconditions describe setup the author must arrange; the bridge does not seed accounts or reset app data. Assertions describe the current screen. Ordered assertions are not supported.

Run the scenario with `node dist/cli.js run scenario.json`. The command prints a local watch URL to stderr and a final report to stdout. Exit codes are 0 for passed, 1 for failed, and 2 for inconclusive or startup failure.

## MCP hosts

Start the stdio server with `node --env-file=/absolute/path/to/.env /absolute/path/to/dist/cli.js mcp`. Register this command with the host using the consuming app's repository as its working directory. Export `JEV_DEVICE_UDID` to select its dedicated simulator.

The server exposes:

| Tool | Input | Result |
| --- | --- | --- |
| `start_scenario` | `scenario` object | A run ID and local watch URL |
| `get_report` | `runId` | Running, finished, or interrupted status, plus the recorded outcome and recent evidence |
| `cancel_run` | `runId` | Cancellation after cleanup |

The host submits once and polls for the report. It must leave the simulator to the bridge during a run. The bridge uses text content for its responses so hosts receive the complete report. Closing the server cancels active runs and ends the watch page.

Copy [the test-ios skill](../skills/test-ios/SKILL.md) into the consuming repository's `.claude/skills/test-ios/SKILL.md` for Claude Code, or `.agents/skills/test-ios/SKILL.md` for Codex. Register the MCP server separately. Codex support remains best effort.

## Evidence and data handling

Run logs and copied screenshots live in `.jev-runs/<run-id>/` in the current directory. Override the root with `JEV_RUNS_DIR`. Directories use owner-only permissions, as do logs and screenshot files. Artifacts remain until the owner removes the run directory; there is no automatic retention cleanup.

Screen text and supplied values go to TypeSafe. The scenario and report enter the host model's context. Every supplied value and the API key are redacted from textual run events. Screenshots are images: text redaction does not remove visible private data from them. Use synthetic test data and agree on data handling before testing apps containing real user information. Screenshots never go to Jev.

The watch server binds to `127.0.0.1` on an available port. Its URL contains a private access token. Anyone with that URL on the machine can read the run evidence while the server lives. The page shows per-step captures and recorded judgments, not a video stream.

After a process interruption, use `node dist/cli.js report <run-id>` from the same evidence directory. A log without a final verdict is reported as inconclusive. This version does not resume interrupted runs or escalate to the host agent.
