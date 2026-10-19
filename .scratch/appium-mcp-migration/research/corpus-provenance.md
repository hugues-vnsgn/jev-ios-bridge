---
researched: 2026-10-14
base: 2f9ba8d4b
status: planning-resolution
---

# Frozen corpus provenance and reproducibility

The frozen labels are recoverable: iOS has 24 screens and 48 claims; Android has 10 screens and 31 claims. Neither archive proves the Appium path. Before Phase 4A, recover the original evidence, demonstrate correspondence for every fresh Appium screen, and freeze a separate migration manifest. Changed or unreproducible states remain blockers until the owner agrees reconciliation. Keep the labels, denominators, pinned judge and original results intact. This follows [roadmap Phase 4A](../roadmap.md#phase-4-acceptance-then-cutover) and [ADR-0010](../../../docs/adr/0010-appium-mcp-as-the-shared-device-layer.md).

This investigation read repository files and Git objects only. It made no device, vendor, test or Jev calls and accessed no credentials. Hindsight search returned no substantive corpus evidence. Facts below cite original repository artifacts; recovery requirements are recommendations for the replacement specifications, not completed acceptance.

## Source manifest: iOS

| Artifact | Path and provenance | What it establishes |
|---|---|---|
| Exact cases and labels | [corpus.json](../../../spikes/scripted/corpus/corpus.json), [definitions.json](../../../spikes/scripted/corpus/definitions.json), frozen in `88ad659f1e57baa44f4f65e89cae2d33bd96f2c2` | Stable case IDs, app bundle IDs, eight workflow groups, setup steps, normalized snapshots, neutral claim IDs, exact claim text, expected truth and rationale; 24 true and 24 false claims. |
| Original paired evidence | [raw/](../../../spikes/scripted/corpus/raw/), per-case `.full.json`, `.jpg`, `.snapshot.json`, `.meta.json`; same freeze commit | MobileBuildMCP full-capture envelopes, screenshot bytes, snapshot timestamps/sequence/device identity, screen hashes and per-asset SHA-256. Every case links one full JSON and one image. |
| Review and approval | [case-review.md](../../../spikes/scripted/corpus/review/case-review.md), [label-review.md](../../../spikes/scripted/corpus/review/label-review.md), [manifest.frozen.json](../../../spikes/scripted/corpus/review/manifest.frozen.json), [approval.json](../../../spikes/scripted/corpus/review/approval.json) | Owner approval of the exact corpus/manifest on 2026-09-24, recorded with the evaluation in `2ac157a07d9227e69b60dcd85b6d58bf8645db88`. |
| Preregistered experiment | [scripted-evaluation-plan.md](../../jev-ios-bridge/scripted-evaluation-plan.md), [harness.ts](../../../spikes/scripted/harness.ts), [cli.ts](../../../spikes/scripted/cli.ts), implementation archived at `2222fc29fbb789a4ac14e7df5a450e0dfd82d069` | Original request isolation, source digest, fixed budgets, model, projection, denominator and gate rules. |
| Original answers | [results.json](../../../spikes/scripted/results/evaluation/results.json), [evaluate.partial.jsonl](../../../spikes/scripted/results/evaluation/evaluate.partial.jsonl), [results.md](../../../spikes/scripted/results/evaluation/results.md), commit `2ac157a07` | 22/24 true and 23/24 false confidently correct; three uncertain; zero confidently wrong. These are old-provider results. |

The approval uses **canonical JSON digests**, recursively sorting object keys while preserving array order, as implemented by `digest` in [harness.ts](../../../spikes/scripted/harness.ts). Its corpus digest is `4d7e3853e79c7ffd3315ce9d908ebe9d4685ce28cff59674470ca0f861b43303`; manifest digest is `f2371bbcde3c6c9086d1bc924da04f32265e3a2fd979440a2b63cb0f7f53badf`; original implementation digest is `dbdb58f782d86191a2d35b7a932b0ca9cc38568503d1908c03310795f6c44884`. Raw file hashes are different. Read-only checks at the research base reproduced the first two canonical digests, found the corpus and manifest byte-identical to the freeze, and matched all 48 referenced full-capture/image asset hashes.

The original manifest pins `visible-full-text-v1`, `jev-1.13.0`, 24,000 rendered-state bytes, 28,000 state-plus-longest-question bytes, 56,000 request bytes, and bounds 0.9/0.1. Production now uses `visible-full-text-v2`, adopted after the separately [preregistered observation experiment](../../../spikes/observation-shape/PREREGISTRATION.md); [its results](../../../spikes/benchmarks/results/v1.0.0/observation-shape/results.md) record zero wrong and three uncertain for variant B. The old harness hashes its implementation and normalizes MobileBuildMCP envelopes; rerunning it on archived snapshots cannot establish Appium normalization. Preserve its frozen manifest as history and create a migration manifest for the actual production implementation.

### Original iOS states and recovery limits

The [case sheet](../../../spikes/scripted/corpus/review/case-review.md) and `setupSteps` in [corpus.json](../../../spikes/scripted/corpus/corpus.json) specify all 24 states:

| IDs | Required state sequence |
|---|---|
| s01 to s03 | Sentry Weather: location search `Ber`, query `Berlin` with result, Berlin main screen after closing the sheet. |
| s04 to s06 | Lisbon main screen, Settings with Distance `mi` selected, then `km` selected. |
| s07 to s09 | Two Tessa Vale contacts (Northstar Lab with six phone numbers and `tessa.seed@example.test`; Harbor Lab with `tessa.harbor@example.test`), foreground Edit with email below the viewport, then seed email revealed. |
| s10 to s12 | Nolan Ames seed email in Edit, `nolan.final@example.test` typed with Edit still open, then final saved contact card. |
| s13 to s15 | Contacts query `Nina`, `Nina Calder` with explicit No Results, `Tessa Vale` with two visible results. |
| s16 to s18 | Blank New List name, `Signal Kit` typed with form open, then My Lists with Signal Kit reporting zero reminders. |
| s19 to s21 | Charge lantern editor with empty Notes, `Use green cable` typed with Done available, then the list row containing that note. |
| s22 to s24 | Diagnostic app reset; select Bread, then Apple; complete order displaying the planted **$2**, rather than arithmetic $5. |

The original capture helper [device.mjs](../../../spikes/scripted/corpus/device.mjs) binds captures to simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`, using `mobilebuildmcp@2.7.1`. The [protocol](../../jev-ios-bridge/scripted-evaluation-plan.md) identifies the dedicated iOS 26.4 simulator. Snapshot and screenshot were separate sequential calls; file pairing is archived evidence, not an atomic-capture guarantee.

Weather source is vendored at [spikes/benchmarks/vendor/weather](../../../spikes/benchmarks/vendor/weather/) with [provenance.json](../../../spikes/benchmarks/provenance.json) and [build-evidence.json](../../../spikes/benchmarks/build-evidence.json); [benchmark notes](../../../spikes/benchmarks/README.md#pinned-source-and-local-readiness) identify the mock fixture at upstream commit `d13ff0c707b0681769cf31da0eb42c4f94ceafff`, bundle `com.sentry.weather.Weather`. The diagnostic source/project is [examples/diagnostic-app](../../../examples/diagnostic-app/README.md), bundle `dev.jevbridge.diagnostic`; preserve its planted last-selected-item total and Bread-first order. Contacts and Reminders are stock apps identified in each case. These sources and setup descriptions help recovery but do not establish the current installed app versions, synthetic databases or original simulator state.

Keep three documented distinctions when comparing a new capture: s09 required swipe extent 0.25, which the old bridge could not replay exactly; s18's separate Market Errands row reports two reminders, while Signal Kit reports zero; s20's screenshot already shows the note on the background row although the foreground editor remains open. The [protocol's preflight corrections](../../jev-ios-bridge/scripted-evaluation-plan.md) explain why these labels concern visible evidence rather than hidden persistence. Its excluded preflights are not substitutes for scored cases.

## Source manifest: Android

The complete original corpus remains in history at `2366759d0832065674c8e353d3eb1ad0bf326cea`, on the prototype line. Recover files by exact Git object; do not merge the prototype branch. Current fixture copies include JSON and corrected texts, but omit the original PNGs, labels and answers. The original [decision ticket](../../android-support/issues/04-what-jev-sees-on-android.md) and [production mapping ticket](../../android-v1.2/issues/12-element-mapping-and-capture-goldens.md) identify this provenance.

| Artifact at historical commit | Primary source | What to recover |
|---|---|---|
| Captures and images, first committed at `50e0d771c125978db08d7e6a06da587dae389568` | [spikes/android/captures/ at 2366759](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/2366759d0832065674c8e353d3eb1ad0bf326cea/spikes/android/captures) | Ten raw JSON envelopes and ten PNGs. A single `twin-1-uiautomator.xml` is supplementary old UI Automator evidence, not a ten-screen Appium corpus. |
| Exact labels | [claims.json at 2366759](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/2366759d0832065674c8e353d3eb1ad0bf326cea/spikes/android/jev-check/claims.json) | Ten screen keys, 31 tuples `[id, truth, kind, claim]`: 18 true/13 false, 20 plain/11 borderline. Preserve wording and order. |
| Mapping and rendered text | [element-mapping.cjs at 2366759](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/2366759d0832065674c8e353d3eb1ad0bf326cea/spikes/android/element-mapping.cjs), [observations/ at 2366759](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/2366759d0832065674c8e353d3eb1ad0bf326cea/spikes/android/jev-check/observations) | Corrected placeholder behavior and exact judged text. |
| Original full run | [run.ts at 755d0ff](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/755d0ff8ff40ea70f36fe888a1571e60cc64f08c/spikes/android/jev-check/run.ts), [results.json at 2366759](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/2366759d0832065674c8e353d3eb1ad0bf326cea/spikes/android/jev-check/results.json) | One call per screen through `createAssertionJudge`, using the prototype mapping/renderer over archived mobilecli JSON, not the production device capture/normalizer or Appium. |
| Correction and one-screen recheck | [commit 2366759](https://github.com/hugues-vnsgn/jev-ios-bridge/commit/2366759d0832065674c8e353d3eb1ad0bf326cea), [results-placeholder-recheck.json](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/2366759d0832065674c8e353d3eb1ad0bf326cea/spikes/android/jev-check/results-placeholder-recheck.json) | Original 0.96 false answer on placeholder-as-content; corrected cmp-3 text and four-claim recheck. Preserve both runs. |
| Production fixture copies | [captures/](../../../tests/fixtures/android/captures/), [observations/](../../../tests/fixtures/android/observations/), [android-mapping.test.ts](../../../tests/android-mapping.test.ts), imported in `45a58fe21a510cddee408e89ac8d52f740c9e2b0` | All ten raw JSON and text files are byte-identical to `2366759` in read-only comparisons. Offline golden parity establishes the old Android mapping/renderer inputs, not live Appium correspondence. |

Raw SHA-256 at `2366759`: `claims.json` = `4458fc35a7ee732b7c03e765649fae90b260eddfe26b5f2d5cc4db36d7fe4179`; `results.json` = `8bcfebff5fe2a209f1cba6df7fdaf0d666587eb744ec8883e87ea28b9f2ef35c`; `results-placeholder-recheck.json` = `541ceb7cf63067eb2cd6d0429a20e3a5f0852735e6141ec8a5763b5bb2962067`.

The [original decision](../../android-support/issues/04-what-jev-sees-on-android.md) reports one confidently wrong answer among 31 claims. After correction, only cmp-3's four claims were rechecked: false placeholder-content probability moved 0.96 → 0.65 and true emptiness 0.79 → 0.95; the other probabilities were 0.95 and 0.71. There is no corrected single ten-screen production run to present as the new gate. Replacing four probabilities in the old result would create a mixed historical record.

The historical runner imports `src/scripted/jev.ts` through a relative path outside its prototype worktree; it carries no implementation digest that freezes the imported source. Record that limit rather than attributing a complete production source freeze to the prototype commit.

### Original Android states and recovery limits

The [historical builder](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/2366759d0832065674c8e353d3eb1ad0bf326cea/spikes/android/build-prototype.mjs), labels and raw/image pairs identify:

| Screen keys | Frozen evidence to reproduce |
|---|---|
| twin-1-choose, twin-2-apple-added, twin-3-confirmation | Initial Selected: None with Complete order disabled; Apple added; Apple then Bread confirmation with planted $3 total. Source: [Android diagnostic twin](../../../examples/diagnostic-app-android/README.md), package `dev.jevbridge.diagnostic`, IDs exposed through `testTagsAsResourceId`. |
| settings-1-main | Storage prints `40% used - 19.15 GB free`; Network & internet summary; no Battery row in the viewport. |
| settings-2-display | Screen timeout prints Not set; Dark theme off. |
| settings-3-search | Search field contains `bluetooth`; no visible result rows. |
| cmp-1-launch | Million-row modal list at Row #999999, with Row #1 absent from the viewport. |
| cmp-2-home | `Modal perf harness — 1M rows`; status not finished; printed pass-2 heap result 300MB. |
| cmp-3-number-input | en-US `1,234.50`, vi-VN `2.500.000` (the false claim uses commas), empty de-DE sig=2 built-in-keypad field showing hint Betrag eingeben. |
| cmp-4-fullscreen-modal | Fullscreen-modal tab with Open full-screen modal button; modal not open; custom tab selection is not supplied as selected semantics. |

The corpus JSON envelopes carry only `status` and `data.rawData`; the tree has no capture timestamp, device/build binding or screenshot hash manifest. `spikes/android/` at `2366759` contains no setup transcript or hash-bound approval manifest. The [decision ticket](../../android-support/issues/04-what-jev-sees-on-android.md) records owner acceptance; this is weaker provenance than the iOS freeze. The [release rules](../../android-support/release-spec.md#rules-for-the-whole-release) locate cmp at `~/Codes/cmp`, explicitly a nongit external app, package `org.example.project` to confirm. Its historical builder calls it CMP 1.11.1 without resource IDs. Recover its exact source/build or record that it is unavailable; a newer build cannot silently stand in.

The original [Android map](../../android-support/map.md) identifies `Medium_Phone_API_36.1`/Android 16. Later [action findings](../../android-support/findings/05-actions.md) state its quickboot snapshot was not saved and installs were gone. The archive does not bind an immutable AVD/system image or APK digest to these ten screens. Inference: exact storage/free-space text and runtime performance output may resist recreation; all ten correspondences are presently unverified. Keep cmp-2's printed output as an assertion-corpus requirement, separate from later native-measurement work.

## Required Phase 4A preregistration

Add these deliverables to the master and Phase 4 specifications before the paid corpus gate:

1. **Recover the immutable source bundle.** Inventory every original case, claim ID/text/truth, group/kind and claim order; bind each source artifact to its commit and hash. Preserve all iOS 24/48 and Android 10/31. Archive the Android pre-correction text/results beside the corrected cmp-3 text/recheck, with their distinct provenance. Completion means every case has its original screenshot, raw capture and labels available, with missing artifacts named.
2. **Recover app and device states.** Record OS/system-image versions, device geometry, locale, font/display/keyboard settings, app source/build provenance and artifact digests, data seed/reset instructions, workflow actions and required viewport. Resolve cmp source/build and the storage/performance-output states early. Completion means a reviewed recovery recipe exists for each case, or a specific owner reconciliation remains open.
3. **Freeze correspondence before judging.** For each original case, archive the fresh Appium XML and screenshot, capture timing/session/device/app identity, and hashes. Compare the foreground screen, visible text/values, selections, absence/emptiness, order and viewport with the original pair and rationale. Define permissible representation/geometry differences in advance. The old provider's screen hash need not equal Appium's, and filenames or matching claims alone do not prove correspondence. Completion means all 34 cases have reviewed mappings that preserve their labels; changed states block evaluation until the owner agrees reconciliation.
4. **Freeze the actual production pipeline.** Name the production Appium capture/normalizer, renderer and `createAssertionJudge` entry points and source digests; resolved dependency/driver/WDA graph; pinned `jev-1.13.0`; question template; renderer rules; 24,000/28,000/56,000-byte budgets; and 0.9/0.1 bounds. Attach normalized snapshots and exact request payloads generated from the Appium XML. Screenshots support correspondence and local evidence; [the current renderer/judge](../../../src/scripted/observe.ts) sends text, not images. Preserve placeholders, withheld values, visibility, state and geometry without manufacturing empty or selected values. Completion means every request can be traced back to its raw Appium pair through the reviewed production implementation.
5. **Keep the oracle outside requests.** Send only current rendered evidence and exact claim text; keep truth, rationale, setup, screenshots and future steps local. iOS claim IDs are already neutral. Android's original `t`/`f` IDs encode class: preregister a reversible mapping to neutral request IDs while retaining original IDs in the source manifest/results. This changes no labels or claims. Completion means the archived requests contain no oracle metadata and retain all claims in their frozen order.
6. **Freeze execution and scoring.** One judgment per corresponding screen, without re-asks or selecting a favorable sample. Retain every capture, normalization, budget, request or response failure in the denominator. Report raw probabilities, uncertainties, failures, per-screen/workflow/class counts and exact model/request provenance. Require iOS zero confidently wrong and at most 3/48 uncertain; Android zero confidently wrong on all 31 claims, with uncertainties reported rather than an invented new ceiling. Completion requires every original case accounted for and both gates met on the production Appium path. Preserve [ADR-0004](../../../docs/adr/0004-fixed-assertion-bounds-single-judgment.md)'s archived 300-judgment re-scoring obligation separately if the replacement changes observation text or model.

Do not turn the archived harness or Android prototype runner into an acceptance shortcut. They consume old snapshots; Android renders through prototype code. Their production-judge import proves only the judge they called. The replacement must produce its own complete evidence chain after Phase 3 production composition, while keeping historical artifacts unchanged. Phase 4A assertion results also do not prove the separate live compatibility/cycle gates in [Phase 4B](../roadmap.md#phase-4-acceptance-then-cutover).

## Unresolved prerequisites

- Fresh Appium-to-original state correspondence for every case remains unmeasured.
- Exact original installed apps, seeded stock-app databases and simulator/AVD snapshots are not established by the corpus archives.
- Original cmp source/build provenance and deterministic restoration of its performance output are missing from this repository.
- Exact Android Settings storage and timeout states need a recovery recipe or owner-agreed reconciliation; altered truths cannot be scored under the old labels.
- Android needs a migration freeze/approval record and per-asset hashes; its historical owner decision does not bind fresh Appium captures.

Resolve these prerequisites before authorizing corpus execution. This report resolves the planning question and supplies Phase 4A requirements; it does not clear a native or release gate.
