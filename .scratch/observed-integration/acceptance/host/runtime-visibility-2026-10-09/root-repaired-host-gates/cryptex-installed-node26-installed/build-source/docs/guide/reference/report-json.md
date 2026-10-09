# `report.json`

Each finished run writes `report.json` into its evidence folder. `run --json` and `report <run-id> --json` print it. The shape is frozen for 1.x: fields may be added, never renamed or removed. Ignore fields you don't know.

| Field | Type | Meaning |
| --- | --- | --- |
| `reportVersion` | `1` | Version of this shape. |
| `runId` | string | The run's ID, which is also its folder name. |
| `bridgeVersion` | string | The bridge version that ran it. |
| `jevModel` | string or null | The Jev model that judged it, such as `jev-1.13.0`. |
| `projectionRule` | string or null | The shape of the screen text sent to Jev, such as `visible-full-text-v2` (iOS) or `android-full-text-v1` (Android). |
| `bundleId` | string or null | The app under test on iOS. `null` on Android, which has `package` instead. |
| `launchArgs` | array of strings | Arguments the app was launched with; empty when none, and always empty on Android. |
| `verdict` | `passed`, `failed`, or `inconclusive` | The recorded verdict. |
| `reason` | string | A [reason code](reason-codes.md). |
| `error` | object or null | The last error: `code` (a reason code), `phase`, `stepId`, and `vendorCode` when MobileBuildMCP supplied its own code, or on Android, `adb` or `agent` for the part that failed. |
| `steps` | number | Steps executed. |
| `plannedSteps` | number or null | Steps in the script. |
| `checkpointsPassed` | number | Checkpoints that passed. |
| `checkpointCount` | number or null | Checkpoints in the script. |
| `inputTokens` | number | Jev input tokens used. |
| `durationMs` | number | Run duration, from start to verdict. |
| `startedAt`, `finishedAt` | ISO 8601 string (`finishedAt` may be null) | When the run started and when its verdict was recorded. |
| `checkpoints` | array | Each judged checkpoint: `stepId`; `status`; `claims`, each with `id`, `claim`, and `probability`; `screenshot`, a file name or null; `evidenceEvent`, the `run.jsonl` sequence number of the judged observation, or null. |
| `evidence` | object | `log` (`"run.jsonl"`) and `screenshots` (file names). |

Android runs add these fields, recorded from the run's `started` and `action` events. iOS reports never have them, so a report without `platform` is an iOS run's.

| Field | Type | Meaning |
| --- | --- | --- |
| `platform` | `"android"` | Marks an Android run. |
| `package` | string | The app under test: the script's `app.package`. |
| `activity` | string or null | The script's `app.activity`, or `null` when the launcher activity started. |
| `intentExtras` | object: string → string | The script's `app.intentExtras`; `{}` when none. |
| `typedFields` | array | Only when the run typed: one `{ "stepId", "shownValue" }` per replace-text step, with the field's text as the screen showed it after typing. A password field's shown value is dots. Script values in it are masked. |

## Runs with `do` steps

A run whose script has a `do` step ([driven steps](../13-driven-steps.md), experimental) adds one field. Other runs never have it.

| Field | Type | Meaning |
| --- | --- | --- |
| `driven` | object | What happened in the driven steps, with the fields below. |
| `start` | `"restart"` or `"attach"` | The script's start mode; `restart` when it names none. |
| `preflight` | object or null | The project preflight: `status` (`ok`, `missing` or `failed`), `exitCode` (a number or null), `failure` on a failed one (`exit`, `timeout`, `spawn`, or `cleanup` when a process it started couldn't be stopped), and `durationMs`. `null` when no `test_write` step ran it. Its output is never recorded. |
| `decisions` | number | Jev decision calls in the run. |
| `decisionInputTokens` | number | Input tokens those calls used. `inputTokens` counts them too. |
| `actions` | array | Every action performed, in order: `stepId`, `action` (`tap`, `type`, `scroll`, `back`, `tapAt`, or a script step's own kind), the target or arguments it had (`ref`, `valueKey`, `direction`, `x` and `y`), and `decidedBy`: `script`, `jev`, `claude`, or `bridge` for the scrolls of the target search, which add `changed`, whether the scroll changed the screen. A tap or type in a `do` step adds `target`, the element by `role`, `label` and `identifier`, with typed values shown as `⟦value:<key>⟧`: a `ref` names an element in one capture only. A Jev action adds `key`, the option Jev chose, and `confidence`. `retry: true` marks the one retry of an action that left the screen unchanged. |
| `doSteps` | array | Every `do` step that ran, in order; a step run again after a revision is listed again. `stepId`, and `completedBy`: `jev` when Jev's done check ended it (with `done`, its step-done probability), `claude` when Claude answered `done`, or null when it ended without being done (stopped, revised, timed out, `STEP_NOT_DONE`, or still running). |
| `handbacks` | array | Every pause for Claude, in order: `stepId`; `reason` (see [why a step was handed back](../13-driven-steps.md#why-a-step-was-handed-back)); `answer`, Claude's answer kind, or null when none came; `waitMs`, from the pause to the answer, or null; and `event`, the `run.jsonl` sequence number of the `handback` event. |

The device the run used isn't in `report.json`. On Android, the `prepared` event in `run.jsonl` records it: the device identity, the serial, the device agent's SHA-256, and `sweptLeftovers: true` when the run cleared a crashed run's leftovers. The prose report names them too.

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
