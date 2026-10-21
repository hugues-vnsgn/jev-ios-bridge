# Observed actions, experimental

Submit one authored tap on a prepared iOS simulator allocation and inspect visible before/after predicates. Observed outcomes have their own version 1 contract and do not use Jev verdicts.

## Sub-features

- `observed-prepare` reserves one action identity and prepares a dedicated retained allocation.
- `observed-action` binds one tap request and records its visible outcome.
- `observed-read` retrieves authoritative allocation/action snapshots by their original IDs.
- `observed-cancel` cancels an action or preparation with bounded local finalization.
- `observed-retire` retires ready unused stock without deleting or reusing a device.
- `observed-mcp` exposes the equivalent allocation/action tools over stdio.

## How to get to it (user POV)

Use the CLI commands below or their MCP equivalents. Read `docs/guide/14-observed-actions.md` and `docs/guide/reference/observed-format.md` before this branch.

| CLI command | MCP tool and arguments |
| --- | --- |
| `observed-allocate allocation-request.json --json` | `prepare_observed_allocation` with the allocation request itself |
| `observed-allocation ID --json --wait-ms 45000` | `get_observed_allocation` with `{allocationId, waitMs: 45000}` |
| `observed-allocation-cancel ID --json` | `cancel_observed_allocation` with `{allocationId}` |
| `observed-retire ID --json` | `retire_observed_allocation` with `{allocationId}` |
| `observed-action action-request.json --json` | `start_observed_action` with the action request itself |
| `observed-report ID --json --wait-ms 45000` | `get_observed_action` with `{actionId, waitMs: 45000}` |
| `observed-cancel ID --json` | `cancel_observed_action` with `{actionId}` |

## Driving it with the CLI and MCP

Preconditions:

- Hard gate. Obtain the owner's explicit go-ahead before any real observed operation or admission maintenance. Without that approval, stop at source/schema checks and report this entire live branch as owner-gated.
- After approval, complete the offline migration of the real per-user admission store using the declaration/inventory process in `docs/guide/14-observed-actions.md`. Only the owner can attest that old writers stopped and historical roots were declared or devices excluded. Do not infer those assertions from this checkout.
- Complete Launch and Doctor. Use Node 24 or newer, compatible Xcode at `/Applications/Xcode.app`, sufficient retained-allocation capacity/storage, and explicit installed simulator device-type/runtime IDs.
- Obtain an unchanged simulator-compatible build of `examples/diagnostic-app` with bundle ID `dev.jevbridge.diagnostic`. Record its absolute `.app` path as `artifact_path`, its provenance as `build_id` and `build_origin`, and the installed IDs as `device_type_id` and `runtime_id`. The repo supplies source, not a ready binary or migration inventory.
- Set `action_id` once for this distinct authorized business action before preparation. Preserve it and the exact requests across lost replies. Set `bridge_root`, `proof_project`, and `proof_runs` to the task's absolute paths. No Jev key is needed.

- **Write the allocation request after approval.** This recipe uses the actual diagnostic identifiers. Resolve every input above from the approved artifact/host, then create a private request. Preparation stages the artifact and creates, boots, installs, and launches once.

```sh
umask 077
mkdir -p "$proof_runs"
python3 - "$action_id" "$device_type_id" "$runtime_id" "$artifact_path" \
  "$build_id" "$build_origin" "$proof_runs/allocation-request.json" <<'PY'
import json, pathlib, sys
request = {
    "version": 1, "actionId": sys.argv[1],
    "source": {"kind": "create", "deviceTypeId": sys.argv[2], "runtimeId": sys.argv[3]},
    "app": {"artifactPath": sys.argv[4], "bundleId": "dev.jevbridge.diagnostic",
            "build": {"id": sys.argv[5], "origin": sys.argv[6]}},
    "timeoutMs": 360000
}
pathlib.Path(sys.argv[7]).write_text(json.dumps(request) + "\n")
PY
JEV_EXPERIMENTAL_OBSERVED=1 JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node "$bridge_root/dist/cli.js" observed-allocate "$proof_runs/allocation-request.json" --json
```

Retain stdout, stderr, and exit separately. Require committed authority, `state: ready`, `outcome: prepared`, readiness evidence, and exit 0. Record the generated `allocationId` as `allocation_id`. If preparation remains active, retrieve that same ID with `observed-allocation "$allocation_id" --json --wait-ms 45000` under the same project/runs environment. Do not start the action before committed readiness.

- **Author the tap.** For the newly launched diagnostic, require before `Selected: None` and after `Selected: Apple`. Write the action with the original action identity and returned allocation ID.

