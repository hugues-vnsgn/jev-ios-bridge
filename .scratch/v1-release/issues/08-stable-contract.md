# The 1.0 stable contract

Type: grilling
Status: open
Blocked by: 02, 05, 07

## Question

Exactly what does 1.0 freeze, and what must change before the freeze? The owner put four surfaces under the promise: a versioned script format, MCP tools plus CLI and exit codes, verdict semantics, and the report and evidence layout. Using the surface inventory from "Code and design review", decide for each:

- the concrete shape frozen (the script `version` field name and value, tool schemas, report fields, evidence file names);
- the breaking changes to make now, while they are still cheap (renames, removed legacy forms, missing fields);
- what the promise explicitly does not cover (report prose, watch-page HTML, internal JSONL fields);
- how compatibility is tested, so Codex can gate the release on it.

Offer an ADR if the result meets the domain-modeling bar.
