# Scripted integration evidence

The frozen assertion gate passed. Real execution now tests the separately reviewed scripts under the same model and assertion thresholds. Corpus repetitions during integration are not new held-out evidence. The environment agent owns the dedicated simulator lease; all device work remains through pinned MobileBuildMCP.

## UUID validation defect found before live execution

The integration CLI's offline test found that the scripted scenario schema accepted an 8-4-4-12 identifier pattern instead of a real 8-4-4-4-12 simulator UUID. The regression failed before the fix and passed afterward. The integrated check then passed type checking, 132 tests, and build. No live model or simulator call was needed to discover the defect.

This change affects scripted device input, not the corpus snapshot schema or assertion requests. The completed evaluation remains unchanged on `feat/scripted-assertion-evidence` at `2ac157a`, with source digest `dbdb58f782d86191a2d35b7a932b0ca9cc38568503d1908c03310795f6c44884`. Do not regenerate its manifest or rerun its held-out cases.

The agent compared every archived assertion request with the fixed implementation offline: all 24 payloads are byte-identical, with aggregate SHA-256 `b80de5ec6d796e77aa70796619f3eaae81ad37edbd750cedbe749aba2842d46c`. The updated implementation digest is `9e73c34e4a1ac75eaaf8773d8774ff52ab25af9dbc87e74e8e330816c6c10b32`. Integration provenance records current source separately from the completed experiment.

## Planned real runs

The environment agent is authoring 12 explicit scripts and separate expected-outcome/setup records. Distribution: Weather two pass/one fail, Contacts two pass/one fail, Reminders one pass/two fail, Diagnostic one pass/two fail. Review guards, target identity, expected screen transitions, and terminal claims before querying. Keep expected outcomes outside the SDK request.

Preserve every attempt, including setup errors, inconclusive results, and model failures. Missing/ambiguous target and cancellation checks are additional cases. Live results, report review, and actual costs will be appended after execution; none are claimed here yet.
