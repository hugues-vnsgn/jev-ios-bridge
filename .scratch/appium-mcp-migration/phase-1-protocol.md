# Phase 1 protocol and admission checks

Date: 2026-10-13
Base: `5e0f58a04e6ef4e57b6b93564f1b772de791cc9c`
Scope: host protocol proof; Phase 1 remains incomplete

The owner approved reply validation, version refusal, and competing device
claims after the [stop/restart checks](phase-1-stop-recovery.md). This work
stays in the migration worktree. Production source, dependencies, admission
schema, and historical ownership records remain unchanged.

## Results

Eleven new host tests passed. The protocol tests exercise 60 controlled MCP
traces, including two valid recorded round trips. A separate two-process test
allows one additional winning tracer and prevents the loser from reaching
the provider. The final host check result is recorded in the
[summary](evidence/protocol/summary.json).

| Check | Observed result |
|---|---|
| Server and required schemas | Changed versions, missing/duplicate tools, and changed schemas stop before session creation |
| Creation | Missing, wrongly typed, conflicting, foreign, attached, or duplicate session identities stop after one creation request |
| XML and target resolution | Invalid envelopes, malformed XML, DTD/entity declarations, missing values, invalid element IDs, and zero/multiple matches prevent input |
| Tap completion | Errors, lost replies, prose-only success, and conflicting receipts stop after one tap; no retry |
| Screenshot | Inline PNG required; validate signature, chunks, CRCs, compressed image size, dimensions, and row filters; viewer HTML is rejected |
| Runtime selection | Changed version, integrity, loaded-file hash, or WDA record stops before creation |
| Competing processes | Existing iOS admission implementation admits one owner; loser sends no provider request; quarantine prevents later acquisition |

The tracer now checks `Selected: None` before lookup or input and checks a
fresh `Selected: Apple` after the tap. Every session-scoped request has an
explicit validated ID. Replies and errors become fixed reason codes in the
client output; vendor text containing a planted private value does not escape.
Successful deletion remains a terminal tool response, never a native fence.

The [fixtures](candidate-stack/fixtures/protocol.json) preserve consumed
native text and structured creation data from the earlier iOS and Android
receipts. They omit unconsumed HTML resources. The inline screenshot fixture
uses each saved native PNG with the pinned public `returnRawBase64` contract;
it is a constructed fixture, not a newly captured inline native response.
The earlier screenshot failure remains in its original evidence. This tracer accepts the measured 8-bit, noninterlaced RGB/RGBA image subset
and conservatively refuses palette chunks. The review reproduced acceptance
of CRC-valid malformed palettes, chunk names, and trailing compressed data;
added provider faults now
refuse them under the [PNG chunk rules](https://www.w3.org/TR/png-3/#5Chunk-layout).
General PNG decoding remains later adapter work. Startup
`appium:settings[...]` fields are consumed by Appium and absent from iOS
session metadata; identity and the remaining requested capabilities must
match. Full startup-setting behavior still needs the later adapter tests.

## Public extension and loaded stack

The [public-core probe](evidence/protocol/public-extension.json) starts the
real candidate server and reads its verified stack without creating a device
session. Controlled provider tools then exercise the actual public hook
pipeline for terminal receipts, missing-ID refusal, and error filtering.
The extension's creation hook has not yet been exercised live.

The [stack record](evidence/protocol/stack.json) records 523 loaded files from
the selected components, including both base-driver copies, both WDA npm
copies, and MCP SDK 1.32.1. Node's public module-load hooks measure imports
through `appium-mcp/core` and the public MCP client before session creation.
The lockfile still records the full 1,221-entry resolved graph and archive
integrities. This proves the measured startup imports, not every module or
native component that a later session may start.

The selected WDA bundle still matches all 47 file hashes and its recorded
architecture/signing provenance. Strict signing verification remains failed
as documented for the simulator build; this adds no physical-iPhone claim.
The real public server rejects an alternate bundle path and replacement
settings before its creation authorization counter changes. An unrelated
owned decoy cache leaves its pinned selection unchanged. No latest artifact
was downloaded. Neither package nor SDK installation was modified.

## Admission boundary and remaining work

The race uses the real existing admission module in an isolated fake-only
store. Different processes, working directories, HOME/TMPDIR settings,
UUID case, and store-path aliases converge on one authority. Read-only
production-root resolution also remains independent of those environment
settings. One owner reaches the controlled provider; duplicate retrieval
sends no input. The fixture authorizes a whole tracer and retains quarantine;
it does not prove per-native-command accounting or production recovery.
Android AVD/serial identity and offline admission migration remain pending.

Read-only final checks confirm both private virtual devices are still off
and their owned ports are closed. This work creates zero native sessions,
sends zero native input, and does not control any other device. It releases
no production lease. Setup failures, the pre-input guard correction, and the
wrongly typed ID rejection are retained in the research logs and summary.

Next, prove complete native component accounting and reconcile stop evidence
with authoritative ownership. Then rerun the corrected tracer live on both
private devices, including creation/result loss and cleanup. Every required
Phase 1 item must pass before full adapter integration.
