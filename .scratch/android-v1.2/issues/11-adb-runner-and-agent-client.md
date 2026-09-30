# Phase 4: the adb runner and the device agent's client

Status: claimed
Claimed by: claude-issue-11
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 4". The work is [the release spec's phase 4](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) item 4's "The client", and item 8's "Tracking". Read them in full. The detail below only adds acceptance criteria.

## What to build

New code goes in `src/device/android/`.

1. **The `adb` runner type and its production runner.** An `AdbRunner` takes the arguments and a signal, and returns stdout, stderr and the exit code, as `CliRunner` does for MobileBuildMCP. The production runner spawns the `adb` that Issue 10 finds, with `adbEnvironment()`, and never through a shell on the Mac. A signal abort kills the child. It also exposes whether the child exited (with a status) or was killed with no exit status, so the driver can record an unknown outcome.
2. **The device agent's client**, the anti-corruption layer to mobilecli's agent (domain model). Only this module knows JSON-RPC and the agent's method names.
   - One HTTP/1.1 POST per request to `http://127.0.0.1:<port>/`: one JSON-RPC 2.0 request with its own `id`, `Content-Length` set, `Connection: close`, a body under 1 MiB, and no connection reuse.
   - Typed methods for exactly the calls the driver needs, with the parameter shapes the tracer confirmed (spec, "Implementation Decisions"): `version`, `dumpUi(waitUntilIdleMs)`, `tap`, `swipe`, `keys`, `text`, `button`, `clipboardSet`, `clipboardClear`, `screenshot`.
   - A JSON-RPC error becomes a `DeviceReasonError` with `DEVICE_ERROR` and `vendorCode` `agent`. **Its message is never kept**, because it can carry screen text: keep only the numeric code.
   - Time limits: 10 s, or the dump's idle wait plus 10 s. A request that times out, or whose connection drops before a reply, has an **unknown** outcome and is **never re-sent**.
   - An aborted signal ends the request at once, with an unknown outcome if it was already sent.
3. **The lease's command kinds.** `DeviceCommandKind` gains `adb` and `agent`. Every finite `adb` command and every agent request is recorded in the lease's in-flight ledger until it ends: `exited()` on a known outcome, `unknown()` on a timeout, a dropped connection, or a child killed with no exit status. `fence('agent')` then covers unknown agent requests only. Give the driver one small helper that runs a command inside the ledger, so Issues 14 to 16 don't repeat it.

## Acceptance

- The client is tested against a local HTTP server that the test starts on `127.0.0.1:0`: the exact request body and headers, one connection per request, a result, a JSON-RPC error (the message isn't in the thrown error or its fields), a timeout (unknown outcome, sent once), a dropped connection, and an aborted signal.
- The production `adb` runner is tested with a fake spawn: its arguments, its environment (no `TYPESAFE_API_KEY`, `ANDROID_ADB_SERVER_PORT` kept), abort, and a child killed with no status.
- `tests/device-lease.test.ts` gains tests for the two new kinds: an unknown `agent` request keeps the lease until `fence('agent')`, and `fence('agent')` doesn't clear an unknown `adb` command.
- The iOS driver's `mobilebuildmcp` kind and every existing lease test are unchanged.
- `npm run check` passes. No device is touched.
