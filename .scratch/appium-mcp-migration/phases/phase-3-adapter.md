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

Before importing or starting automation, verify the selected runtime and
restrict the child environment. Pin resolved versions and runtime artifacts, not
an npm wrapper, and refuse any mismatch before session creation.

**Frozen stack delivery** (owner, 2026-10-23; [ADR-0013](../../../docs/adr/0013-frozen-appium-stack-ships-as-release-archives.md)).
The Phase 1 stack ships as bridge-owned release inputs and is never installed,
built or downloaded when the bridge runs:

- `stack/package.json` and `stack/package-lock.json` hold the Phase 1 candidate
  files byte for byte. CI and host tests install them with
  `npm ci --prefix stack`. They are not root dependencies of the product: the
  product's `package.json` and lockfile list only the bridge's own dependencies
  and the exact MCP client below, because Claude Code's automatic plugin install
  refuses the stack lock (git-hosted optional dependencies, bundled copies).
- The release builds one stack archive from that lock (`npm ci --ignore-scripts`
  for darwin-arm64 under a pinned Node and npm), plus a manifest of every file
  hash, package integrity and the three Android automation APK hashes. The
  archive is a plain file in the npm tarball's `files` and in the plugin zip,
  outside `node_modules`. It is not pruned: the shipped tree is the tree Phase 1
  qualified. Both channels, the npm tarball and the plugin, stay supported.
- The release also ships the exact Phase 1 WebDriverAgent runner (tree hash
  `5d1fc1c99908e253303f6de35bf26ed4a74a75817f704e7a3646b72b5271ba04`, x86_64
  and arm64) as a second archive, committed to the repository with a provenance
  record: source package and integrity, Xcode and SDK versions, build command,
  signing observations. It lands in the first build PR that adds `stack/`. The
  archive hashes and the stack identity are constants of the built bridge.
- On first use the bridge verifies each archive hash, extracts to a temporary
  directory under its private per-account location
  (`~/Library/Application Support/jev-ios-bridge/`), verifies the manifest, and
  renames into a content-addressed directory without overwriting. The CLI and
  the plugin share that one copy. Extraction uses no network, install scripts,
  npm or xcodebuild. Every start re-checks the extraction marker and the Phase 1
  loaded-file hashes and refuses on mismatch.
- iOS sessions always set `appium:usePreinstalledWDA=true` and the absolute
  `appium:prebuiltWDAPath` of the verified runner, plus the Phase 1
  `wdaLaunchTimeout`. They refuse `webDriverAgentUrl`, `usePrebuiltWDA`,
  `prebuildWDA`, `useNewWDA`, `derivedDataPath`, `bootstrapPath`, `agentPath`,
  `useXctestrunFile`, `updatedWDABundleId`, `updatedWDABundleIdSuffix` and the
  Xcode signing capabilities. The composition never exposes or calls
  `appium_prepare_ios_simulator` or `prepare_ios_real_device`, never runs the
  driver's or WDA package's download or build scripts, and refuses a WDA whose
  reported version is not 16.14.2.
- Android sessions use only the driver's packaged server, test and settings
  APKs, whose hashes must match the manifest. Capabilities that skip server
  installation or settings reinstall are not accepted.
- The supported host is macOS on Apple silicon with Node 24 or later. Any other
  host refuses before effects. Live evidence covers Node 26.8.1; Phase 4 adds
  one live case on Node 24.
- The supported iOS claim is iOS 26.5 with Xcode 27.0, the only pair the runner
  is proven on. Another iOS runtime or Xcode version warns and continues: the
  report and `doctor` name it as unsupported. The claim widens only with new
  live proof.
- The release carries a third-party notices file for the stack and the runner:
  libvips (LGPL) shipped unmodified with its licence and source link, CC-BY
  attributions, WDA's BSD text verbatim, and a hand check of packages with no
  licence metadata.
- Re-freezing is owner-triggered only. A written recipe covers it: new lock, new
  runner, new hashes and the six iOS Phase 1 cases again. Nothing bumps the stack
  automatically.

