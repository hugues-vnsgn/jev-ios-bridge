---
status: accepted
date: 2026-09-25
---

# The 1.0 stability contract

v1.0.0 promises stability for four surfaces: the script format, the MCP tools and CLI, verdict semantics ([ADR-0004](0004-fixed-assertion-bounds-single-judgment.md)), and the report and evidence layout. The owner fixed their shape in [The 1.0 stable contract](../../.scratch/v1-release/issues/08-stable-contract.md). The code review found none of them versioned in v0.1.0 ([review](../../.scratch/v1-release/code-review.md)).

- **Scripts carry a required `"version": 1`.** A script without it is rejected with a message telling the author to add it, not silently read as version 1. v0.1.0 was a prerelease, so the fix costs its few users one line.
- **The frozen report is `report.json`, not the prose.** A versioned JSON report in the run's evidence folder records the verdict, reason, claims and probabilities, evidence file names, Jev model, and bridge version. `run --json` prints it. The prose report stays free to improve. MCP keeps returning prose plus the evidence path, because Claude Code hides structured tool output from the model.
- **The bridge owns its vocabularies.** Reason codes are a fixed, documented list; an unknown MobileBuildMCP code becomes `DEVICE_ERROR`, with the vendor code kept as detail. Selector roles are a documented list the bridge owns; today it equals MobileBuildMCP's strings, and the driver translates if the vendor renames one. A MobileBuildMCP release therefore can't change the contract.
- **CLI exit codes:** 0 passed, 1 failed, 2 inconclusive, 3 could not start. 130 and 143 are documented for signals. `report` returns the same codes as `run`.
- **Evidence:** the folder location, the file names (`run.jsonl`, `report.json`, `screen-N.*`), the JSONL envelope, the event type names, and the `verdict` event are frozen. Other event payloads, the watch page, the lock location, and the device driver interface are not, so tuning and the log pane can change them.
- **Semantic versioning:** 1.x may add optional fields, step kinds, reason codes, report fields, and event types, and readers ignore unknown fields. Renaming, removing, or changing the meaning of anything frozen, or invalidating a valid script, needs 2.0.
- **Pinned dependencies:** MobileBuildMCP stays pinned. A new version is adopted when the contract tests pass and the three benchmark scripts keep their verdicts on one run each, and it ships as a minor release. The Jev model follows ADR-0004's corpus gate.
- **Golden-file contract tests** guard all of the above, and every release must pass them.

Considered and rejected: freezing the prose report (it would stop wording improvements), treating roles and reason codes as vendor passthrough (every upgrade would risk a silent break), and accepting unversioned scripts (a guess that would outlive the prerelease).
