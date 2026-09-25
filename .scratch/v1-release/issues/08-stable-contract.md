# The 1.0 stable contract

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 02, 05, 07

## Question

Exactly what does 1.0 freeze, and what must change before the freeze? The owner put four surfaces under the promise: a versioned script format, MCP tools plus CLI and exit codes, verdict semantics, and the report and evidence layout. Using the surface inventory from "Code and design review", decide for each:

- the concrete shape frozen (the script `version` field name and value, tool schemas, report fields, evidence file names);
- the breaking changes to make now, while they are still cheap (renames, removed legacy forms, missing fields);
- what the promise explicitly does not cover (report prose, watch-page HTML, internal JSONL fields);
- how compatibility is tested, so Codex can gate the release on it.

Offer an ADR if the result meets the domain-modeling bar.

## Answer

Decided with the owner on 2026-09-25, from the surface inventory in [`code-review.md`](../code-review.md). Recorded as [ADR-0005](../../../docs/adr/0005-the-1-0-stability-contract.md).

1. **Script format:** a required `"version": 1`. Unversioned scripts are rejected with a message telling the author to add it.
2. **Report:** a versioned `report.json` in the evidence folder is the frozen report. It holds the verdict, reason, checkpoints, claims with probabilities, evidence file names, Jev model, and bridge version. The CLI gains `run --json`. The prose report isn't frozen. MCP `get_report` keeps returning prose plus the evidence path. `start_scenario`'s `{runId, watchUrl}` reply is frozen.
3. **Reason codes:** a fixed, documented list. An unknown MobileBuildMCP code becomes `DEVICE_ERROR`, with the vendor code kept as detail. The service fallback gets its own code.
4. **Roles:** a documented list of role names the bridge owns (today equal to MobileBuildMCP's strings). The driver translates any vendor rename.
5. **CLI:**
   - exit codes: `0` passed, `1` failed, `2` inconclusive, `3` could not start (bad script, missing key, no simulator);
   - `130` and `143` documented for SIGINT and SIGTERM;
   - `report <id>` returns the same codes as `run`;
   - schema errors are printed, not collapsed into one generic line.
6. **Evidence layout:**
   - **Frozen:** `${JEV_RUNS_DIR:-$PWD/.jev-runs}/<run-id>/`; the file names `run.jsonl`, `report.json`, and `screen-N.(jpg|png)`; the JSONL envelope; the event type names; and the `verdict` event's fields.
   - **Not frozen:** other event payloads, report prose, the watch page, the lock location, and the device driver interface (which tuning option B changes).
7. **Breaking changes:**
   - **Allowed in 1.x:** new optional script fields, step kinds, reason codes, report fields, and event types. Readers must ignore unknown fields.
   - **Needs 2.0:** renaming or removing anything frozen, changing a code's or verdict's meaning, changing the 0.9/0.1 bounds, or invalidating a previously valid script.
8. **MobileBuildMCP upgrades:** it stays pinned. A new version is adopted when the contract tests pass and the Weather, Contacts, and Reminders scripts keep their verdicts on one run each, and it ships as a minor release.
9. **Contract tests:** a golden-file suite covering accepted and rejected scripts with exact error messages, MCP tool input shapes and the `start_scenario` reply, the `report.json` shape, CLI exit codes, and the role and reason-code lists. A deliberate change must update the golden files. 1.0 and every later release must pass the suite.
10. **New 1.0 requirement, from Q6:** a live log pane showing the app's own output (like Xcode's console), opened automatically in a new terminal window when a run starts. Its design is the "Live log pane" ticket. It reads non-frozen internals, so the contract doesn't grow.

The version string moves to one source (`package.json`), replacing the copies in `cli.ts` and `mcp/index.ts`. Bridge version, Jev model, and observation projection rule go in the `started` or `verdict` event and in `report.json`.