**Private MCP client.** The private connection uses the `Client` of
`@modelcontextprotocol/sdk`, a direct dependency pinned at exactly 1.32.1, the
version and integrity frozen inside the stack. Startup compares them with the
stack manifest. The client offers the SDK's latest protocol version through the
plain `initialize` handshake and refuses any negotiated version outside the
stack's recorded list. The public server keeps `@modelcontextprotocol/server`;
the two SDK generations are different packages and stay separate. The client
generation follows the frozen server's: a future stack on SDK 2.x changes the
client in the same re-freeze, with legacy negotiation pinned explicitly, never
`auto`, which would start an unowned second child.

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

**Locked observation choices** (owner, 2026-10-23, from the
[observation-mapping prototype](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/prototype/observation-mapping/.scratch/appium-phase3/prototypes/observation-mapping),
branch `prototype/observation-mapping` at `6e42862c9`):

- **Pinned source settings.** These are applied through the driver's settings
  call after session creation, never as `settings[...]` capabilities, and read
  back before the first capture. A failed readback refuses before any action.
  - iOS: `pageSourceExcludedAttributes` is `""`, so nothing is excluded.
  - Android: `ignoreUnimportantViews=false`, `enableMultiWindows=false`,
    `enableTopmostWindowFromActivePackage=true`, `snapshotMaxDepth=70`.
- **Role and field mapping.** The normalizer keeps today's meanings. The
  prototype matched today's Android output on every captured row (35 of 35).
  Against the historical MobileBuildMCP fixtures, three iOS gaps must be closed:
  - never derive `identifier` from XML `name` when it only repeats the label
  - do not add text or selected values that today's snapshot lacks
  - derive actions as today does, keeping `longPress` and `touch` where
    MobileBuildMCP offered them and never offering `tap` on a disabled control

  The 15-role vocabulary is unchanged. Features the frozen diagnostic app cannot
  show (password fields, empty hints, scrollable lists, large trees, duplicate
  independent controls, continuous change) are proven by the fixture-app
  capture ([ticket 19](../../appium-phase3/issues/19-observation-coverage-on-a-fixture-app.md))
  before the build plan relies on them.
- **Completeness.** `truncated` gets a producer. A capture is refused as
  incomplete, never passed silently, on invalid XML, a driver error, or any
  node at the configured depth limit (70). Otherwise `truncated` is `false`.
  `STATE_BUDGET` (24,000 bytes) stays. A small well-formed tree is not, by
  itself, proof of completeness.
- **iOS bounds** (owner, 2026-10-23, after the fixture-app build: a 73-deep
  iOS tree hung page source past 240 s).
  - Every iOS page source is bounded at 10 s. A timeout is a hard completeness
    signal, and the capture is refused as incomplete.
  - XCUITest `snapshotMaxDepth` is pinned at 50, and a node at depth 50 is
    refused like Android's 70.
  - WDA `waitForIdleTimeout` is pinned at 1 s, and `animationCoolOffTimeout`
    stays at 2 s, so the bridge's settle loop decides settling. The frozen
    WDA 16.14.2 exposes no readable `waitForQuiescence`; this is a recorded
    limitation, governed by the pinned values and the settle loop.
- **Tap aliases.** Today's identified parent/child clustering stays. The
  same-label, same-frame, no-identifier rule (`mobilebuildmcp-2.7.1`) becomes a
  vendor-free bridge rule, so no script that is valid today breaks. As this
  section requires, the rule needs its own bounded proof: the fixture-app
  capture must show both duplicates dispatch to the same physical target
  (unique-target test). If it cannot, the owner decides again.
- **Element references.** The bridge issues `eN` references from its own
  normalized snapshot, each bound to the explicit session and that snapshot.
  Appium element IDs are never exposed. A reference from an older snapshot or
  another session is refused as stale.
- **Measured.** Warm page source on the private pair took about 65 ms on iOS
  and 24–103 ms on Android (medians per state; Android spread 22–307 ms), on
  small trees. These are session-cost numbers, not app performance, and set no
  speed gate.

