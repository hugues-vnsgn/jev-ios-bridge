# Phase 4 specification: corpus acceptance and Appium-only cutover

Status: the agent-only kits are merged to main (PRs #86, #87, #88); the cutover is a draft PR (#89). Live rows ran on 2026-11-04, 2026-11-05 and 2026-11-10; each requirement's state is in [evidence-results.md](../phase4/evidence-results.md). The corpus judgment waits on three recaptures. The text below is the specification as written on 2026-10-14, with the readiness and correspondence records added on 2026-11-11
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
execute them explicitly ([recovered cases and proposed mapping](../research/v1.4.0-live-cases.md));
preserve a requirement-to-evidence row for each.
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

## Readiness as the owner arranged it (ticket 06)

This records what the owner did and decided. It is not a signed agreement on
the ticket 06 proposal text.

- 2026-11-04: the owner approved phone 2985e9c, one simulator and one emulator,
  and had the coordinator write the assignment and store activation records in
  the owner's name, mode 600. Each device had one worker at a time.
- 2026-11-05: the owner wrote `history.json` and `upgrade.json`, asserted that
  writers were stopped, ran the store upgrade from schema 2 to 3 and the import,
  and signed the activation record again. Backups were verified at each step.
- 2026-11-05: there is no other phone. Phone rows must pass on 2985e9c.
- 2026-11-10: the owner extended the three assignments to 2026-11-12T11:00Z,
  confirmed that other store writers were still stopped, and renewed the
  activation window to the same time. The bridge may create up to 8
  simulators. The spare simulator CD970E3D may replace 7B4D26E1.
- Every live attempt records its tool and device versions, and the kit refuses
  a passed row without an artifact (#95).

Unresolved: exclusivity against other OS users, older bridge binaries and
external tools stays an owner promise that nothing enforces.

## Correspondence decisions (ticket 08), 2026-11-10

The owner delegated all 38
correspondence calls to the coordinator, with reasons kept for the owner's
audit. Worker E made them by comparing, for each claim, the text the
production pipeline renders from the fresh capture with the frozen render, and
by viewing every screenshot pair. The coordinator accepted them the same day.
Record: `overnight/night2/corpus/decisions.tsv` and `DECISIONS.md` in the
Phase 4 reports folder.

- G1 approve: iPhone 17 on iOS 26.5, apps built with Xcode 27.0, replaces the
  deleted iOS 26.4 simulator. s08 and s09 keep their visible and hidden facts.
- G2 approve: the background seed restored from the frozen snapshots (Iris Moss,
  two Noah Reeds, Mira Stone, Market Errands with 2 reminders), imported by
  vCard.
- G3 approve: the cmp build from `~/Codes/cmp` as on disk, identity tree digest
  af69171f17c17d4d and APK sha256 9c86a37c214b23e5.
- G4 approve with one carve-out: `jev_p4_emulator` (720x1280, same
  android-36.1 image) for 7 Android screens. settings-1-main, settings-3-search
  and cmp-2-home go to `Medium_Phone_API_36.1`, the frozen AVD.
- 35 screens approve, 3 recapture, 0 block. All 24 iOS screens approve. s08
  approves because its email row is still off screen. s09 approves with the
  setup as written, one swipe of 0.25 of the screen. settings-2-display
  approves because Screen timeout reads `Not set`. cmp-1-launch approves.
- s02 claim a and s17 claim b approve, although WDA reports the elements behind
  a sheet as `visible="false"` and the renderer drops them. This is a pipeline
  difference the gate measures, so the judge may answer uncertain there.
- settings-1-main recapture: the Storage row must read exactly
  `40% used - 19.15 GB free` with no Battery row in view. Fill the disk with a
  file to reach it, never delete owner data, and block if less space is free.
- settings-3-search recapture: clear the search index, type `bluetooth`, and
  keep only a try with no result row. Block after 15 tries.
- cmp-2-home recapture: keep only a try whose pass 2 reads
  `heap 145MB -> 300MB`. Block after 30 tries. The claim does not change.
- Judge once, on the release commit, only when the five pinned pipeline files
  equal e9e9fd259 there. Never judge on main at 6ea7b5778, where
  `manifest verify` refuses with PIPELINE_DIGEST_MISMATCH.

Pending: `Medium_Phone_API_36.1` has no owner assignment, so the three
recaptures have not run. The judging pass and its results are pending. The
manifest can only record `correspondence: pending`, so these decisions live
outside it.
