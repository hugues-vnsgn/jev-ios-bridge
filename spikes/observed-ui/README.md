# Observed iOS tap experiment

Run one tap against an unmodified app and check its visible result. This is a
standalone experiment, outside the version 1/2 script formats. It uses the pinned
MobileBuildMCP already in this repository; it needs no new provider interface,
app SDK or Jev key.

Validated on the local navigation fixture using an iPhone 17 simulator on iOS 27.0:
one-action navigation, already-satisfied with no input, and controlled response loss
with restart refusal. See [live evidence](../../.scratch/observed-ui/live/report.md).
This is a bounded fixture result, not a guarantee for every app or runtime.

## Run

Use an already booted, exclusively assigned simulator with your app installed.
Preparation launches the app through MobileBuildMCP. Make the evidence directory's
parent first; the final directory must not exist.

```sh
npm ci
npx tsx spikes/observed-ui/cli.ts /absolute/path/experiment.json /absolute/path/new-evidence
```

Example `experiment.json` (replace the illustrative UDID, bundle ID and selectors):

```json
{
  "experimental": "observed-tap-v1",
  "actionId": "open-details-001",
  "deviceId": "12345678-1234-4234-8234-123456789ABC",
  "app": { "bundleId": "com.example.app" },
  "selector": { "identifier": "details.button" },
  "before": { "present": [{ "identifier": "home.heading" }] },
  "after": { "present": [{ "identifier": "details.heading" }] },
  "timeoutMs": 30000
}
```

Selectors may use existing identifiers, roles and labels; changing the app is not
required. A missing or ambiguous selector refuses input. Guards require visible
positive-area elements and reject truncated observations. Duplicate raw matches
are not collapsed. The deadline includes preparation, observations and the tap.

The runner records the validated request, each usable snapshot and its screenshot,
and a provisional `result.json` in your evidence directory. That artifact has
`authoritative: false` and a `terminalRecord` locator: a slow or failed finalization
can leave it inconsistent with the final outcome. Read the journal's terminal
record for the authoritative result; the CLI prints success only after journal
completion. Snapshot/screenshot agreement is not atomic. The durable journal
retains the intent and final record under
`~/Library/Application Support/jev-ios-bridge/observed-actions`.

## Results

| Result | Meaning |
| --- | --- |
| `outcome_observed` | One bridge tap attempt was acknowledged and the authored visible postcondition was then observed. |
| `already_satisfied` | The postcondition was present before input; no tap was attempted. |
| `refused` | Preconditions, selection or evidence did not permit a tap. |
| `inconclusive` | Preparation, execution or verification could not be confirmed; the device is quarantined for this runner. |

Exit 0 means either of the first two results; exit 2 means refused, inconclusive,
invalid input or failure to complete. A journal admission failure prevents even
app preparation. The result also records whether input was attempted and whether
the device layer acknowledged it. An observed outcome does not prove that the
tap caused it, that the original native recipient was correct, or that a contact
was consumed/released.

The experimental driver issues one MobileBuildMCP `touch` request with down/up
and a 50ms hold; the selected element must advertise both tap and touch. This
replaces the semantic tap path that acknowledged without activating the live
SwiftUI link. Ordinary Bridge actions retain their previous behavior.

There is no automatic retap, including after stale-reference errors. The claim is
at most one bridge tap submission, not exactly one downstream touch. Completed
action IDs cannot be reused on that device. An unfinished attempt, cancellation,
lost reply or uncertain result blocks new attempts on the device permanently in
this journal. Do not delete its journal to retry; select a different dedicated
device and reconcile any external effects before repeating the business action.
The runner does not provision, shut down or delete devices, and quarantine does
not stop native work or undo remote effects. Other automation tools do not read
this journal, so device exclusivity remains an operating prerequisite.

## Evidence limits

The response-loss experiment withheld an actual successful driver response at the
host wrapper; it did not induce native transport failure. Additional post-action
captures in that case belong to the fault harness. The runner still recorded
uncertainty, and a fresh process issued zero backend commands on the quarantined
device. The historical native-study device was not touched.

Production script/MCP integration and broader app/runtime coverage remain future
work. The experiment does not claim native ownership or contact release.