**Locked settling and screen change** (owner, 2026-10-23, [ticket 16](../../appium-phase3/issues/16-settling-and-screen-change.md)):

- **Loop.** Both platforms run today's bridge loop. It captures, waits until
  250 ms after the previous capture returned, and captures again. It stops when
  two hashes match. It starts no capture at or after 3,000 ms, and then returns
  the last capture with `settled: false`. Every action ends with this loop, and
  so does `capture`. The constants stay: warm page source measured about 65 ms
  on iOS and 24–103 ms on Android, so the cap fits 8 or more captures.
  MobileBuildMCP's post-action poll is gone. Capture reuse and the
  screenshot-agreement measurement are dropped. `phaseTimingsMs.verifyMs` stays
  as zero only if a golden requires it.
- **Hash.** One bridge-computed hash over the normalized snapshot, on both
  platforms, excluding status-bar nodes (the iOS status bar and Android
  `com.android.systemui:`). It drives `SCREEN_CHANGED`, `driven.actions[].changed`
  and driven search keys. `snapshotSequence` becomes a bridge counter on both
  platforms.
- **iOS mark.** iOS steps carry `settled: false` when the cap is reached, and
  the "Screen still changing" prose loses its Android-only gate. This is an
  additive change under ADR-0005.
- **Screenshot.** One screenshot after the settled capture, never alongside it,
  and not retaken. It is converted to a JPEG of at most 800 px, so `tapAt` pixel
  space, hand-back `screenshotSize`, the evidence names (`screen-N.jpg`,
  `observation-N.jpg`, `readiness-1.jpg`) and the 10 MiB cap keep their meaning.
  The tap-gesture prototype (08) proves the pixel-to-device conversion.
- **Still to read.** WDA's native idle and quiescence values, in the
  fixture-app session. If they add waits that break the cap, this choice returns
  to the owner.

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

**Locked text replacement** (owner, 2026-10-23, [ticket 07](../../appium-phase3/issues/07-text-replacement-and-shown-value.md);
prototype `prototype/text-replacement` at `a6e3cbbc5`):

- **iOS.** `clear` then `setValue`, as two separately dispatched commands. If
  `clear`'s acknowledgement is lost, dispatch closes and the partial outcome is
  kept; `setValue` is never sent, and nothing is retyped (P07 proved this with a
  child kill after the native clear). `setValueImmediate` is not used, because
  it delegates to `setValue`.
- **Android.** One `mobile: replaceElementValue`.
- **One mutation.** Each sequence counts as one authorized mutation.
- **Shown value.** The shown value is the field element's own value in a fresh
  capture, never a neighbouring label and never Appium's echo. In P07 an iOS
  formatted field showed `123456789` while its label read `123-456-789`, and the
  field value counts. The shown value is omitted when the field exposes only its
  hint or placeholder. Secure fields keep today's masking. A legitimate display
  transformation is not an execution failure.
- **iOS typing limits relaxed.** `UNSUPPORTED_LEADING_DASH_TEXT` and the
  US-keyboard-only rule are no longer applied on iOS: P07 showed a leading
  hyphen and multilingual Unicode accepted. The reason code stays in the
  vocabulary. Scripts that were refused now run, which is an additive change.
  Non-US keyboard layouts are a Phase 4 live check.
- **Echo filtering.** appium-mcp writes tool arguments, including typed
  values, to the child's stderr. The child's stderr goes to a bounded
  in-memory buffer. Every typed value, secure-field content and value-bearing
  argument is redacted before anything is written to run logs, evidence or
  diagnostics. Secure values never reach disk.

Keep existing iOS attach and coordinate requests explicitly refused before
input. Prove Android conversion on at least two device sizes. Do not relabel
Appium timings as app performance or copy unmeasured expiry/tap-alias metrics.

**Locked device effects** (owner, 2026-10-23, [ticket 17](../../appium-phase3/issues/17-allowed-device-effects.md); diffs on `prototype/device-effects` at `14588abc2`):