```sh
python3 - "$action_id" "$allocation_id" "$proof_runs/action-request.json" <<'PY'
import json, pathlib, sys
request = {
    "version": 1, "actionId": sys.argv[1], "allocationId": sys.argv[2],
    "app": {"bundleId": "dev.jevbridge.diagnostic"},
    "action": {"kind": "tap", "selector": {"role": "button", "identifier": "choose.apple"}},
    "before": {"present": [{"identifier": "selection.summary", "label": "Selected: None"}]},
    "after": {"present": [{"identifier": "selection.summary", "label": "Selected: Apple"}]},
    "timeoutMs": 10000
}
pathlib.Path(sys.argv[3]).write_text(json.dumps(request) + "\n")
PY
JEV_EXPERIMENTAL_OBSERVED=1 JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node "$bridge_root/dist/cli.js" observed-action "$proof_runs/action-request.json" --json
```

Require exit 0 with `state: terminal`, `authority: committed`, `outcome: outcome_observed`, null reason, and both `actionAttempted` and `actionAcknowledged` true. Inspect the returned observation files for the before/after selection. `already_satisfied` also exits 0 but does not prove this tap occurred.

- **Retrieve the same action.** Use the original IDs and environment. CLI action already waits for terminal or unresolved authority. Save retrieval separately and compare immutable identity and committed outcome while also recording current admission/allocation state.

```sh
JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node "$bridge_root/dist/cli.js" observed-report "$action_id" --json --wait-ms 45000
JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node "$bridge_root/dist/cli.js" observed-allocation "$allocation_id" --json --wait-ms 45000
```

Require action `disposition: retrieved`. Retain the absolute evidence pointers under `$proof_runs/observed/$action_id/`, including `request.json`, `observation-N.json`, optional JPEGs, and the committed `terminal.json` export. `provisional-result.json` cannot establish success. An export failure is an evidence gap even when authority committed.

- **Use MCP separately when affected.** Launch the built stdio server with `JEV_EXPERIMENTAL_OBSERVED=1` and the same project/runs environment, without an env-file or key. Initialize and discover all seven tools in the table. Pass the parsed requests directly, without a `scenario` wrapper. `start_observed_action` returns a snapshot immediately, so poll `get_observed_action` by the returned/original IDs. Each response has a visible summary and complete JSON in its second text block. Tool `isError` marks operation errors, not committed refused/inconclusive outcomes. Use a separately authorized business action for a new drive. Reusing the CLI request only proves retrieval.
- **Cancel or retire only the appropriate owned case.** Call `observed-cancel "$action_id" --json` for an active action, `observed-allocation-cancel "$allocation_id" --json` for preparation, and `observed-retire "$allocation_id" --json` for ready unused stock. Keep the same project/runs environment. Separate active-cancellation and unused-retirement journeys require separately approved cases. On a terminal action they retrieve and do not prove active cancellation. `ALLOCATION_BUSY` directs preparation cancellation when preparing and action cancellation when executing. Require retained authority/evidence and at most the bounded five-second local-finalization wait, without claiming native release.

## Gotchas

- Hard gate. Observed prepare/start needs offline migration of the real per-user admission store and the exact switch `JEV_EXPERIMENTAL_OBSERVED=1`. Do not drive this feature without the owner's go-ahead. `true` does not enable it. Reads, cancellation, and retirement remain available when disabled but still open real authority, so they need the same owner approval.
- The real store is `~/Library/Application Support/jev-ios-bridge/admission`. Changing HOME, cwd, worktree, `JEV_PROJECT_DIR`, or `JEV_RUNS_DIR` does not create an isolated admission domain. Never use migration/preflight on that store as a doctor check.
- Missing owner attestation, historical inventory, compatible built artifact, runtime/device type, capacity, or storage is an unmet precondition. Preserve it in the result instead of inventing a declaration, adopting an arbitrary simulator, or using another source after uncertainty. Supplied inventory requires its own provenance and freshness/exclusivity attestation.
- After reply loss, retrieve with the same IDs or resubmit the exact original request. Changed input conflicts with `ACTION_ID_CONFLICT`; replacement allocation or a renamed business action can defeat the intended identity guarantee.
- Action exits are 0 for committed `outcome_observed` or `already_satisfied`, 2 for inconclusive/active/finalizing/unresolved, and 3 for refused/operation error. Allocation exits are 0 for committed `prepared`, `action_completed`, or `retired_unused`, 3 for refused/error, and 2 otherwise. Exit 1 is reserved for legacy failed verdicts.
- Unknown work retains quarantine and capacity. Devices are retained even on success. Retirement changes metadata and never deletes, shuts down, erases, or reuses the device. Keep evidence and claims intact through cleanup.
- Cancellation prevents later dispatch authorization, but already authorized input may still act. Stopping a read or its transport does not cancel the action. Acknowledgement and visible predicates do not certify native input consumption, causality, settlement, or release.
- Observed has no Jev call, scripted `report.json` conversion, watch page, or log pane. Keep its proof separate from scripted report coverage. Whole host/live acceptance and supplied-source live operation remain unverified by this recipe's source audit.
