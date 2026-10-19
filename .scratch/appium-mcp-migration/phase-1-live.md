# Phase 1 dedicated devices and live discovery

Date: 2026-10-13
Status: dedicated pair prepared; full feasibility gate incomplete

The owner delegated device and app selection, with an explicit instruction
to avoid the device another agent uses. Every existing device was excluded.
The running `18pro` simulator was only listed; no device command targeted it.
Existing AVDs and the production admission database were not modified.

## Prepared pair

| Platform | Dedicated device | App |
|---|---|---|
| iOS | `jev-appium-phase1-20261013`, iPhone 17, iOS 26.4, UUID `40A5E14C-7B08-43A0-844A-76FB94B4B34A` | Repo diagnostic app, `dev.jevbridge.diagnostic` |
| Android | `jev_appium_phase1_20261013`, API 36.1 arm64, serial `emulator-5570` | Repo diagnostic app, `dev.jevbridge.diagnostic` |

The simulator belongs to a private CoreSimulator device set under this
worktree. The emulator uses a new AVD in a private AVD directory, headless
and without snapshots. Neither uses an existing agent's device or AVD.
The [preparation record](evidence/dedicated-device-preparation.json) preserves
creation intent, returned identities, launch arguments, app hashes, and source
commit. Both apps built successfully and were installed and launched with
explicit device identities. Both devices remain reserved for this work.

## Live results

Appium MCP created an explicit owned session on each device. It read native
XML, found exactly one `choose.apple` element, dispatched one tap, and read
`Selected: Apple` afterward. Each screenshot's original saved path and PNG
dimensions/hash were checked. See [iOS evidence](evidence/smoke-ios.json),
[Android evidence](evidence/smoke-android.json), and the
[summary](evidence/live-discovery-summary.json).

These were disposable experiments. Their first attempts refused before
vendor creation because the public plugin's lazy initialization had not
completed. Synchronous registration supplied the public core object instead.
The next experiments created sessions and read screens, then failed in the
local XML reader before any tap. Correcting the parser API allowed the two
native action/check round trips. A later screenshot assertion still failed:
the client advertised the wrong UI MIME type, so the vendor returned a saved
path instead of the expected structured payload. The original files were
validated separately, without repeating a tap. The original failures remain
in the evidence; these are not two passing end-to-end experiments.

Ten fault experiments completed: lost creation reply, lost action reply,
late action reply, cancellation during an authorized long press, and MCP
process failure during an authorized long press, on both platforms.
Each recorded one creation attempt and at most one action attempt. None
replayed a mutation. Client outcomes stayed inconclusive, dispatch closure
was persisted, quarantine records remained readable after server exit, and
late replies did not revise the recorded outcome.

The stop helper targeted only WDA on the private simulator and UiAutomator2,
its test package, Appium settings, and recorded forwards on the dedicated
emulator. It observed the targeted components stopped. The first Android
lost-creation experiment left ADB forwards behind. The next independent
creation failed because port 18200 was busy; it dispatched no authored UI
action. Later cleanup checked exact serial/local/remote mappings before
removing only the dedicated forwards, then checked that both owned host ports
were closed. No shared ADB daemon or foreign forward was stopped.

Review found that `dumpsys activity instrumentation` is unsupported on this
Android image even though it exits zero. Those historical receipts now label
instrumentation state unverified; their text is not negative evidence. A
supported process dump also found the settings notification-listener service
had restarted after force-stop. A subsequent
[owned-package stop experiment](evidence/android-owned-packages-disabled.json)
disabled only this emulator's three Appium packages, waited five seconds,
checked their disabled state and process absence, and checked both forwards
and host ports. This is a stronger observation, still pending a complete
bounded recovery/fence contract. Re-enable those known owned packages before
a separately authorized fresh Appium experiment; do not resume an uncertain
action. The diagnostic app remains installed and usable.

This does not establish the complete native-release predicate. The scripts
leave `leaseReleased: false` and retain their quarantine records. They do
not exercise production admission, immutable scenario outcomes, or recovery.
Reading a persisted quarantine flag is persistence evidence, not proof of
authoritative reconciliation. Owned host-child inventory, bounded recovery,
and a durable component-identity/fence contract remain unproved.

## WDA artifact

The experiment built WDA from the XCUITest driver's bundled npm package
`16.14.2` using Xcode 27.0, with `CODE_SIGNING_ALLOWED=NO` and
`build-for-testing`. The [artifact record](evidence/wda-artifact.json) pins
all 47 file hashes, the arm64/x86_64 architectures, build command, and actual
signature/verification output. The runner executable reports Apple's supplied
signature; the locally built test bundle reports an ad hoc signature. Strict
bundle verification failed for both bundles. The record preserves those
results; successful simulator execution does not establish signing support.

Sessions supplied the exact prebuilt path with `usePreinstalledWDA`; no
upstream preparation/latest-download or newest-cache selection was invoked.
All 47 installed WDA files matched the frozen build in the
[installed-artifact check](evidence/wda-installed-artifact.json).
This establishes the experiment's artifact identity, not an approved release
stack or a general runtime-selection refusal contract.

## Remaining Phase 1 work

Validate the complete consumed protocol, including malformed/missing results
and runtime/schema mismatches. Prove the actual-loaded dependency graph and
the refusal of alternate WDA selections. Build and test the bounded durable
ownership, quarantine/reconciliation, and native-release contract at the
controllable MCP boundary. Then rerun clean normal and fault acceptance on
this pair. Every required gate must pass before full adapter work.

The [archived experiment sources](candidate-stack/experiments/README.md)
use only the public Appium MCP/core API. They are research artifacts and are
not wired into either production entry point. Production integration remains
stopped under Testing Decision 21; the device-selection question is resolved.

The subsequent [stop/restart experiment](phase-1-stop-recovery.md) passed
cancellation and process-failure checks on both private devices. They now
finish shut down. This strengthens the scoped evidence while retaining the
full gate's outstanding requirements and quarantine.