- **Android, every path.** A session is allowed to:
  - set the three hidden-API policy keys
  - set `accessibility_enabled=1`
  - start the UiAutomator2 instrumentation
  - forward `tcp:18200`

  A clean session delete undoes all four. On the first session, it may also
  install the two UiAutomator2 server APKs and their Doze whitelist entries,
  which stay installed. The Settings helper is never installed: any capability
  that would install it or grant its privileges (notification listener,
  `PROJECT_MEDIA`, permission grants, mock location) is refused, on emulators
  and phones alike. The capability set is the P17 minimum: no `appPackage`,
  `autoLaunch: false`, `skipUnlock: true`, `noReset: true`, plus
  `skipDeviceInitialization` and `skipServerInstallation` once the server is
  present.
- **Android recovery.** After an unclean exit, recovery does four things:
  - stops the owned instrumentation
  - restores the three hidden-API keys to their recorded values
  - restores `accessibility_enabled`
  - removes only the owned forward

  Each step is recorded as fence evidence. A leftover owned forward is cleared
  before the next create, since it blocks the next session.
- **iOS.** A session is allowed to reinstall and start the frozen WDA runner,
  which stays installed after delete. The Appium child runs with a private HOME
  under the bridge's per-account folder, so its Simulator and DeviceHub
  preference writes (hardware keyboard off) never touch the user's real
  `~/Library`. `isHeadless` follows the simulator's current presentation. A
  session never restarts the simulator or quits Simulator.app; a capability set
  that could do either is refused.
- **Logs.** Every session on both platforms sets `skipLogCapture: true`.
  Without it, the XCUITest driver kills the bridge's `log stream` (P17: the
  stream PID exited with 143). The bridge's console, `log stream` and logcat
  are the only log sources.

**Locked session lifetime** (owner, 2026-10-23, [ticket 10](../../appium-phase3/issues/10-session-lifetime.md)):

- **Ordinary runs, capture and attach.** One private MCP child and one Appium
  session per command, started after admission and deleted at its end. Each
  session maps to one admission attempt, one owner generation and one recorded
  component (child PID and session id). Startup cost is accepted: about 6 s
  warm, 12–78 s cold.
- **Paused driven runs.** The session stays open while waiting for
  `resolve_step`, within the existing pause budget; idle up to 900 s is proven.
  On the answer, the bridge refreshes the screen before acting, as today. If
  the session is gone, it creates a new one and hands back freshly. It never
  acts without a fresh observation.
- **Observed paths.** The preparation session is deleted before park, because a
  parked allocation has no live driver. The action executor opens its own fresh
  session with no launch, reset or termination. Session cleanup never releases
  retained allocation capacity. Observed paths stay key-free.
- **Disconnect.** The child runs with
  `APPIUM_MCP_ON_CLIENT_DISCONNECT=delete_all`. P06 proved that stdin EOF and
  killing the parent delete the sessions and end the child. Because
  `delete_all` leaves no receipt, the bridge's fence still runs and records
  receipts. A directly killed child leaves native components, which the fence
  recovers.
- **WDA.** WDA is the driver-managed preinstalled frozen runner, reinstalled
  each session. `webDriverAgentUrl` is refused (ADR-0013).
- **Idle timer.** `newCommandTimeout` is inert under appium-mcp (P06). The
  bridge's own deadlines bound every wait.

## Fencing Appium components

Locked by the owner on 2026-10-23 ([ticket 11](../../appium-phase3/issues/11-fence-evidence-for-appium-components.md)).
This applies ADR-0011: a session delete, a cleanup reply or an exited MCP
child is a hint, never a receipt.

