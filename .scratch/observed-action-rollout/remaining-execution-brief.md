# Remaining execution preparation

Prepared from local source on 2026-10-11. All commands, paths and harness work below are **reserved drafts, unexecuted**. Root must first accept the storage gate in the [current resume runbook](storage-resume-runbook.md), pin the full integrated SHA and grant the sole operator explicit execution scope. No migration repeat or product/app edits are required by this brief.

## Generic app builds

Inspected both `project.pbxproj` files and their shared schemes. Each scheme's BuildAction selects its app target. Fixture product is `NavigationFixture.app`, bundle `dev.jevbridge.observedfixture`, project minimum iOS17.0, Swift6.0. Weather product is `Weather.app`, bundle `com.sentry.weather.Weather`, minimum iOS26.0, Swift5.0; its project also supports other platforms, so the simulator SDK/destination must be explicit. Both inspected app targets have empty package dependencies; no project shell-script build phase was found in Weather. Weather's test scheme entries do not authorize testing.

Execute these argv through the operator's bounded recorder, serially, with cwd fixed to `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic`, `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, and the approved clean environment. Root must set finite wall-time/output limits and actual-close handling before dispatch. Each DerivedData path must be absent before exclusive reservation; an existing path is a stop, not permission to delete or reuse it.

```sh
/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild \
  -project .scratch/observed-ui/live/fixture-app/NavigationFixture.xcodeproj \
  -scheme NavigationFixture -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/live/build-entry-2026-10-11/DerivedData-Fixture \
  CODE_SIGNING_ALLOWED=NO build
```

```sh
/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild \
  -project spikes/benchmarks/vendor/weather/Weather.xcodeproj \
  -scheme Weather -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/live/build-entry-2026-10-11/DerivedData-Weather \
  CODE_SIGNING_ALLOWED=NO build
```

Expected finite outputs, relative to the reserved `build-entry-2026-10-11/` directory:

- `DerivedData-Fixture/Build/Products/Debug-iphonesimulator/NavigationFixture.app`
- `DerivedData-Weather/Build/Products/Debug-iphonesimulator/Weather.app`

These are expected paths inferred from project/scheme settings, not observed artifacts. If missing, retain failure and stop; no recursive output search. Record actual binary architectures and require accepted arm64 compatibility; do not override deployment targets or architectures to manufacture acceptance.

### Build manifest fields

Record full integrated SHA and Source/compiled manifest bindings; app source/project/scheme file hashes before and after; executable and Xcode identity; exact argv/cwd and safe environment keys; start/end/actual-close/exit/signal; raw stdout/stderr paths and hashes; explicit `.app` path; complete relative app-entry inventory with kinds, sizes, hashes and link targets; total artifact bytes and canonical content digest. Reject escaping links using existing artifact rules.

Inspect actual `Info.plist` fields `CFBundleIdentifier`, `CFBundleExecutable`, `CFBundleSupportedPlatforms`, `DTPlatformName`, `DTSDKName`, `MinimumOSVersion`, version/build fields and actual executable architecture/platform metadata. Compare with accepted iOS27.0/arm64 evidence. Preserve missing fields explicitly; expected source settings cannot substitute for built metadata. Bind each allocation's `app.build.id` and `origin` to this accepted provenance. Recheck storage after build consumption before allocation dispatch.

## Live request and oracle mapping

All five preparation requests use version1, a unique declared `actionId`, `source.kind:create`, device type `com.apple.CoreSimulator.SimDeviceType.iPhone-17`, runtime `com.apple.CoreSimulator.SimRuntime.iOS-27-0`, accepted absolute app path/bundle/provenance, and timeout360000ms. The server returns the allocation ID; preserve it and use it in the corresponding version1 action request. Action timeout is10000ms. Reserve the actual IDs in the dispatch, not in this document.

Selector shorthand below means `{identifier:"..."}`; `UNITS` means `{label:"UNITS"}`. Guards use `present` arrays and optional `absent`; these are source expectations until readiness evidence confirms them. Every action is one tap selector. [Matrix](../observed-integration/evidence/validation-matrix.md) and [public schema](../observed-integration/evidence/public-contract.md) remain authoritative.

