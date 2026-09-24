# Scripted integration evidence

The frozen assertion gate passed. Real execution now tests the separately reviewed scripts under the same model and assertion thresholds. Corpus repetitions during integration are not new held-out evidence. The environment agent owns the dedicated simulator lease; all device work remains through pinned MobileBuildMCP.

## UUID validation defect found before live execution

The integration CLI's offline test found that the scripted scenario schema accepted an 8-4-4-12 identifier pattern instead of a real 8-4-4-4-12 simulator UUID. The regression failed before the fix and passed afterward. The integrated check then passed type checking, 132 tests, and build. No live model or simulator call was needed to discover the defect.

This change affects scripted device input, not the corpus snapshot schema or assertion requests. The completed evaluation remains unchanged on `feat/scripted-assertion-evidence` at `2ac157a`, with source digest `dbdb58f782d86191a2d35b7a932b0ca9cc38568503d1908c03310795f6c44884`. Do not regenerate its manifest or rerun its held-out cases.

The agent compared every archived assertion request with the fixed implementation offline: all 24 payloads are byte-identical, with aggregate SHA-256 `b80de5ec6d796e77aa70796619f3eaae81ad37edbd750cedbe749aba2842d46c`. The updated implementation digest is `9e73c34e4a1ac75eaaf8773d8774ff52ab25af9dbc87e74e8e330816c6c10b32`. Integration provenance records current source separately from the completed experiment.

## Planned real runs

The environment agent is authoring 12 explicit scripts and separate expected-outcome/setup records. Distribution: Weather two pass/one fail, Contacts two pass/one fail, Reminders one pass/two fail, Diagnostic one pass/two fail. Review guards, target identity, expected screen transitions, and terminal claims before querying. Keep expected outcomes outside the SDK request.

Preserve every attempt, including setup errors, inconclusive results, and model failures. Missing/ambiguous target and cancellation checks are additional cases. Live results, report review, and actual costs will be appended after execution; none are claimed here yet.

## First live attempts and preparation contract

`w01` passed in run `c7aa38eb-1533-404b-9a49-96aebc8c84f2`: one location-button action, one fresh assertion judgment at 0.98, 6,211 input tokens, and successful cleanup. The independent reviewer matched the Locations screenshot, ordered JSONL, report, and metrics.

`w02` stopped inconclusively in run `befc90e6-4e3c-4ec9-a12a-1a7153f4be54`. Its setup capture showed Settings, but the first capture after preparation showed Weather main. The guard rejected this state before any action or Jev request. Zero input tokens were used; cleanup succeeded. This is an authored-script/preparation contract defect, not an assertion-model error. The batch stopped and both attempts remain preserved.

Pinned MobileBuildMCP 2.7.1's [logging launch helper](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/src/utils/simulator-steps.ts) terminates the running process before launching. The launch tool exposes no preserve-process option. Scripts must therefore begin from the observed **post-launch** screen and perform their own navigation. Setup may establish persistent app data and external prerequisites, but cannot promise transient UI navigation across preparation. Contacts and Reminders may restore state differently; inspect their post-launch screens rather than infer behavior from Weather.

Weather w02/w03 will explicitly open Settings from main. The remaining scripts' entry conditions are being checked against actual preparation before the reviewed batch resumes. No threshold, assertion result, or prior failure is being changed.

## Identical Contacts tap aliases

Contacts search exposes Nolan's photo button as two enabled, visible rows without identifiers, with the same label, action set, and frame. The initial resolver rejected the pair. Pinned vendor source shows that both references produce the same coordinate command (`42,132`) in this snapshot. Its only activation-point override depends on the same public frame/role/actions and one global viewport, so parent-path differences do not change the command for this exact predicate.

The implementation therefore adds a provider-specific, tap-only equivalence rule, enabled internally for MobileBuildMCP 2.7.1. Generic resolution remains strict. Different positions, different labels or values, missing metadata, and non-tap operations remain ambiguous. This is a documented expansion of the selector contract based on command equivalence; it does not infer a target from list order or ask Jev to choose. The [source proof](../../spikes/scripted/integration/tap-alias-equivalence.json) preserves the pinned commit, capture hash, public fields, and matching commands.

Contacts scripts replace the unique search field regardless of restored query. The Nolan script will navigate from search through the card into Edit, retaining its original coverage. These execution changes do not alter the validated assertion requests or their recorded outcomes.
