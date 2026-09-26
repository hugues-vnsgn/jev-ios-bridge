# `report.json`

Each finished run writes `report.json` into its evidence folder. `run --json` and `report <run-id> --json` print it. The shape is frozen for 1.x: fields may be added, never renamed or removed. Ignore fields you don't know.

| Field | Type | Meaning |
| --- | --- | --- |
| `reportVersion` | `1` | Version of this shape. |
| `runId` | string | The run's ID, which is also its folder name. |
| `bridgeVersion` | string | The bridge version that ran it. |
| `jevModel` | string or null | The Jev model that judged it, such as `jev-1.13.0`. |
| `projectionRule` | string or null | The shape of the screen text sent to Jev, such as `visible-full-text-v2`. |
| `bundleId` | string or null | The app under test. |
| `launchArgs` | array of strings | Arguments the app was launched with; empty when none. |
| `verdict` | `passed`, `failed`, or `inconclusive` | The recorded verdict. |
| `reason` | string | A [reason code](reason-codes.md). |
| `error` | object or null | The last error: `code` (a reason code), `phase`, `stepId`, and `vendorCode` when MobileBuildMCP supplied its own code. |
| `steps` | number | Steps executed. |
| `plannedSteps` | number or null | Steps in the script. |
| `checkpointsPassed` | number | Checkpoints that passed. |
| `checkpointCount` | number or null | Checkpoints in the script. |
| `inputTokens` | number | Jev input tokens used. |
| `durationMs` | number | Run duration, from start to verdict. |
| `startedAt`, `finishedAt` | ISO 8601 string (`finishedAt` may be null) | When the run started and when its verdict was recorded. |
| `checkpoints` | array | Each judged checkpoint: `stepId`; `status`; `claims`, each with `id`, `claim`, and `probability`; `screenshot`, a file name or null; `evidenceEvent`, the `run.jsonl` sequence number of the judged observation, or null. |
| `evidence` | object | `log` (`"run.jsonl"`) and `screenshots` (file names). |

A run whose process stopped before recording a verdict has no `report.json`. For such a run, `report <run-id> --json` builds one with verdict `inconclusive` and reason `INTERRUPTED`.

Values from the script are masked in `claims` and `stepId`s the same way as in `run.jsonl`.

## Example

```json
{
  "reportVersion": 1,
  "runId": "ce20619a-bc4f-440d-9e99-d05df89cbd45",
  "bridgeVersion": "1.0.0",
  "jevModel": "jev-1.13.0",
  "projectionRule": "visible-full-text-v2",
  "bundleId": "dev.jevbridge.diagnostic",
  "launchArgs": [],
  "verdict": "failed",
  "reason": "ASSERTION_FALSE",
  "error": null,
  "steps": 4,
  "plannedSteps": 4,
  "checkpointsPassed": 0,
  "checkpointCount": 1,
  "inputTokens": 1157,
  "durationMs": 10792,
  "startedAt": "2026-09-26T06:27:59.702Z",
  "finishedAt": "2026-09-26T06:28:10.494Z",
  "checkpoints": [
    { "stepId": "verify", "status": "failed",
      "claims": [{ "id": "total", "claim": "The Order complete confirmation shows Total: $5.", "probability": 0.02 }],
      "screenshot": "screen-9.jpg", "evidenceEvent": 9 }
  ],
  "evidence": { "log": "run.jsonl", "screenshots": ["screen-3.jpg", "screen-5.jpg", "screen-7.jpg", "screen-9.jpg"] }
}
```
