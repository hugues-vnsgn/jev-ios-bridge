# Typed values from environment variables

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: none

## What to build

Exactly [live-test issue 02](../../../live-test-v1.2/issues/02-typed-values-from-environment-variables.md): a `values` entry may be `{ "fromEnv": "NAME" }`; resolve once in `BridgeService.start` before `createRunLog`, pass resolved strings to the redactor, the log pane masker and the run's `actionContext` (handle the second parse in `runScriptedScenario`); platform value rules run on the resolved value; a missing variable fails with `MISSING_VALUE` naming the variable before any device action; CLI pre-check too. Over MCP the variable comes from the server's environment: document it.

## Acceptance

As in the live-test issue, including extending the whole-evidence leak test so a `fromEnv` value never appears in the script, `run.jsonl`, `report.json`, the watch page, the log pane or MCP output.
