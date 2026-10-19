# Phase 3 specification: Appium driver and preserved modes

Status: behavior specified; capability research refines wire fixtures; execution paused
Authority: [published spec](../spec.md), Decisions 4 through 17, 23 through 29;
Testing Decisions 2 through 16, 20
Context: [master handoff](../handoff.md), `src/contracts/index.ts`

## Entry and composition

Require Phase 1 GO and Phase 2 ownership controls before effects. Read the
[public-capability investigation](../issues/02-public-appium-compatibility.md)
and source-supported limits before choosing tool requests. A callable tool is
not proof of preserved behavior. Read the [pinned source mapping](../research/public-compatibility.md)
when freezing each operation fixture.

Implement one Appium device-driver composition. Route `src/cli.ts`,
`src/mcp/index.ts`, `src/device/factory.ts`, `src/capture.ts`, and observed
composition in `src/observed/cli.ts`/`src/mcp/observed.ts` through it. Preserve the
separate ordinary `DeviceDriver`, preparation and observed-action roles; do not
cast a made-up scenario into a narrower operation. Keep existing scenario,
driven, observed, report and judge services responsible for their domain rules.

Use a private bounded MCP connection, explicit owned session, validated protocol
and authoritative lifecycle from Phase 2. Prefer public native tools. Use a
small versioned public-core extension for verified missing structured results
or required bounded operations. Keep extension operations allowlisted and
session/app-bound. Do not expose arbitrary driver methods/scripts, remote
session attachment, vendor internals or a runtime backend selector.

Before importing/starting automation, verify selected runtime compatibility and
restrict the child environment. Pin actual resolved versions and runtime
artifacts rather than just an npm wrapper. Preserve the bridge's public MCP
server dependency while choosing the required private MCP client; avoid assuming
both protocol SDK generations can be silently replaced by one range.

## Observation contract

Parse bounded XML with platform/root validation and entity/DTD refusal. Extract
all required screen evidence into the bridge `Snapshot`/`Element` meanings:

| Meaning | Required behavior |
|---|---|
| Role, identifier, label, value | Translate to bridge vocabulary; preserve selector meaning and real visible values |
| Placeholder | Preserve Android empty-field hint semantics; do not invent a typed value |
| Enabled/visible/focused/selected | Preserve applicable state; unknown cannot silently mean eligible |
| Frame and actions | Valid finite geometry and supported eligibility; reject unsafe/unknown targeting |
| Reference | Snapshot-scoped identity correlated to the explicit Appium session; no durable stale handle |
| Sequence/time/hash/settling | Truthful fresh capture and bounded still-changing result |
| Limits/truncation | Enforce production observation limits; refuse overflow rather than silently drop evidence |
| Screenshot | Validate bytes/dimensions/orientation and capture relationship; keep evidence local/protected |

Pin observation settings as part of the selected profile/protocol. The pinned
MCP creation path excludes iOS visibility/accessibility attributes by default;
configure and verify the source settings that retain required evidence. Record
Android hierarchy compression, window selection and snapshot depth. A syntactically
valid tree or absent truncation flag does not prove completeness; refuse unknown
required evidence instead of silently selecting from a partial view.

Keep normalization and locator resolution independent of Jev. Exercise duplicate
labels, parent/child controls, custom accessibility, disabled/invisible/password
fields, empty hints, scrollable content, malformed/large XML and changing screens.
Legacy MobileBuildMCP tap-alias authorization cannot be copied onto Appium; any
compatible alias equivalence needs its own bounded proof and unique-target test.

Version/schema/envelope errors stop dependent actions. Treat viewer resources
as unconsumed content only under the measured public contract. Validate image
content rather than trust a prose path. Preserve normal screenshots/watch
behavior, without imposing the tracer's intentionally narrow image subset as
an unreviewed product limitation.

## Operation contract

Resolve guards and exactly one eligible target from fresh evidence before input.
Refresh/rematch stale references under the existing policy, then authorize the
specific permitted operation. An uncertain mutation cannot be retried as a
reference refresh. Serialize native requests and preserve authored budgets. Audit internal vendor
retry/fallback branches, including gesture convenience handlers; use explicit
no-retry public-core/W3C operations where required. Test actual native input
counts, not just the number of SDK tool calls.

| Operation | Required semantics and evidence |
|---|---|
| Prepare/restart | Honor app identity and supported iOS launch args/Android activity+intent extras; ordinary preconditions stay intact |
| Android attach | Preserve app/state without relaunch; bridge `start=attach` is not Appium remote-session attachment |
| Tap | One authorized unique-target input attempt; validate terminal execution separately from visible outcome |
| Replacement text | Replace existing contents, then read a fresh shown value; generic `appium_set_value` appends and echoes input, so it is insufficient by itself |
| Swipe/back/scroll | Preserve direction, eligible target, platform back behavior and recorded `actPath`; bound search/settling rather than inherit unlimited loops |
| Android coordinate tap | Refresh paused evidence, verify screenshot dimensions/orientation/state, convert whole-pixel coordinates and reject unknown/stale/out-of-bounds points |
| Observe/settle | Bounded fresh captures; report still changing at the cap rather than manufacture a stable screen |
| Close | Durable dispatch closure, owned session cleanup, complete native proof and authoritative release; respect existing app-shutdown/retention semantics |

