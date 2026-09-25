# Run log: event schema and data handling

Type: grilling
Status: resolved
Blocked by: 09, 11, 12

## Question

What does the bridge record about a run, and what leaves the machine? Decide:

- **The event schema.** The report, the progress line, and the watch view all read these events:
  - step;
  - observation summary;
  - Jev's questions and answers, with probabilities;
  - action;
  - escalation, if "Step-loop policy: limits, thresholds, stop rules, escalation" adopts it;
  - build stage;
  - log pointers;
  - verdict.
- **Format and location:** one JSONL file per run. Decide where it lives and how long it is kept.
- **Artifacts:** which screenshots and Jev payloads are stored.
- **Redaction:** typed values, such as passwords, sit in Jev's state and in the SDK's debug logs.
- **What leaves the machine:**
  - screen text and typed values go to TypeSafe;
  - the scenario and the report go to the host model's provider, like everything the host agent reads.

  Decide what a team must agree to before pointing the bridge at an app that shows real user data.

## Answer

Keep versioned append-only JSONL in `.jev-runs/<run-id>/`, overridable by JEV_RUNS_DIR. Use ordered sequences, fsync writes, owner-only directories/files, and exclusive run IDs. Retain artifacts until the owner deletes them; there is no automatic retention cleanup. Preserve readable earlier events after an incomplete final line, and reject corrupt middle records.

Record started/prepared, observed steps and wait polls, actions, Noul probabilities and claims, checkpoint results, errors, and the policy verdict, with phase timings, input usage and reference counters. Store copied screenshots and redacted assertion observations alongside bounded app-log tails. There are no build stages, Choice answers, completion judgments, or escalation events in the supported scripted path. The final recorded verdict is authoritative for report and watch; an interrupted log never becomes a pass.

Redact supplied values and the API key from text without corrupting structural fields or verdict enums. Screenshots remain private images, not text-redacted assets. TypeSafe receives observed screen text and current claims; typed values can appear there after entry. The host provider receives the submitted script and final report. SDK debug logging stays off, and MobileBuild telemetry is disabled. Teams must agree on that data flow before using real user data; the validation corpus uses synthetic fixtures. Production fixes the proven 48-row summary truncation without changing model input, retaining full local assertion evidence and labelled report excerpts. See [production integration](../scripted-production-plan.md).

Final review reproduced structural corruption when a short supplied value appeared inside `scripted`, `tap`, or authored IDs. The correction preserves only known generated protocol values and uses consistent per-run keyed pseudonyms for sensitive authored IDs and probability keys. Distinct sensitive IDs remain distinct, while claims, observations, selector text, and unknown fields retain literal redaction. Single-pass replacement also avoids recursively redacting its own marker. The regressions must pass in the final integrated check.
