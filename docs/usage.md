# Running the bridge

The supported input is an explicit script. Jev judges current-screen assertions; it does not choose actions. This is an experimental prerelease. A correct visible state can still yield an inconclusive result when an assertion is uncertain.

## Install and prepare

Use Node 24 or later and a Mac with Xcode and an iOS simulator runtime. From a source checkout:

```sh
npm ci
npm run build
node dist/cli.js --help
```

For a downloaded GitHub package, install the local archive in the consuming project:

```sh
npm install /path/to/jev-ios-bridge-0.1.0.tgz
node node_modules/jev-ios-bridge/dist/cli.js --version
```

The bridge installs `mobilebuildmcp@2.7.1` as a dependency and runs its CLI directly with Node, with no `npx` round trip. Boot a dedicated simulator and install the app before a run. Use MobileBuildMCP for that setup. Keep other device clients out of the dedicated simulator during execution.

Select its UUID with `scenario.device.udid`, `JEV_DEVICE_UDID`, or `sessionDefaults.simulatorId` in `.mobilebuildmcp/config.yaml`, in that precedence order. Device aliases such as `booted` are rejected. Set `sentryDisabled: true` in that config; the bridge also disables vendor telemetry in its child commands.

Keep `TYPESAFE_API_KEY` in the environment or a private, ignored `.env`. Load it by reference:

```sh
node --env-file=/absolute/path/to/.env dist/cli.js run scenario.json
```

The simulator must be booted: the vendor can misleadingly report a stock app as missing when it is shut down. The bridge restarts the installed app during preparation. Persistent app data remains, but navigation may reset or restore differently by app. Scripts must perform their own navigation from the actual post-launch screen.

## Script shape

This example uses the repository's installed diagnostic fixture and checks its first selection:

```json
{
  "version": 1,
  "app": { "bundleId": "dev.jevbridge.diagnostic" },
  "values": {},
  "steps": [
    {
      "id": "addApple",
      "kind": "action",
      "guard": { "present": [
        { "role": "text", "identifier": "selection.summary", "label": "Selected: None" }
      ] },
      "action": { "kind": "tap", "selector": { "role": "button", "identifier": "choose.apple" } }
    },
    {
      "id": "verify",
      "kind": "checkpoint",
      "guard": { "present": [{ "role": "text", "identifier": "selection.summary" }] },
      "assertions": [{ "id": "selection", "claim": "The selection summary reads Selected: Apple." }]
    }
  ]
}
```

Adapt selectors and claims to the app's actual accessibility evidence. The diagnostic fixture's source/build instructions are in the repository, not the installed package.

A script has 1–100 steps with unique IDs and ends at a checkpoint. Optional `preconditions` describe setup the author arranges; they do not execute setup. Each guard requires one or more `present` selectors and can forbid `absent` selectors. A selector matches exact `identifier`, `role`, `label`, and/or `value`; at least one nonblank identifier/role/label is required. A value filter must not be empty: an empty Compose field has no value and an empty native field reports its placeholder, so emptiness can't be selected. Captured refs and list indices are not durable selectors.

| Step | Additional fields |
| --- | --- |
| `kind: "action"` | `action: {kind: "tap", selector}` |
| `kind: "action"` | `action: {kind: "replaceText", selector, valueKey}` |
| `kind: "action"` | `action: {kind: "swipe", selector, direction: "up"}`; down/left/right also supported |
| `kind: "wait"` | `until: {present: [...]}`, optional absent selectors, and `timeoutMs` up to 60000 |
| `kind: "checkpoint"` | 1–20 `assertions: [{id, claim}]` about the current screen |

Every step also has `id` and `guard`. Guards must identify the intended view: one text field could be Search or a card's Notes field. A sheet can leave background controls in the accessibility capture. Before acting on the main view, close the sheet explicitly and forbid its distinguishing anchors; visible background text does not prove the view is unobstructed. Missing, ambiguous, hidden, disabled, or invalid targets do not trigger guessed actions. The pinned driver recognizes narrowly proven aliases of the same physical button tap; distinct targets remain ambiguous.

Put every typed literal in root `values` and reference its key from `replaceText`. Replacement requests clearing the whole field. Check the resulting text with the next guard: simulator keyboard state can change how typing and modifier keys are applied. Values are limited to 32 entries of at most 2048 printable US-keyboard characters. Leading hyphens are rejected because of the pinned vendor typing limitation. Jev never generates input text.

The former `goal` and autonomous `checkpoints` forms are unsupported. Ordered verification uses explicit checkpoint steps after the actions that establish their screen.

