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

## Comments

### 2026-09-30, claude-issue-11

**Built** (commits `4f88bb7`, `f263863`):
- `src/device/android/adb.ts`:
  - `AdbRunner` (args, signal → stdout, stderr, exit code) and `adbRunner({ adb, environment, spawn? })`, the production runner. It spawns the given `adb` with `shell: false`, strips `TYPESAFE_API_KEY` again and keeps everything else, including `ANDROID_ADB_SERVER_PORT`. An abort sends the child SIGKILL.
  - A non-zero exit is returned, not thrown. A child that ends with no exit status (killed, or aborted) throws `OutcomeUnknownError` (`DEVICE_ERROR`, `vendorCode` `adb`).
  - `inLedger(lease, kind, issue)`, the driver's one helper for the ledger. It records the command before it runs, calls `exited()` on a result or any other error, and `unknown()` on `OutcomeUnknownError`.
- `src/device/android/agent-client.ts`:
  - `DeviceAgentClient`, with typed `version`, `dumpUi(waitUntilIdleMs)`, `tap`, `swipe`, `keys`, `text`, `button`, `clipboardSet`, `clipboardClear` and `screenshot(maxSize)`, and `deviceAgentClient({ port })`.
  - Each request is one POST to `http://127.0.0.1:<port>/` with `agent: false`, `Content-Length`, `Connection: close` and a fresh numeric `id`. It is never re-sent.
  - Time limits: 10 s, or the dump's idle wait plus 10 s. A request counts as sent once its connection opens. After that, a timeout, a dropped connection, a reply cut short, or an abort throws `OutcomeUnknownError` (`vendorCode` `agent`).
  - A JSON-RPC error throws `DeviceAgentError` (a `DeviceReasonError`: `DEVICE_ERROR`, `vendorCode` `agent`), which keeps only the numeric `rpcCode` and never the message. A reply that isn't this request's JSON-RPC, or lacks the method's result, is also a `DeviceAgentError`, with no code.
- `src/device/lease.ts`: `DeviceCommandKind` gains `adb` and `agent`. Nothing else changed.

**Beyond the Issue, all defensive:**
- A body of 1 MiB or more, or a coordinate that isn't a whole number, is refused before anything is sent.
- A reply over 32 MiB is refused.
- An agent that refuses the connection is a known `DeviceAgentError`, because nothing was sent.

**Deviations:** `OutcomeUnknownError` and `inLedger` live in `adb.ts`, because this Issue owns only two files. The agent client imports `OutcomeUnknownError` from there.

**Open-point defaults used:**
- 3: agent and `adb` failures are `DEVICE_ERROR` with `vendorCode` `agent` or `adb`, and their messages are never kept.
- 9: `screenshot(maxSize)` sends `{format: 'jpeg', maxSize}`.
- 23: `keys` takes `{keycode, modifiers?}` as the tracer sent them.

**Tests added:**
- `tests/android-adb.test.ts`, 11 tests. With a fake spawn: the arguments, no shell, and the output; a non-zero exit; the environment; an abort killing the child (an unknown outcome); a child killed with no status; an abort that races an exit; a signal already aborted; a spawn error. Also the three `inLedger` outcomes.
- `tests/android-agent-client.test.ts`, 14 tests, against a local server on `127.0.0.1:0`. They cover:
  - the exact body and headers, and one connection per request;
  - every method's name and parameters, and the typed results;
  - a JSON-RPC error with no screen text anywhere in the error;
  - malformed replies and missing results;
  - a timeout (unknown outcome, sent once), and the dump's longer limit;
  - a connection dropped before the reply, and one dropped during it;
  - an abort after the request was sent, and a signal already aborted;
  - an agent that can't be reached;
  - the refusals before sending.
- `tests/device-lease.test.ts`, 3 new tests:
  - an unknown `agent` request keeps the lease until `fence('agent')`;
  - `fence('agent')` leaves an unknown `adb` command holding the lease;
  - commands still in flight aren't ended by a fence.

  No existing test changed.

**Gate:** `npm run check` passed, 270/270 tests, at `f263863`. The log is `$TMPDIR/implement-phase4-11-check.log`.

**Open for a later Issue (14 or 16):** `failureOf` in `src/scripted/run.ts` returns only `{ code }` for a `DeviceReasonError`, so the `vendorCode` these errors carry doesn't yet reach `run.jsonl` or `report.json`. It needs to pass an optional `vendorCode` through, with a `runScriptedScenario` test. This Issue couldn't edit that file.
