# Script version 2 and the do step

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: 03

## What to build

In `src/scripted/schema.ts` and `contracts.ts`: accept `"version": 2` alongside 1. Version 2 = version 1 plus: the `do` step (`id`, `kind: "do"`, `intent` 1–500 chars, `doneWhen` 1–500 chars, `effect` required, optional `values` (keys that must exist in `values`), optional `localOnly`), optional top-level `goal` (1–500 chars) and `start: "restart" | "attach"`. `do` steps have no guard. A version 1 script containing any of these is rejected with a message that says to use version 2. The MCP description schema accepts both. Update `docs/guide/reference/script-format.md` with a version 2 section and one example.

The run loop does not handle `do` steps yet (Issue 07): until then `runScriptedScenario` must refuse a `do` step with a clear internal error, covered by a test.

## Acceptance

- Every v1 test, golden and error message unchanged (version 1 error text stays byte-identical).
- Tests for every v2 rule and message.

## Comments

- 2026-10-01, coordinator, from Issue 03 (merged `2e37294`): values are parsed as written by `parseScriptedScenarioSource` and resolved by `resolveScriptValues` in `BridgeService.start`; `parseScriptedScenario` refuses unresolved values. A `do` step's `values` are keys into the script's `values`. Widen `tests/golden/mcp.json` per the spec's ruling (version 2 + `fromEnv`), at the comment in `scriptedScenarioStructure`.