| Row / adapters | Action / before / after | Required result |
| --- | --- | --- |
| L01 CLI allocate → CLI action → MCP get | `open.details`; before `home.heading`; after `details.heading` | committed `outcome_observed`, flags true/true, one touch, N≥2 |
| L02 MCP prepare → MCP start → CLI report | `open.details`; before and after `home.heading` | committed `already_satisfied`, false/false, no input, N=1 |
| L03 CLI allocate → MCP start → CLI report | `open.details`; before and after `details.heading` | committed `refused/PRECONDITION_NOT_MET`, false/false, no input, N=1; retain allocation |
| L04 recording MCP prepare/start → fresh CLI report/repeat/conflict + legacy successor admission | Ordinary L01 request; withhold successful real touch reply before driver acknowledgement | committed `inconclusive/UI_ACTION_UNCONFIRMED`, quarantine, true/false, exactly one real touch; reads/conflict/refused successor zero backend commands |
| L05 MCP prepare → separate CLI action → MCP get | `weather.settingsButton`; before present settingsButton/locationButton and absent `weather.settingsSheet`; after present settingsSheet/`UNITS` | committed `outcome_observed`, true/true, one touch, N≥2; JPEG/snapshot visibly agree |

Fixture source contains all three fixture identifiers. Weather top bar declares both initial identifiers; settings sheet declares its identifier and `UNITS`, and WeatherApp uses `.mock`. Accessibility visibility/uniqueness remains a live gate. Do not demand L03's deliberately absent precondition or future postconditions during readiness. Record separate preparation and action counts, raw actual closes and all extra diagnostics; follow matrix limits rather than copying historical counts. Parked TTL is300000ms, so prepare each row immediately before its action.

## Recording harness dependency

No current public-interface live recording harness was found among the scripts under `acceptance/live/`; those scripts implement entry checks only. Historical `.scratch/observed-ui/live/recorded-runner.ts` uses the experimental raw-device request and journal. Its drop occurs after `realDriver.tapOnce()` returns and adds a diagnostic observation. It does not establish the required current MCP/allocation path or the pre-acknowledgement L04 boundary.

Before live dispatch, prepare and review an evidence-only harness that retains production authority, real allocator, public MCP handlers, configuration validation, fencing and driver capture policy. `src/mcp/index.ts:createMcpServer` accepts observed composition; `src/observed/cli.ts` shows production composition and its before-start configuration check. The action driver supports a real `runner` seam, but `ObservedAllocator` has no real recording-runner option; its `fakeBackend` is unsuitable for live production authority. Complete all-child recording needs a reviewed transparent process recorder or equivalent production-preserving instrumentation. Do not route live work through fake-backend mode.

For L04, retain the real touch child's complete successful stdout/stderr and actual close first. At the action runner return boundary, withhold only that successful response before `src/device/index.ts:issueCommand` parses/acknowledges it; return a controlled failure to the production driver. Exactly one real touch may issue. Record the injected boundary separately from native receipts; retain any extra capture in diagnostic counts. Fresh CLI retrieval, identical-repeat retrieval, conflicting request and guarded legacy successor must remain backend-silent. This is synthetic loss after real backend success, not real transport severance. The harness mechanism and legacy successor invocation are concrete unfinished preparation dependencies; a production code change is not yet established as necessary.

## Final reviewer dispatch draft

Recipient: independent nonauthor GPT-6-Astra high under [ticket 12](issues/12-independent-review.md). Planning base `b8c4a50942551bdf95d00036a6d2f7bb6142ff43`; Root fills final integrated SHA, every dependency/evidence commit and isolated review workspace after live acceptance. Existing code/package review remains accepted with its preserved limitations. Dispatch only after Root accepts storage/build manifests and every L01–L05 evidence row.

Review the base-to-final diff, prior safety report, all H01–H09 and L01–L05 receipts, unchanged app/source bindings, live command counts and visible outcomes, authority/migration/capacity/fencing invariants, exact Node24 support and L04 qualification. Return findings with evidence anchors, each gate's PASS/FAIL/UNVERIFIED and a merge-ready recommendation. Own only ticket12 comments/status and `acceptance/safety-review.md`. Root owns corrections and affected reruns. No merge or publication follows this review automatically.

## Disabled recorder draft

A [source-only draft](../observed-integration/acceptance/live/harness-draft-2026-10-11/README.md) records the proposed process instrumentation and pure L04 callback decision. Its entrypoint always refuses; recorder/controller implementation and independent review remain incomplete. No draft code was executed or tested. Successful touch bytes must be retained in evidence and withheld from the production callback, since passing them alongside a synthetic error can still produce acknowledgement.
