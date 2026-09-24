# Run log: event schema and data handling

Type: grilling
Status: open
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