For replacement, specify the actual public-core clear/set or equivalent bounded
native sequence before implementation. Account for every mutating component;
if clear/set fails or loses its acknowledgment, close dispatch and retain the
partial outcome instead of retyping. Read shown text from new observation,
not vendor echo. Return the compatible `ActOutcome` and Android `typedFields`
evidence, with current masking; a legitimate display transformation is not
an execution failure. Suppress/filter upstream arguments, response echoes and
errors before they become run logs or user-visible diagnostics.

Keep existing iOS attach and coordinate requests explicitly refused before
input. Prove Android conversion on at least two device sizes. Do not relabel
Appium timings as app performance or copy unmeasured expiry/tap-alias metrics.

## Mode compatibility

| Mode/path | Required public behavior |
|---|---|
| Scripted version 1 | Existing defaults, selectors/guards, actions/waits/checkpoints, typed-value resolution, false-wins verdict and stable reports/exits |
| Driven version 2 | Existing enablement, project/preflight/risk/local-only policy, budgets/search decisions, hand-back package, pause ownership and `resolve_step` |
| Observed preparation | Explicit supplied inventory or bounded fresh creation; immutable artifact hash/app compatibility; reservation/host guard before effects; readiness and parked transfer |
| Observed action | iOS-only single authored tap; before/after predicates, one executor, immutable binding/outcome, identical retrieval, changed-request conflict, cancellation/retirement/retrieval |
| Android capture | Same flags/element fields/exit semantics; settle current screen under shared admission; zero launch/reset/stop, screenshot or Jev request; `--jev` uses production renderer |
| Reports/watch/logs | Preserve frozen JSON/envelopes/file names and current access/masking behavior; keep provenance additive and truthful |

A late driven answer must refresh the paused screen; changed guards/geometry
produce refusal or a fresh hand-back without input. Abort of an observed/status
wait cancels only the wait. Observed preparation/action remain key-free and
cannot construct the Jev SDK. Unknown fresh creation retains capacity and its
host-wide exclusion; no inferred identity, replacement simulator or automatic
retry. Retirement does not erase/delete/reuse a retained allocation.

## Diagnostics and allowed native helpers

Preserve app prints/platform output in log pane, headless `logs` and step tails.
Keep empty output distinguishable from a lost/unavailable source. Preserve
existing app filtering, bounded late-event attribution and supplied-value
masking. Match current crash/ANR detectors where supported; expected app
shutdown, old events and automation failure must not become an app diagnosis.
Lost health observation is unknown, not a healthy pass.

Prefer proven public Appium capabilities. Use only bounded read-only log/health
observers, recorded owned fencing, optional nonfatal simulator presentation and
existing explicit simulator-creation exception as native helpers. Keep their
ownership, deadlines and shutdown in the driver lifecycle; no helper reads the
UI or injects input as a fallback.

## Verification and exit

Use the actual adapter/services and substitute only a controllable private MCP
provider. Reuse existing judge injection and native-command fixtures. Pin wire
requests/results, authorization consequences and public evidence; avoid tests
that merely mirror parser branches.

Through CLI and MCP, execute representative existing iOS/Android scenarios with
launch options, observe/tap/replace/wait/checkpoint. Assert exact authorized
attempt counts, safe malformed/schema/stack refusal, masked shown values,
compatible exits/replies/reports, complete cleanup and subsequent admission.
Cover failures and cancellation before/after dispatch, late/lost responses,
process loss, device disconnection, ambiguity/staleness and changing screens.

Also exercise driven hand-back/resolve, observed prepare/start/retrieve with
cross-process races/export loss, and Android capture against a competing owner.
Pin zero forbidden calls for key-free capture/observed paths. Preserve all
supported experimental public operations, not only happy-path scripted runs.
Use source fixtures for native-helper bounds and require later live evidence
for every claimed diagnostic/capability.

Exit with the complete preservation matrix, corresponding public contract
checks, typecheck/full host/build checks and separate Standards/Spec review.
Every existing supported mode must retain success/refusal/cancellation/recovery
semantics in its platform scope. Keep a previously valid behavior outstanding
when parity is unproved; replacing it with `UNSUPPORTED_ACTION` is not acceptance.
Then dispatch [Phase 4](phase-4-acceptance.md).
