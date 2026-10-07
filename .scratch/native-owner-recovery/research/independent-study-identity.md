# Independently bound metadata and reference studies

Recommend **two fixed, predeclared research profiles**, selected by the existing `metadata` and `reference-study` plans. Build each profile separately from the same harness. Every attempted profile must pass the unchanged canonical absence gate on the existing owned simulator. A refusal stops this experiment; the Implementation never allocates another identity or retries under a new name.

Design inspected at `8f969d961c383331ba2b0014e59cf12fe902a359`, 2026-10-07. No device operation, process inspection, registry modification or source change was performed for this note. The [startup authority research](startup-authority.md) found no documented registration-consistency barrier in its bounded search. This proposal supplies an independently bound experiment, not that missing guarantee. The consumed historical case remains frozen and all 23 production requirements remain pending.

## Why a pair is the smallest useful change

The current build creates one runner/fixture pair and verifies only their original IDs ([build.py:45](../../../spikes/native-owner/native/build.py#L45)); both plans then address the same runner and fixture ([study.py:823](../../../spikes/native-owner/host/study.py#L823)). Metadata removes its owned runner and may restore Shutdown ([study.py:853](../../../spikes/native-owner/host/study.py#L853)). The observed original inconsistency appeared at a later boot. Reusing a successor metadata ID for reference work would recreate that dependency without establishing reboot-stable absence.

| Interface | Cost and limit |
| --- | --- |
| One fixed successor namespace | Fewest declaration changes. A metadata-only milestone is feasible; reference admission would still depend on that namespace after uninstall/Shutdown/boot. It does not provide a durable route to reference work. |
| Two fixed profiles selected by plan | One small declaration and profile-aware validation; the harness and product names stay shared. Reference work does not reuse the metadata runner namespace, while still requiring its own fresh absence observations. Recommended. |
| Caller-supplied reusable identity object | Adds arbitrary naming, validation, combinations and migration states that these two experiments do not need. Reject for this scope. |

The two profiles are declared before any build or live attempt:

| Plan | Test-plugin bundle | Runner bundle | Fixture bundle |
| --- | --- | --- | --- |
| `metadata` | `dev.jev.research.native-owner-20261007-metadata` | `dev.jev.research.native-owner-20261007-metadata.xctrunner` | `dev.jev.research.native-owner-20261007-metadata-fixture` |
| `reference-study` | `dev.jev.research.native-owner-20261007-reference` | `dev.jev.research.native-owner-20261007-reference.xctrunner` | `dev.jev.research.native-owner-20261007-reference-fixture` |

Use one checked-in `spikes/native-owner/study-identities.json` with exactly these two entries and exactly `plugin`, `runner`, and `fixture` string fields. Load this fixed path; provide no identity-file, bundle-ID, suffix or fallback flag. Parsing/selection is in-process policy, so it needs no Adapter. A small private immutable value can bundle the selected fields where they travel together.

## Caller Interface and source binding

Keep `run_study(plan, configuration, dependencies)` and the two existing plans. Append `build_binding: Path | None = None` to `Configuration`; an ordinary study refuses a missing binding before a simulator command. The private reconciliation/diagnostic callers do not use ordinary artifact validation and do not require a successor binding. Do not impose successor profile selection on their private `_Study` plans ([reconcile.py:76](../../../spikes/native-owner/host/reconcile.py#L76)).

Require `--plan metadata|reference-study` on the builder and `--build-binding PATH` on the ordinary host CLI. Keep scheme `NativeOwnerStudy`, products `NativeOwnerStudy-Runner.app`, `NativeOwnerStudy.xctest` and `NativeOwnerFixture.app`, class `NativeOwnerStudy`, methods `testMetadataOnly`/`testReferenceStudy`, and the device identity unchanged. Each build and receipt directory must be fresh, as the builder already requires ([build.py:23](../../../spikes/native-owner/native/build.py#L23)).

Example, with fresh paths:

```sh
python3 spikes/native-owner/native/build.py --plan metadata \
  --derived-data /tmp/native-owner-metadata-build \
  --receipts /tmp/native-owner-metadata-build-receipts
python3 spikes/native-owner/host/run.py --plan metadata \
  --derived-data /tmp/native-owner-metadata-build \
  --build-binding /tmp/native-owner-metadata-build-receipts/binding.json \
  --evidence-directory /tmp/native-owner-metadata-observations \
  --admission-seconds 90
```

For reference work, repeat the generic build with `--plan reference-study` and separate fresh build/receipt/evidence paths. Do not reuse metadata products. A successful metadata result is a supervisor milestone, not an automatic invocation of the reference plan.

The builder substitutes fixed selected values through declared Xcode build settings. In `project.yml`, the UI-test target's `PRODUCT_BUNDLE_IDENTIFIER` becomes `$(JEV_NATIVE_OWNER_PLUGIN_BUNDLE_ID)` and the fixture's becomes `$(JEV_NATIVE_OWNER_FIXTURE_BUNDLE_ID)`; each target receives the selected plan and expected IDs through generated Info.plist keys. The builder supplies all values from the closed declaration, never from inherited environment overrides. Verify Xcode's actual runner ID rather than merely assuming its `.xctrunner` suffix. The current project pins IDs at [project.yml:19](../../../spikes/native-owner/native/project.yml#L19) and [project.yml:36](../../../spikes/native-owner/native/project.yml#L36).

Extend `binding.json` with the selected plan/profile and all three actual bundle IDs. Bind the declaration, builder, native/fixture sources, relevant host source, protocol, generated project, complete permitted product files, and built `.xctestrun`. Include the build command and existing source commit/Xcode version. The current source list omits the builder itself ([build.py:17](../../../spikes/native-owner/native/build.py#L17)); the host currently hashes artifacts but does not consume the builder's receipt ([study.py:544](../../../spikes/native-owner/host/study.py#L544)). Record actual bytes, not a claim of pristine source inferred from a commit alone.

Before the first simulator command, the host verifies the binding has the requested plan and exact selected IDs, belongs to the supplied build, and matches current source/profile/protocol bytes, every permitted product byte and plan byte. Reject symlinked, missing, extra, changed or ambiguous inputs using the existing artifact restrictions. Preserve the strict target/dependency/environment validation and metadata's removal of fixture startup dependencies ([study.py:601](../../../spikes/native-owner/host/study.py#L601)). Record the accepted binding's bytes/hash plus selected identity in new evidence and ownership receipts. This is research provenance, not a trust or code-signing guarantee.

## Native and fixture agreement

At native entry, read the build-bound profile/expected IDs from the test plugin's Info.plist; compare the requested plan with the compiled profile, the actual test-plugin bundle ID from `bundleForClass:`, and the actual main runner bundle ID. Reject an absent/mismatched value before acquiring `XCUIDevice.sharedDevice` or its accessibility Interface. Bundle identities do not come from new runtime ID environment variables. Existing request/deadline/stop-file/document arguments remain explicit ([NativeOwnerStudy.m:14](../../../spikes/native-owner/native/NativeOwnerStudy.m#L14)).

After sequence 0 `started`, emit exactly one identity observation at sequence 1 before native getter/query work:

```json
{"kind":"observation","operation":"metadata","outcome":"observed",
 "details":{"studyIdentity":{"plan":"metadata",
   "plugin":"dev.jev.research.native-owner-20261007-metadata",
   "runner":"dev.jev.research.native-owner-20261007-metadata.xctrunner",
   "fixture":"dev.jev.research.native-owner-20261007-metadata-fixture"}}}
```

The example abbreviates the outer fields: schema/request/sequence/elapsed/input count remain required exactly as today. Native supplies actual runner/plugin IDs and the build-bound fixture ID. The ordinary host requires that exact observation shape and selected value before any later observation, recreation callback or normal completion. Missing, duplicate, late or mismatched identity refuses acceptance, writes the admission-stop marker and retains native ownership under the existing deadline. Keep this requirement in ordinary `_Study` record handling; do not retrofit it into the generic historical `_Stream` parser. V1 already permits observation details while started/finished details are closed ([protocol.schema.json:60](../../../spikes/native-owner/protocol.schema.json#L60)); no schema/version migration is needed.

Pass this private identity value into `ObservationStudy` configuration. Use its fixture ID for public activation and the recorded activation identity, replacing both hardcoded occurrences ([NativeOwnerStudy.m:46](../../../spikes/native-owner/native/NativeOwnerStudy.m#L46), [ObservationStudy.m:327](../../../spikes/native-owner/native/ObservationStudy.m#L327)). Preserve admission rechecks and all native call accounting.

Add `bundleIdentifier` from the fixture's actual main bundle to `result.txt`; its exact four fields become `{pid, generation, ordinary, bundleIdentifier}`. Both readers require it to equal the selected profile fixture ID. Update the existing exact-three-field validation ([Fixture.m:16](../../../spikes/native-owner/fixture/Fixture.m#L16), [ObservationStudy.m:297](../../../spikes/native-owner/native/ObservationStudy.m#L297), [study.py:765](../../../spikes/native-owner/host/study.py#L765)). Keep the verified data container, initial generation 0, zero ordinary taps, same PID and unchanged activation baseline. No UID re-query, input, fixture replacement retry or automatic namespace selection is added.

## Frozen history and lifecycle

Freeze the original IDs as literal case-specific constants in `reconcile.py`, replacing its import of active study IDs ([reconcile.py:13](../../../spikes/native-owner/host/reconcile.py#L13)). Preserve `_CASE_SHA256`, `_NATIVE_REVISION`, old five-file hashes, original binding format and three-record stream, exact installed UUID, original invalid result and consumed one-use claim. Reconciliation is not a cleanup Interface for either new profile. Its tests must continue using independent original literals, not successor declarations.

The old startup probe also imports active IDs ([observe.py:9](../startup-probe/observe.py#L9)); freeze its original runner/fixture IDs locally so it still investigates the original dangling registration. Retain the already executed script/source bindings by their archived commit and byte hashes; add any changed script binding only to a future receipt. Never rewrite original archives or claim that a newly edited script was the historical caller.

All new work uses the same owned UDID/name/runtime, shared device guard, one monotonic allowance, pre-spawn resource/child accounting, file-backed output, explicit stop marker and restoration rules. Fresh canonical absence is checked for the selected runner and fixture **after boot readiness**, before installation. Old registration is neither repaired nor treated as authorization. A positive/ambiguous new-profile lookup refuses; no fallback or registry reset follows.

Metadata cleanup still requires valid complete records, identity agreement, zero explicit app queries, both local flags, normal class completion, actual successful child exit and exact runner-PID absence. It removes only its newly owned metadata runner, checks canonical absence and restores the initial device-state map before releasing its matching guard. That proves the recorded cleanup observations at that time, not absence after another boot. Reference work uses its own profile and independent gate; it always retains runner, fixture, device resources and guard while native settlement is unconfirmed. Process absence never becomes an accessibility fence.

## Implementation brief and verification

The supervisor freezes `study-identities.json` and this cross-slice contract before delegation. Two implementers can work in parallel without duplicating the harness:

1. **Native/build slice:** `native/build.py`, `native/project.yml`, `native/NativeOwnerStudy.m`, `native/ObservationStudy.m` and its tests, `fixture/Fixture.m`, native README and verification receipt. Implement fixed build selection, exhaustive source/product/plan binding, plist/runtime identity checks, identity observation and four-field fixture telemetry. Keep generated projects/build outputs outside Git. No global XCTest/WDA patches.
2. **Host/history slice:** `host/study.py`, `host/run.py`, relevant host tests, `host/reconcile.py` and its tests, old startup probe and its caller test, study README and verification receipt. Add binding consumption and selected identity throughout artifact/plan/device commands, ownership and record acceptance; freeze historical callers' identities. Do not edit the guard or production TypeScript. The supervisor owns any architecture/spec addendum; amend the active research contract explicitly for telemetry/profile selection while preserving original evidence.

Meaningful regressions cross `run_study` with real temporary source/build/plan/receipt files and the existing scripted external-tool Adapter. Independent test expectations use fixed literal identities. Cover: wrong/missing binding; altered source/profile/product/plan; cross-profile products; foreign startup target; original dangling registration left untouched; selected-profile positive/noncanonical lookup refusing before install/XCTest; missing/wrong/duplicate/late runtime identity retaining ownership; wrong fixture identity rejecting readiness; successful metadata touching only metadata resources; reference touching only reference resources and retaining; no automatic second identity attempt. Preserve deadline, child-group uncertainty, restoration and actual shared Bridge lease regressions.

Native policy tests exercise serialized identity ordering and mismatch refusal, exact fixture identity, same-PID activation/recreation and existing selector/accounting limits through the observation Interface. Build **both** profiles for generic iOS Simulator with fresh source-bound receipts, and inspect actual plugin/runner/fixture plists and plans. These checks prove local behavior and compilation only. Run existing host tests and package checks, then independent Standards and Spec review at pinned commits.

The supervisor alone may perform live metadata and then reference studies serially after those gates. Record actual absence/admission and final state/guard facts. If metadata cannot complete, or reference cannot independently pass startup, stop and preserve evidence. If reference is admitted, its observations may sharpen native research; they accept none of the 23 production tickets.

This keeps the study Module deep: callers select an existing plan and provide one verifiable build receipt, while the Implementation hides cross-language identity propagation and conservative resource accounting. Locality comes from one closed declaration and validation at the existing study Seam. The real filesystem and `ProcessTools` remain concrete dependencies; scripted tools test local decisions about true external CoreSimulator/XCTest, never their undocumented guarantees.
