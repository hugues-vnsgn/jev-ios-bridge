# Phase 4 specification: corpus acceptance and Appium-only cutover

Status: requirements specified; resources/correspondence pending; execution paused
Authority: [published spec](../spec.md), Decisions 27 through 30;
Testing Decisions 20, 22 through 25
Context: [master handoff](../handoff.md), [roadmap](../roadmap.md)

## Entry and readiness

Require the production Appium normalizer, renderer, adapter and complete mode
composition from Phase 3. Read
[Frozen corpus provenance and reproducibility](../issues/03-frozen-corpus-provenance.md)
and [Acceptance readiness agreement](../issues/06-acceptance-resource-readiness.md).
Arrange an exclusively assigned physical Android phone, installed diagnostic
app/build, compatible host/runtime prerequisites and coordinated authority
activation. Do not borrow a connected phone or another agent's simulator.

Plan read-only history recovery/state prerequisites early, but capture/queries
must wait for authorization and the production evidence path. An unknown screen
correspondence is a blocker, not permission to alter the frozen case.

## Corpus source and preregistration

Recover the frozen cases with source commit/file/object provenance, claim IDs,
truth labels, denominators, prior approval/results, raw source screen evidence
and app/state setup. Preserve Android's `2366759` placeholder correction and its
original failing result; a partial corrective rerun is not a whole-corpus pass.
Existing archived-text and Android prototype runners cannot prove the new path.
Use the [recovery manifest and provenance](../research/corpus-provenance.md).
The iOS freeze/approval are tied to `88ad659f1`/`2ac157a07`; recover Android
labels/screenshots/results from `755d0ff` and `2366759`, not only current fixture
texts. Preserve the original wrong placeholder judgment and the separate
four-claim correction. Source/build/state correspondence still needs verification.

Preregister a manifest BEFORE any Jev query. For every screen, record:

- Frozen case/claim/truth identity and source digest convention/provenance.
- Reproducible app build, device/runtime, state setup and correspondence evidence.
- Selected stack/artifact/source versions and normalization/renderer version.
- Appium XML plus matching local screenshot, capture identity and hashes.
- Exact production observation/request bytes, hashes, pinned model and thresholds.
- One judgment allocation, expected result-record shape and stop rules.

Verify the historical digest convention instead of assuming every manifest uses
raw-file SHA-256. Keep claims/labels/denominators unchanged. Where old app builds,
data, dynamic values or screens cannot be reproduced, retain the case and seek
explicit owner reconciliation before evaluation. Do not silently substitute a
fixture, omit a case or judge only the already reproducible subset as the gate.

Feed matching Appium XML through the PRODUCTION normalizer and observation
renderer, then the pinned production Jev judge. Retain exact requests/results
and truth comparison. Judge each screen once without re-asking; auth/provider
failure is visible and does not justify switching a key/model or fishing for
another answer. Preserve original captures and reconciliation history.

**Corpus exit:** iOS 24 screens/48 claims, zero confidently wrong and at most
three uncertain; Android 10 screens/31 claims, zero confidently wrong. Keep the
0.9/0.1 bounds and false-wins precedence. Record uncertainty without inventing
an extra Android allowance or silently changing its denominator.

## Live replacement acceptance

Run the matrix within existing platform scope on an iOS simulator, Android
emulator and assigned physical Android phone. Observed single-tap/preparation
cases remain iOS-simulator-only. Physical iPhones are outside this release.

| Category | Required evidence |
|---|---|
| Launch/options | Authored launch args/activity/extras, preconditions and supported Android attach retain meaning |
| Observation/actions | Fresh capture, unique tap, replacement/shown value, swipe/back/scroll, wait and checkpoint |
| Unsafe targeting | Duplicate/missing selectors, disabled/stale references, keyboard/changing screens and changed guards cause safe refusal |
| Driven interaction | Pause ownership, late answer refresh and compatible hand-back/resolve; Android coordinate scaling on two sizes, invalid/rotated/unknown geometry sends no input |
| Logs/health | App prints/platform output, masking, log pane/headless logs, unavailable vs empty, deliberate crash/ANR where previously supported, expected-shutdown and lost-observer behavior |
| Capture | Android key-free/no-screenshot/current-app preservation and correct production `--jev` projection |
| Ownership/faults | Competing updated entry points, cancellation, lost creation/action, late reply, process loss, device disconnection, truthful quarantine and complete recovery evidence |
| Public evidence | Existing reports/exits/replies and local evidence/watch protection; app failure differs from automation/unsupported/unknown |
| Repeated cleanup | At least 20 independent scenario/session cycles PER device category, no accumulated owned sessions/components, safe subsequent use |

Map the five unfinished v1.4.0 simulator acceptance cases into this matrix or
execute them explicitly; preserve a requirement-to-evidence row for each.
Record app/toolchain/OS/model/stack versions, commands, source commits, results,
command/component records and artifact paths. Mark unavailable hardware and
capabilities untested. Simulator results do not qualify phone acceptance.
Session cleanup cycles do not authorize retained allocation deletion or replace
later reclamation tests. Keep test-app bugs intact when they are expected verdict
fixtures rather than treating Appium migration as an app repair.

## Cutover and packaging

Only after corpus and all required live-category gates pass:

1. Route all public device work through the shared Appium composition. Audit
   CLI/MCP, scenario factory, Android capture, observed preparation/action,
   direct native commands, logs/health and presentation exceptions.
2. Remove old MobileBuildMCP/mobilecli UI execution, runtime dependencies,
   vendor-only settings/setup/plugin references and AXe input. Preserve required
   historical readers/provenance, compatible device-selection migration, allowed
   bounded helpers and unresolved native-study exclusions. No fallback remains.
3. Update actual ADR supersession notes for provider and AXe choices at cutover;
   retain bounded creation and presentation constraints. Document only tested
   categories and operational exclusivity with old binaries/external tools.
4. Repeat affected contracts/full checks, build package/plugin and verify clean
   installation, shipped documentation/links, pinned runtime prerequisites and
   usable public entry points. Validate Node minimum-runtime behavior where the
   chosen SDK/SQLite/runtime APIs require it. Run the documented quickstart
   against the built artifact installed in the clean environment. Record the
   artifact hash, installation and quickstart commands, results and evidence
   paths. Verify that reported runtime provenance and package/plugin release
   metadata match the built artifact; retain the comparison in the evidence index.
5. Prepare concrete integration/release material that reconciles the older main
   source and marketplace-only successor with the selected v1.4.0 base. Preserve
   original local work. Do not merge/push/tag/publish without owner instruction.

## Final release gate

Complete a requirement-to-evidence index for every preserved mode, corpus case,
device category and outstanding baseline acceptance case. Require all relevant
host/package/plugin checks and separate Standards/Spec review after final code
changes. Missing required rows, unproven release mechanisms, incompatible valid
scripts or unavailable required phone evidence block replacement-release
completion. Deliver a reviewable Appium-only artifact and truthful limits;
release publication is a separate owner action.

Open correspondence discussion: [Frozen-state correspondence](../issues/08-frozen-state-correspondence.md).
