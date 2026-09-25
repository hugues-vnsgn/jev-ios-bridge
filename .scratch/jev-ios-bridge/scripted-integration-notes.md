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


## Completed execution gate, 2026-09-25

All 12 reviewed scripts matched their oracles: six passed and six failed on the intended assertions. The final-runtime repeat of w01 passed in `f62f2099-6680-4672-a9a1-2528f0d530ff`; the earlier pass remains preserved. Fault probes produced `TARGET_MISSING`, `TARGET_AMBIGUOUS`, and `CANCELLED` with no device actions or Jev requests. Cleanup succeeded. The ambiguous-target probe uses distinct Diagnostic button targets, so it does not depend on Contacts restoring a scroll position. Cancellation occurred during a bounded wait after its first capture.

Production ports preserve all 24 assertion request payloads. The integrated production check passed 147 tests, type checking, and build. Production reports now retain the full redacted assertion observation in JSONL and choose labelled/value-bearing elements for the report excerpt. The final decisive checkpoint comes before older evidence within the 24,000-byte report budget.

The blind diagnosis used only the actual failed Diagnostic report and two Swift source files, with no tools or oracle. Claude identified `CheckoutModel.totalCents` taking the last price and proposed summing selected prices. The [sanitized artifact](../../spikes/benchmarks/blind-diagnosis.json) records the exact input hashes, response, usage, and invocation. The planted bug remains in place.

## Installed-host attempts and keyboard recovery

The first clean-installed `/test-ios` attempt submitted the exact c01 script through `start_scenario` and read `get_report`, but typing produced lowercase text instead of the supplied literal. Its value guard stopped inconclusively after one action, before Jev. Subsequent probes reproduced incorrect casing and failed whole-field replacement in Contacts and Weather. The pinned AXe binary was unchanged. Keyboard configuration and backend modifier state were investigated; the cause is not established.

An operator-only attempt to shut down the dedicated simulator returned “already Shutdown.” Booting that same simulator through MobileBuildMCP restored exact casing and whole-field replacement in direct probes, without erasing data. This does not identify why the simulator had shut down or why typing changed. The bridge still uses only MobileBuildMCP for device operations.

The second installed attempt restored Contacts’ empty-results screen, which contains two distinct Search images. Its initial unique-image guard stopped with `GUARD_AMBIGUOUS`, zero actions and zero Jev calls. The revised c01/c02/c03 entry guards remove that redundant image anchor while retaining the Contacts application, a unique actionable text field, and exclusions for saved-card headers, Done, Cancel, and alerts. Offline checks cover plain lists, query results, empty results, saved cards, and editors. The real empty-results regression failed before the guard change and passed after it. Values, assertion claims, and judgment thresholds did not change.

Both installed attempts and the keyboard captures remain under `spikes/benchmarks/results/` and `spikes/scripted/integration/setup-evidence/`. Their failures are part of the execution record; neither counts as a successful installed-host test.