## Run and interpret

```sh
node --env-file=/absolute/path/to/.env dist/cli.js run scenario.json --max-steps 100 --timeout-ms 300000
```

The command prints the watch URL to stderr and the report to stdout. Defaults are 100 steps and 300 seconds across the entire run; the maximum wall limit is one hour. Limits do not alter assertion thresholds. Add `--json` to print the run's `report.json` instead of the prose report. Exit codes: 0 passed, 1 failed, 2 inconclusive, 3 could not start (invalid script, missing key, no dedicated simulator); 130 and 143 after SIGINT and SIGTERM. `report RUN_ID` returns the same codes.

At each checkpoint, probability at least 0.9 establishes a claim; at most 0.1 rejects it. A confidently false claim fails that checkpoint even when other claims are uncertain; otherwise any uncertain claim makes it inconclusive. Each checkpoint is judged once. Passing requires every step/checkpoint and successful cleanup. Unexpected UI, budget overflow, missing targets, provider errors, or interruption leave verification inconclusive. Earlier checkpoint proofs stay in the log.

Cancellation stops new work, waits for issued device acknowledgements, then stops the app. Cleanup waits up to 45 seconds, longer than one device command's own 35-second deadline. If an action or cleanup still remains unconfirmed, the device lock is retained and the result is inconclusive; when the late command does acknowledge, the bridge finishes cleanup and releases the lock by itself.

The lock is a file, `$TMPDIR/jev-ios-bridge-device-locks/<SIMULATOR-UUID>.lock`, holding the owning bridge process ID. A run that finds a lock whose process has exited removes it and continues. A `DEVICE_BUSY` message names the process and the lock file. If that process is a bridge you no longer need, stop it (for example, restart the MCP server); the next run then clears the lock. Never delete a lock while its process is still running: a device command may still be in flight. Completed verdicts are not rewritten by a later cancellation request.

## MCP and the host skill

Register a stdio server with the consuming project as working directory:

```json
{
  "mcpServers": {
    "jev-ios-bridge": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/.env",
        "/absolute/path/to/node_modules/jev-ios-bridge/dist/cli.js",
        "mcp"
      ],
      "env": { "JEV_DEVICE_UDID": "YOUR-DEDICATED-SIMULATOR-UUID" }
    }
  }
}
```

Copy the package's `skills/test-ios/SKILL.md` to the consuming project's `.claude/skills/test-ios/SKILL.md` for Claude Code, or `.agents/skills/test-ios/SKILL.md` for Codex. MCP registration is separate. Codex support is best effort.

| Tool | Input | Result |
| --- | --- | --- |
| `start_scenario` | `scenario` script, optional `limits: {maxSteps, wallTimeMs}` | Run ID and local watch URL |
| `get_report` | `runId`, optional `waitMs` up to 45000 | Progress while running; recorded report after completion/interruption |
| `cancel_run` | `runId` | Cancellation request followed by cleanup |

Submit once, then use `get_report` with `waitMs: 45000`. Running replies contain no step-by-step screen evidence for host control. Closing the server cancels its active runs and closes the watch page.

## Evidence and data handling

Artifacts live in `.jev-runs/<run-id>/` in the current directory, or under `JEV_RUNS_DIR`. Directories and files have owner-only permissions, and the bridge writes a `.gitignore` containing `*` into the evidence folder so runs are never committed by accident. Each finished run has a `report.json` beside its `run.jsonl`. Retention is manual. Reports link checkpoint claims/probabilities to observed text, screenshot filenames, and JSONL events. Large reports mark truncation and point to complete local evidence.

TypeSafe receives current observed screen text and assertion claims. Supplied values go to device actions and can subsequently appear in captured text. The host provider sees the submitted script and final report. The API key goes only to TypeSafe: device-layer processes run without it. The API key and exact supplied values are redacted from textual journal content. Transformed values, such as different casing, may not match that literal redaction. Screenshots remain images and can contain visible private data. Screenshots and bounded device log excerpts are not sent to Jev. Use synthetic data for verification and agree on this data flow before using real user information.

The watch server binds to `127.0.0.1` and requires the token in its URL. Each run gets its own token, which opens only that run and only while the server lives. Anyone on the machine with that URL can read that run's evidence during that time. It presents the recorded verdict and screenshots, without streaming video or re-judging outcomes.

After interruption:

```sh
node dist/cli.js report RUN_ID
```

Read from the same evidence root. A journal without a final verdict is inconclusive. This version has no resume or host escalation.
