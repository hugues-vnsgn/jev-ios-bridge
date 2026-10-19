# Disposable Phase 1 experiments

These sources archive the experiments behind
[the live report](../../phase-1-live.md). They are not production adapters.

They were staged under `../../runtime/`, with a `runtime/node_modules` symlink
to the locked candidate install. Their relative paths assume that staging
location. Do not execute these archived files in place. The preparation
record identifies the dedicated devices and app builds; all device commands
must retain those identities and the private simulator set.

The normal experiment requires a fresh `Selected: None` app state. Fault
experiments refuse an existing evidence or work directory. Reproduction
requires a separately identified independent experiment after owned work is
settled; it must not resume or replay an uncertain action. The scripts retain
quarantine and never release a production device lease.

`fault-server.mjs` uses public plugin hooks to suppress or delay replies.
`fault-client.mjs` records client uncertainty and closes dispatch.
`fence-owned.py` records manual stop observations for the dedicated components.
Those observations do not prove the full durable native-release predicate.
The live report records the original initialization, XML-reader, screenshot,
and Android port failures rather than presenting every run as passing.
The corrected stop helper disables the dedicated emulator's three owned
Appium packages because the settings service can restart after force-stop.
They must be explicitly re-enabled before a fresh independent experiment.
Historical unsupported instrumentation queries remain labeled unverified.

## Stop and restart experiment

The newer `stop-client.mjs`, `stop-server.mjs`, `stop-journal.mjs`,
`owned-launcher.py`, `stop-group.py`, and `stop-owned-device.py` run directly
from this directory with the locked candidate install. They use the same
dedicated pair and a disposable transactional command journal. Each case
requires a new evidence/work directory and an initially shut-down device.
The Android case also requires the pinned isolated emulator artifact
in `evidence/stop-recovery/alternate-emulator.json`; it does not update the
installed SDK. Its read-only AVD starts fresh, so the frozen diagnostic APK
is installed again before creating the Appium session.

Run the client with `ios|android`, `cancel|process-failure`, and a new case
name. It dispatches one background long press, closes dispatch, stops the
owned process group and virtual device, and challenges a fresh MCP process
with the closed run. It retains quarantine and never releases a lease.
The [stop/recovery report](../../phase-1-stop-recovery.md) records corrections,
failed attempts, scoped evidence, and the remaining feasibility requirements.

## Host protocol experiment

`protocol-client.mjs` runs the fixed observe/tap/check tracer against a private
MCP process. `protocol-contract.mjs` validates the frozen consumed replies;
`validate-xml.py` parses bounded XML on the host. The fixtures preserve native
receipts and identify constructed inline screenshot data. The tracer closes
on invalid replies and makes no mutation retry. It has no production
admission or recovery wiring; do not use it to resume uncertain device work.

The public-core `protocol-extension.mjs` exposes versioned session and terminal
receipts plus a measured stack and explicitly process-local inventory.
`protocol-server.mjs` uses only the pinned dedicated profile and refuses a
stack mismatch before creation. Its creation extension still needs live
proof. Its cleanup receipt and empty inventory never authorize lease release.

`stack-probe.mjs` records selected-component files actually loaded by public
core/client imports and checks the exact WDA bundle. It requires the locked
candidate install and frozen WDA build. `public-extension-probe.mjs` first
starts the real server for read-only discovery and artifact-selection refusal,
then uses `extension-controlled-server.mjs` to exercise real hooks with a
controlled provider. It creates no native sessions or input. Run either
probe directly from this directory; run the host tests from the worktree root:

```sh
npx tsx --test tests/appium-protocol.test.ts tests/appium-admission.test.ts
```

The admission test uses the existing authority implementation with an
isolated fake-only store. It establishes iOS exclusion without Android schema
migration or production authority writes. See the
[protocol report](../../phase-1-protocol.md) for evidence and remaining gates.
