# Phase 1 stop and restart experiment

Date: 2026-10-13
Status: four scoped live checks passed; full Phase 1 remains incomplete

The owner approved interrupting a run, stopping its automation, and restarting
without repeating the interrupted action. This follows the
[device discovery](phase-1-live.md) and uses only the same private simulator
and AVD. Existing devices, the installed Android SDK, and production admission
are outside this experiment's mutations.

## Tested boundary

The disposable command journal, public Appium MCP extension, and owned native
helpers form the Phase 1 controllable-process boundary already agreed in the
[spec](spec.md). The journal uses SQLite transactions to close dispatch before
cancellation or process signals. It is an experiment ledger, not a replacement
admission authority or a device lease. It never publishes a released lease.

The launcher creates a new process group and records its identity before
executing the MCP server. Its monitor records group members. The corrected
stop helper checks precise OS process incarnations before signaling the owned
group, including when a recorded child survives the parent's death. On this
Mac, the incarnation uses the start seconds/microseconds supplied by
`PROC_PIDTBSDINFO`; the installed Xcode SDK's header and a live API query
verified the layout. A mismatched incarnation refuses signals.

The live check waits for the native proxy's four-second long-press dispatch
and confirms the command remains outstanding. It then commits dispatch
closure and cancels the request or kills the MCP process. Stopping the owned
host group precedes shutting down the dedicated device:

- iOS uses `simctl --set` with the private set and exact UUID. It shuts down
  the simulator without erasing or deleting it.
- Android verifies AVD name, serial, and emulator process incarnation. It
  stops and disables the three owned Appium packages, removes only verified
  serial/local/remote forward mappings, then terminates that emulator with
  `adb -s emulator-5570 emu kill`.

The helper samples the shutdown state, native process absence, and closed
owned ports six times across five seconds. A fresh OS process reads the
closed journal. A fresh MCP process then receives the old action and an
explicit session-creation request; both must return `DISPATCH_CLOSED` before
vendor dispatch. Another six native samples must show the device still off.
The recorded outcome remains inconclusive, with quarantine retained.

Android's targeted console termination follows the
[official emulator console contract](https://developer.android.com/studio/run/emulator-console).
No shared ADB daemon or CoreSimulator service is stopped.

## Evidence and failures

The final [matrix](evidence/stop-recovery/summary.json) records cancellation
and process failure on both platforms, all using the same corrected source
hashes. Each created one session, issued one long press, refused both restart
requests, and kept the outcome inconclusive. The 48 shutdown samples across
these cases passed. Both private devices finish shut down and remain reserved.

| Platform | Cancellation | Process failure |
|---|---|---|
| iOS | [Passed](evidence/stop-recovery/stop-ios-cancel-c-20261013/client.json) | [Passed](evidence/stop-recovery/stop-ios-process-failure-b-20261013/client.json) |
| Android | [Passed](evidence/stop-recovery/stop-android-cancel-g-20261013/client.json) | [Passed](evidence/stop-recovery/stop-android-process-failure-b-20261013/client.json) |

The [source manifest](evidence/stop-recovery/sources.json), per-case client
records, process-group receipts, native stop receipts, and restart observations
preserve the tested commands and identities. Older cases retain their source
hashes; frozen source text records preserve versions corrected afterward.

The first iOS experiment completed the press but failed to observe the native
proxy event, so it never injected cancellation. The public logger's debug
level must be set at tool authorization, after session startup. That failure
and the subsequent successful cancellation check are both retained. The later
process-failure check used the stronger process-incarnation guard.

Android emulator `36.6.1.0` repeatedly crashed during a fresh boot on this
macOS `27.0.1` host, before session creation or UI input. Restoring `USER`,
disabling Vulkan, and reducing cores did not resolve it. The first unlogged
launch timed out; subsequent logged attempts captured `SIGSEGV` and QEMU
thread hangs. Failure receipts also preserve unsuccessful cleanup checks
during a briefly stale ADB transport; subsequent preflight verification found
the device absent.

An isolated emulator `37.2.12`, build `16428233`, booted the same private AVD.
The [download record](evidence/stop-recovery/alternate-emulator.json) pins the
official archive's published checksum, size, SHA-256, executable hash, and
version output. The installed SDK remains unchanged. The selected experiment
uses two cores and the original system image. This comparison identifies a
working alternate runtime; it does not establish the old binary's root cause.

A subsequent Android process-failure experiment hit a SQLite startup-lock
race before fault injection. The journal configured its busy timeout after
an earlier pragma could encounter the competing writer. Manual recovery
stopped only the recorded host group and private emulator, then committed
closure; its [receipt](evidence/stop-recovery/stop-android-process-failure-20261013/manual-recovery.json)
preserves the failure and one completed press. A controlled external SQLite
writer reproduced the same error at the public process boundary. Configuring
the timeout when opening SQLite and before other pragmas made that test pass.
Cleanup now runs even when journal closure or failure inspection throws.

## Host verification and remaining work

Five public-boundary host tests cover fresh-process refusal without replay,
late completion preserving uncertainty, incomplete native evidence retaining
quarantine, a surviving child versus an independent process, incarnation
mismatch, foreign-device refusal, and competing-writer startup. The tests first
failed at the missing journal/stop capabilities, insufficient incarnation
check, and locked startup, then passed
after those capabilities were added.

The final `npm run check` passed typechecking, all 2,263 tests with no failures
or skips, and the build. Receipt/source hashes, historical frozen sources,
and preservation of the installed SDK emulator executable also passed checks.

This experiment does not complete Testing Decision 21. The shutdown mechanism
is scoped to the two privately owned virtual devices. It does not establish
a fence for borrowed devices or physical phones, and the five-second samples
alone are not a general release guarantee. Complete component/escaped-child
inventory, actual-loaded stack and alternate-artifact refusal contracts,
protocol fixtures, all fault acceptance, and authoritative production
quarantine/reconciliation remain pending. No production adapter is wired in,
and neither a production lease nor quarantine is released.
