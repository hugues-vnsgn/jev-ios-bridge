# Ordered checkpoints for a full Weather run

Status: proposal for [Scenario language](issues/10-scenario-language.md) and [Step-loop policy](issues/11-step-loop-policy.md), after ticket 18's revised feasibility gate. No checkpoint behavior is implemented by this document.

The current scenario has one `goal` and one set of assertions judged against the final screen. That cannot prove a Weather run visited and verified Settings, returned to Home, and then opened a detail screen: a final detail screenshot says nothing reliable about what held on Settings earlier. Keep the existing single-goal form. Add one ordered form whose checkpoint results are recorded as the run proceeds.

## Proposed input contract

```ts
type BaseScenario = {
  app: { bundleId: string };
  values: Record<string, string>;
  preconditions?: string[];
  device?: { udid?: string };
};

type Scenario = BaseScenario & (
  | { goal: string; assertions: Assertion[]; checkpoints?: never }
  | { checkpoints: Array<{ id: string; goal: string; assertions: Assertion[] }>;
      goal?: never; assertions?: never }
);
```

Require 2 to 10 checkpoints, unique checkpoint IDs, and at least one assertion per checkpoint. Keep the current goal, assertion, and typed-value length limits. **Reject** a payload that mixes root `goal` or `assertions` with `checkpoints`; no field may be silently ignored. A legacy scenario remains byte-for-byte valid and behaves as one implicit checkpoint internally. Assertion IDs may be scoped to a checkpoint in the request but log keys must include the checkpoint ID to avoid collisions.

For the Weather benchmark, the checkpoint goals are: verify the selected units on Settings; return to and verify Home; open and verify the detail screen. Each checkpoint's actual assertions must come from the benchmark oracle and captured app behavior before use. For example, Settings can prove Fahrenheit, km/h, and hPa selections. A later Home or detail assertion must state what that screen itself shows; the bridge must not infer an earlier Settings proof from it.

## Run semantics

One run prepares one device and app once, keeps one run log and watch URL, and closes the driver once. The existing wall-clock and step limits apply to the **whole run**, not separately to each checkpoint. The controller asks Jev only about the active checkpoint's goal and assertions, using the existing one Choice plus independent Nouls. Bounded history can mention completed checkpoint proofs; future assertions are not sent as if they were current claims.

When `stop-goal` passes the active completion and assertion gates, the bridge appends a `checkpoint` event with its ID and index, the decisive step and snapshot reference, the judgment probabilities, and the evidence path already recorded by that step. It then advances the index and takes a **new** observation before the next judgment. No device action uses a reference from the completed checkpoint. A false assertion at a completed goal fails the run under the bridge's policy; an uncertain judgment, blocker, cancellation, or global limit leaves it inconclusive according to ticket 11's settled rules. Earlier checkpoint proofs remain in the log in either case.

Only the bridge assigns the final verdict. `passed` requires a recorded pass for every checkpoint in order. The report and watch view present those events and the final verdict from the run log; they do not re-judge screens or reconstruct a pass from the final image. An interrupted journal with earlier checkpoint events and no final verdict remains inconclusive. The event can extend the current versioned `RunEvent` schema after ticket 13 settles its data shape.

## Regression cases before implementation

| Case | Required observation |
| --- | --- |
| Legacy one-goal scenario | Existing JSON parses and reaches the same verdict with one prepare and close. |
| Mixed or malformed input | Root assertions plus checkpoints, duplicate IDs, empty checkpoint assertions, or one checkpoint are rejected before device work. |
| Two successful checkpoints | `checkpoint` events appear in order, each names its own observation and judgment; final pass appears only after the second. |
| Premature completion | `stop-goal` at checkpoint one advances only to checkpoint two; it never passes the run. |
| Failed or uncertain first checkpoint | Final failed or inconclusive policy is recorded; checkpoint two is never judged. |
| Cancellation between checkpoints | First proof remains readable, final verdict is inconclusive, and driver cleanup occurs once. |
| Global budget at a boundary | Steps and wall time consumed in checkpoint one reduce what remains for checkpoint two; no reset is possible. |
| Replay from JSONL | Report and watch view show the same ordered proofs after the server restarts, without consulting Jev. |

This is a ticket 10/11 decision after revised feasibility evidence. It does not change the first or second feasibility corpus, its numerical bar, or the current release gate.