| Component | Identity recorded before effects | Stop receipt |
|---|---|---|
| Private MCP child and its descendants (Appium server, drivers) | PID, start time, process group | The group is stopped, and every recorded PID and descendant is verified gone by PID plus start time |
| iOS WDA runner on the simulator | simulator UDID, runner bundle id, running PID | The runner is not running on that simulator |
| Android UiAutomator2 instrumentation and server | serial, PIDs and `/proc` start times | Each PID is gone by `/proc` identity |
| Android owned forward (`tcp:18200`) | serial and the forward pair | Absent from `adb forward --list` |
| Android settings (three hidden-API keys, `accessibility_enabled`) | values read before the session | Read back equal to the recorded values |
| Bridge native helpers (iOS console, `log stream`, logcat, exit watch) | PID and start time | Gone by identity |

- **Deadlines.** TERM to the owned process group, a 5 s wait, then KILL.
  Device-side steps share the existing 45 s cleanup budget. Running out of
  budget, or any missing receipt, keeps the device quarantined; it never
  releases.
- **Foreign automation.** It is recognized by owned inventory, not process
  names. Any UiAutomator2 server or instrumentation, WDA runner, or automation
  forward on the device that the admission store does not own makes the run
  `DEVICE_BUSY`. The code is unchanged, and the `captureWithForeignAgent` exit 3
  golden is kept. The bridge's own recorded components are never foreign. The
  glossary's "Foreign agent" is reworded to match.
- **Recovery of a dead owner.** The sweep:
  1. stops only the components recorded for that owner, matched by identity
  2. restores the recorded Android settings
  3. removes the owned forwards
  4. records receipts, and releases the device only when every receipt is
     present

  Anything unmatched or unprovable keeps the device quarantined. Unknown
  creation without a session id stays quarantined, as ADR-0011 requires.
- **Production code.** Phase 1's reviewed research mechanisms (`stop-group.py`,
  `fence-owned.py`, `verify-native-descendants.py` and the device-root coverage)
  become TypeScript under Phase 2's command and component records. Each
  component above becomes a recorded component kind with its own receipt kind,
  added additively to the store under ADR-0012's offline-upgrade rule if the
  schema must change.

## Mode compatibility

| Mode/path | Required public behavior |
|---|---|
| Scripted version 1 | Existing defaults, selectors/guards, actions/waits/checkpoints, typed-value resolution, false-wins verdict and stable reports/exits |
| Driven version 2 | Existing enablement, project/preflight/risk/local-only policy, budgets/search decisions, hand-back package, pause ownership and `resolve_step` |
| Observed preparation | Explicit supplied inventory or bounded fresh creation; immutable artifact hash/app compatibility; reservation/host guard before effects; readiness and parked transfer |
| Observed action | iOS-only single authored tap; before/after predicates, one executor, immutable binding/outcome, identical retrieval, changed-request conflict, cancellation/retirement/retrieval |
| Android capture | Same flags/element fields/exit semantics; settle current screen under shared admission; zero launch/reset/stop, screenshot or Jev request; `--jev` uses production renderer |
| Reports/watch/logs | Preserve frozen JSON/envelopes/file names and current access/masking behavior; keep provenance additive and truthful |

**Locked report fields and provenance** (owner, 2026-10-23, [ticket 13](../../appium-phase3/issues/13-vendor-report-fields-and-provenance.md)).
Every change is additive under ADR-0005. No field is removed, and none changes
meaning silently.

- **`error.vendorCode`** carries the underlying component's code: an Appium or
  W3C error name, an adb failure, or a bridge probe code such as
  `APP_NOT_INSTALLED`. A new additive `error.vendorSource`
  (`appium` | `adb` | `bridge`) names its source, in `report.json` and in the
  `error` event. The guide and `report-json.md` stop calling it MobileBuildMCP's
  code. The pass-through rule (only 1.1-set codes pass; the rest become
  `DEVICE_ERROR` with `vendorCode`) is unchanged.
- **Provenance.** `prepared.stack` is added:
  - `backend: "appium"`
  - the stack lock hash
  - the extension version
  - the MCP client version
  - iOS: the WDA tree hash
  - Android: the UiAutomator2 server APK hash

  Android's `prepared.agentSha256` stays, now holding the UiAutomator2 server
  APK hash. The stack manifest and the startup loaded-file check also record
  both MCP SDK generations (1.32.1, 2.3.1), fastmcp, mcp-proxy and zod, with
  versions and hashes.
