# Reports and logs

Retrieve a real run's verdict and evidence, follow its app output, and watch progress while the owning bridge process remains alive.

## Sub-features

- `report-json` retrieves the stable JSON report without changing its stored verdict.
- `report-text` retrieves the prose report and its evidence references.
- `report-logs` follows live app output or explains that a recorded run has stopped.
- `report-watch` shows progress and terminal state on the run's local watch page.
- `report-unknown` refuses an unknown ID, covered by the main skill's smoke helper.

## How to get to it (user POV)

Run `report <run-id> [--json]` or `logs <run-id>`. MCP users call `get_report`. Open the `watchUrl` returned by `start_scenario` or printed to stderr by CLI `run` while its process is alive.

## Driving it with the CLI and MCP

Preconditions:

- Use `bridge_root`, `proof_project`, and `proof_runs` from an actual [scripted run](scripted.md). Set `run_id` to its returned `runId`.
- Completed-report retrieval needs no key or device. MCP retrieval needs a client connected to a server with the same `JEV_RUNS_DIR`.
- Live logs/watch need an active owned run. Use an MCP run to keep the watch server alive through terminal-page capture.

- **Retrieve JSON and prose.** Record the exact commands below and each exit code. For the diagnostic failure, both return 1. If the shell exits on errors, capture the expected nonzero statuses explicitly.

```sh
JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node "$bridge_root/dist/cli.js" report "$run_id" --json
JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node "$bridge_root/dist/cli.js" report "$run_id"
```

Require JSON `runId`, `verdict: failed`, and `reason: ASSERTION_FALSE` to match `$proof_runs/$run_id/report.json`. Compare the whole JSON semantically. Require the prose to identify the same run, failed verdict, reason, checkpoint, and screenshot/event references. Hash the stored report before and after retrieval and require no change. Exit codes are 0 for passed, 1 for failed, 2 for inconclusive or interrupted, and 3 for an unknown run.

- **Read recorded logs.** After the owning run and pane have stopped, run the command below. Require exit 0 and `Run <run-id> is not running, so there is no live log to follow.` It may also list the app log files. Inspect the actual files named by `prepared.data.logSources` without uploading private content.

```sh
JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node "$bridge_root/dist/cli.js" logs "$run_id"
```

- **Read MCP.** Call `get_report` with `{runId: run_id, waitMs: 1000}`. Its text block starts with `Status: running` during progress and `Status: finished` when terminal. The terminal prose must match the stored verdict and reason. `get_report` returns prose, not the frozen JSON object.
- **Follow live logs.** Start `logs "$run_id"` with the same project/runs environment while the owned run is active. Capture app output and the terminal verdict, then stop only this follower if it remains open after failure. A quiet app may provide no log lines. Record that precondition gap without treating a stopped-run notice as live-log proof.
- **Watch progress.** Open the exact returned watch URL while its owning process is alive. Capture an intermediate step and the terminal page, with their screenshots and checkpoint result. Compare them with `run.jsonl`. Preserve the token locally. Keep the MCP connection open until both captures finish.

## Gotchas

- `get_report` progress is not a terminal result. `Status: interrupted` means the event log has no verdict. CLI JSON retrieval reconstructs `inconclusive` / `INTERRUPTED` in that case, and no persisted `report.json` may exist.
- The watch URL is token-scoped to one run and stops working when its process exits. A finished CLI process cannot provide later watch-page proof.
- App log files and screenshots can contain unmasked text. `--no-log-pane` suppresses the window, not evidence or log collection. `--no-log-pane` on `report` is invalid and exits 3.
- Missing prior live evidence blocks successful retrieval proof. A fabricated report or unknown-ID refusal cannot replace it.
- Starting a new live iOS run for logs or watch writes real admission authority and needs owner approval. Retrieving an existing scripted report does not grant that approval.