- **iOS reference metrics.** `deviceMetrics.referenceRefreshes`,
  `referenceExpiries` and `nearTtlRefreshes` are not emitted for Appium runs.
  They are log-only, and no count is manufactured. `backend` explains their
  absence.
- **Kept meanings.**
  - `prepared.logSources.{runtime,os}` name the bridge's own console capture
    and `log stream` (ADR-0014).
  - Element references keep the `eN` format, scoped to one capture (see "Locked
    observation choices").
  - Observed `actionAcknowledged` means that Appium returned a successful
    response for the one dispatched action.
  - `tapAliasRule` names the vendor-free bridge rule instead of
    `mobilebuildmcp-2.7.1`. It is internal, not a public field.
  - The vendor-flavoured guide wording ("MobileBuildMCP stays pinned",
    "mobilecli stays pinned", the clipboard paragraph) is rewritten in the PR
    that switches composition.
- **Goldens that change additively.** `report-json.json` (`vendorSource`,
  `prepared.stack`), `evidence-layout.json` (the `prepared` event),
  `observed-replies-v1.json` (`vendorSource` where an error is carried), and
  `vocabulary.json` (reworded descriptions only, with codes unchanged). Every
  other golden stays byte-identical, except as the observation corpus gate
  (ADR-0004/0006) allows.

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

**Locked native steps** (owner, 2026-10-23; [ADR-0014](../../../docs/adr/0014-native-launch-and-preparation-steps-beside-appium.md)):

- **iOS app output and exit.** The bridge launches the app with
  `simctl launch --console-pty --terminate-running-process` and the script's
  launch arguments, and owns the resulting console process. The process's
  output is the runtime log source (`print()`, stdout and stderr). A bounded
  `log stream` on the app's subsystem is the OS log source. The console
  process's exit, with its PID recorded at launch, is the iOS `APP_EXITED`
  signal; a stop the bridge makes itself (restart, close) is marked as expected
  first, as Android's exit watch does. If the console or stream is lost, the
  source reads unavailable, never empty, and health reads unknown. The Appium
  session never launches or relaunches the app (`autoLaunch: false`) and
  observes the running app. Whether it can is unproven, and the session
  prototype must show it before the build plan relies on it.
- **iOS observed preparation.** Availability and `Booted` polling use the
  existing simctl probe. Boot and install use bounded, owned `simctl boot` and
  `simctl install`, for observed preparation only, beside ADR-0009's creation.
  Launch follows the iOS rule above. The readiness capture goes through the Appium
  session and this specification's normalizer. Ordinary runs keep their
  preconditions, a booted device with the app installed, and never boot or
  install.
- **Android restart.** Force-stop and start move to Appium as
  `mobile: startActivity` with stop and wait, through the extension. The exit
  watch marks that stop as expected and reads the PID after start. Logcat and
  the exit watch stay unchanged.
- **Android wake and probes.** The adb wake keyevent and the read-only launcher
  lookup, foreground and keyguard probes stay native helpers. Every Appium
  session sets `skipUnlock`. A locked screen refuses with `DEVICE_LOCKED`, as
  today.

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

Prove the delivery on the host: the packaged-install proof (npm tarball and
plugin zip) contains both archives and the notices file; first-use extraction
works offline; a tampered archive, extraction marker, manifest or runner is
refused before any session; and Claude Code's install of the plugin completes.
Installing the roughly 100 MB archive plugin from a real release and concurrent
first use by two processes are named spikes in the build plan; anything they
leave unproven is a Phase 4 claim.

Exit with the complete preservation matrix, corresponding public contract
checks, typecheck/full host/build checks and separate Standards/Spec review.
Every existing supported mode must retain success/refusal/cancellation/recovery
semantics in its platform scope. Keep a previously valid behavior outstanding
when parity is unproved; replacing it with `UNSUPPORTED_ACTION` is not acceptance.
Then dispatch [Phase 4](phase-4-acceptance.md).
