# Observed-action public contract decision

2026-10-08; planning only, no product edits or device operations. Resolves [Choose the observed-action public contract](../issues/04-public-contract.md) using the accepted [seam](seam-decision.md), [admission](admission-decision.md) and coordinated [allocation](allocation-contract.md) decisions. Allocation owns preparation schemas and lifecycle; this document owns action schemas and adapters.

## Facts and choice

Actual [`src/cli.ts`](../../../src/cli.ts), [`src/mcp/index.ts`](../../../src/mcp/index.ts) and [`src/service.ts`](../../../src/service.ts) route scripts through `BridgeService` and interpret scenario verdicts. [`observed-run.ts`](../../../src/experimental/observed-run.ts) instead accepts `experimental: "observed-tap-v1"`, a raw `deviceId`, and creates provisional evidence. [`observed-tap.ts`](../../../src/experimental/observed-tap.ts) supplies four visible outcomes and submits through `tapOnce`. Its journal reads and finalization are not sufficient public authority, as the admission audit establishes.

Choose additive tools/commands over a script step, scenario mode flag, or two independent wrappers. `ObservedActionService` owns `start`, `inspect`, `cancel`, `close`; both adapters cross that same interface. Preparation delegates to the allocation module. Use **observed action**, **observed outcome**, **observed evidence**, **device admission**, and **device allocation**, preserving `CONTEXT.md`'s Scenario/Run/Verdict/Report meanings. An observed outcome is visible predicate evidence, never Jev judgment, causal proof, a native receipt, or permission to replay. Coordinator captures these terms in shared domain docs.

## Identity and request

Declare the same `actionId` before allocation or any effect. `prepare_observed_allocation` reserves it globally in the per-user admission store alongside a distinct server-generated `allocationId`; each allocation serves that one action. Preparation digest and later action digest are separate immutable bindings. A failed/uncertain preparation retains both identities. No replacement allocation is allowed for that action.

`start_observed_action` accepts exactly this strict JSON object (every displayed field required):

```ts
interface ObservedActionRequestV1 {
  version: 1;
  actionId: string;
  allocationId: string;
  app: { bundleId: string };
  action: { kind: 'tap'; selector: Selector };
  before: Guard;
  after: Guard;
  timeoutMs: number;
}
```

`actionId` matches `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`; `allocationId` is a UUID normalized uppercase. `bundleId` matches the existing iOS bundle pattern and the prepared app. `Selector` is the existing strict `selectorSchema`: optional identifier/role/label/value, at least identifier/role/label, bridge-owned roles, identifier/label 1–500 nonblank characters, value 1–500 characters used only as a filter. `Guard` is existing `screenGuardSchema`: required `present` array of 1–12 selectors, optional `absent` array of 0–12 selectors. Match all selector fields exactly; present needs exactly one visible positive-frame match, absent needs none. Ambiguous present conditions refuse. Required integer `timeoutMs` is 100–60000, total action observation/execution budget after admitted start. Internal polling is 100ms; local finalization has a separate 5000ms budget. The whole JSON request is at most 64KiB. Reject unknown fields, unsupported/missing version, raw UDID, coordinates, element references, launch arguments, extra actions, arbitrary paths, and caller-supplied admission roots/tokens.

Validate offline first. Resolve the declared allocation and verify matching action/app. Atomically bind the first accepted action digest and transfer the ready allocation's fenced ownership into the action before any new device call. Preparation must have settled its underlying commands and closed its dispatch gate; a new process can receive the durable ownership transfer. Use a fresh observation for guards and targeting, without repeating boot/install/launch merely to transfer ownership.

Canonical digest is SHA-256 of parsed JSON with recursively sorted object keys, original array order/text preserved, absent `absent` normalized to `[]`, normalized allocation UUID, and all other required values unchanged; bind the canonical device identity as immutable resolved metadata. Same actionId + identical parsed action request is **retrieval**, checked before allocation availability or current device disposition. Changed payload, allocation or device is `ACTION_ID_CONFLICT`, with zero backend calls. Concurrent identical starts have one executor and retrieval for competitors. Start on an unready allocation returns `ALLOCATION_NOT_READY` without action execution/binding; preparation identity remains reserved. Missing action binding is `ACTION_NOT_STARTED`, never an invitation to replace its allocation. Retry after a lost reply uses the exact original request/IDs or read tools. The bridge cannot recognize a business operation deliberately renamed under a new ID.

## Authoritative snapshots

All successful action tools return the same versioned snapshot:

```ts
interface ObservedActionSnapshotV1 {
  version: 1;
  kind: 'observed-action';
  actionId: string;
  allocationId: string;
  device: { platform: 'ios-simulator'; udid: string }; // uppercase UUID
  bridgeVersion: string;
  state: 'running' | 'finalizing' | 'terminal' | 'unresolved';
  authority: 'none' | 'unconfirmed' | 'committed';
  disposition: 'started' | 'retrieved'; // started only in first start reply
  cancellationRequested: boolean;
  actionAttempted: boolean | null;
  actionAcknowledged: boolean | null;
  observations: number; // durably recorded captures; >=0
  outcome: null | 'outcome_observed' | 'already_satisfied' | 'refused' | 'inconclusive';
  reason: null | ObservedReason;
  admission: 'active' | 'available' | 'quarantined' | 'unknown';
  allocationState: 'preparing' | 'ready' | 'executing' | 'retained' | 'quarantined';
  evidence: {
    directory: string; request: string; observations: string[];
    terminal: string | null;
    exportStatus: 'pending' | 'complete' | 'failed';
  };
}
```

`terminal/committed` alone has a non-null outcome. `running/none` and `finalizing/none` have null outcome/reason. `unresolved/unconfirmed` has null outcome and `OWNER_UNAVAILABLE` or `FINALIZATION_UNCONFIRMED`; it retains unavailable admission. `actionAttempted` records dispatch, not input consumption; acknowledgement is transport acknowledgement only. `null` means durable evidence cannot determine the flag, especially interrupted dispatch. Never substitute false after a crash. Acknowledged true implies attempted true. `already_satisfied` requires both false; `outcome_observed` requires both true. Inspect returns persisted flags, never projections from a provisional success file. `disposition` is response metadata, not persisted terminal identity.

`ObservedReason` is the union of the two unresolved codes above and the terminal codes below. Terminal reason is null for the two observed successes; otherwise a bridge-owned code: `PRECONDITION_NOT_MET`, `TARGET_NOT_UNIQUE`, `AMBIGUOUS_CONDITION`, `INVALID_OBSERVATION`, `TARGET_UNAVAILABLE`, `UNSUPPORTED_ACTION`, `DEVICE_ERROR`, `DEADLINE_EXCEEDED`, `CANCELLED`, `PREPARATION_UNCONFIRMED`, `OBSERVATION_UNCONFIRMED`, `UI_ACTION_UNCONFIRMED`, `FINISH_UNCONFIRMED`, `RESULT_EVIDENCE_UNCONFIRMED`, `OWNER_LOST`, `INTERNAL_ERROR`. Map unknown upstream reasons to `DEVICE_ERROR`; never forward vendor output. Late acknowledgements are diagnostics and cannot promote outcome or clear uncertainty.

`refused` means no tap was submitted, with settled host operations; it does not undo preparation. Any unknown preparation/capture/input/cleanup/evidence state becomes committed `inconclusive` plus quarantine. Terminal outcome and disposition commit together in admission's transaction. An ambiguous COMMIT produces `unresolved`, followed only by authoritative retrieval. A verified committed result may later be retrieved, never executed again. `admission` and `allocationState` describe current disposition separately from historical outcome; successful dedicated devices are still retained by allocation policy.

## MCP, CLI, cancellation and restart

Tools: `start_observed_action(request)`, `get_observed_action({actionId, waitMs?})`, `cancel_observed_action({actionId})`. `waitMs` integer 0–45000, default 0. Get is annotated read-only, reads one consistent durable snapshot, and wakes on terminal/unresolved or timeout. Aborting a wait only stops that wait. Lost start replies or request transport cancellation never resubmit or silently abort an admitted action; explicit cancellation/server shutdown controls the attempt.

Cancellation persists `cancellationRequested` for the exact active attempt, including when another updated bridge process owns it. Cancel and backend-dispatch authorization linearize through the same admission transaction/owner generation: after cancellation commits, later authorization is denied. An already authorized/issued operation may still act. The owner also checks each 100ms wait iteration and closes its local dispatch gate upon observing cancellation; polling alone is not a fence. Cancellation waits at most 5000ms for local finalization, then returns the current snapshot. Repeated cancel/terminal cancel is retrieval; no device cleanup promise. Unknown outstanding work yields quarantine. If the owner is unavailable, retain the cancellation request and unavailable admission; no takeover/input. `close` revokes owned jobs and follows the same bounded finalization; it never cancels unrelated processes' jobs.

MCP replies contain a concise visible summary and the complete snapshot JSON in a second text content block; do not depend on hidden structured output. Existing tools retain their outputs. Admission/refusal errors set `isError: true`; committed observed `refused`/`inconclusive` are successful tool calls with explicit outcomes. Allocation tools are `prepare_observed_allocation(request)`, `get_observed_allocation({allocationId,waitMs?})`, `cancel_observed_allocation({allocationId})`, `retire_observed_allocation({allocationId})`; UUID validation is shared. Exact preparation/snapshot schemas are in allocation-contract.md. Allocation cancel durably cancels preparation, or retires ready-unused allocation, with the same 5000ms wait and dispatch linearization. Executing returns `ALLOCATION_BUSY` plus actionId/current state and directs explicit action cancellation; terminal cancel retrieves. Retire changes retention metadata only and never operates a device.

CLI:

```text
jev-ios-bridge observed-allocate <allocation-request.json> [--json]
jev-ios-bridge observed-allocation <allocation-id> [--json] [--wait-ms N]
jev-ios-bridge observed-retire <allocation-id> [--json]
jev-ios-bridge observed-allocation-cancel <allocation-id> [--json]
jev-ios-bridge observed-action <action-request.json> [--json]
jev-ios-bridge observed-report <action-id> [--json] [--wait-ms N]
jev-ios-bridge observed-cancel <action-id> [--json]
```

`observed-action` owns execution and waits until terminal/unresolved; other action commands use the same snapshot resolver. JSON stdout is one complete snapshot/error, stderr notices only; prose includes authority and full local evidence path. Action exit codes: 0 committed `outcome_observed`/`already_satisfied`; 2 committed `inconclusive`, active/finalizing/unresolved snapshots; 3 committed `refused` or operation error. Code 1 remains reserved for legacy failed verdicts. Report/cancel use this mapping. Allocation exits: 0 committed `prepared`/`action_completed`/`retired_unused`; 3 committed `refused` or operation errors; otherwise 2, including preparing/executing/quarantined/unconfirmed. These use the allocation snapshot's explicit `outcome`, independently of state. Allocation get accepts the same optional 0–45000ms wait, implemented read-only through the shared module; prepare waits within its overall/finalization budgets. SIGINT/SIGTERM revoke owned work, attempt bounded local finalization, then exit 130/143 even if evidence is terminal. Read-command signals only stop waiting. No detach/start-and-exit mode in this slice.

Require `JEV_EXPERIMENTAL_OBSERVED=1` plus successful offline admission migration/config validation before allocation/start. Disabled mode omits prepare/start MCP tools and refuses their CLI commands with `OBSERVED_DISABLED`; action/allocation reads and both cancellation tools/retirement remain available for existing identities. Invalid enablement/config never falls back. `mcp` startup and every observed command require no `TYPESAFE_API_KEY`, SDK construction, model call or network judgment. Scenario judges stay lazily constructed at scenario start; existing scenario key behavior is preserved. `JEV_PROJECT_DIR` resolves local request/artifact configuration, `JEV_RUNS_DIR` selects evidence placement only, and neither changes admission identity/root.

Restart performs explicit owner-aware recovery separately from polling: preserve other live owners, conservatively quarantine proven abandoned expected token/generation claims, never resume preparation/action or auto-clear. Until recovery establishes a terminal, read returns unresolved/current active evidence. Missing/corrupt initialized storage refuses authority and all new effects; do not reconstruct success from exports.

## Evidence, errors, compatibility and gates

Persist private exclusive evidence under `<runsDir>/observed/<actionId>/`: `request.json`, `observation-N.json`, `observation-N.jpg` when available, explicitly non-authoritative `provisional-result.json`, and `terminal.json` exported solely from the authoritative committed record. Persist absolute pointers in admission so restart/cwd changes cannot relocate lookup. No existing scenario filenames/envelopes change. Missing/export-failed evidence is reported separately; an export failure after authoritative commit cannot rewrite the outcome. Screens/requests may contain app text and remain local. Read tools return pointers, not arbitrary file content; no observed watch/log pane or Jev report conversion is introduced.

Error JSON: `{version:1,kind:"observed-operation-error",code,message,actionId?,allocationId?,acceptance:"no"|"yes"|"unknown",acceptanceKind:"action"|"preparation",blockingAllocationId?,evidenceDirectory?}`. For action operations `acceptanceKind` is `action` and acceptance refers to action intent binding; for allocation operations it is `preparation` and refers to preparation reservation. Neither describes whether a simulator exists. `no` never permits a replacement preparation after identity reservation. The host-create guard uses `blockingAllocationId` for its retained creator, separately from any requested `allocationId`. `yes`/`unknown` requires retrieval of original identities. Fixed operation codes: `INVALID_REQUEST`, `UNSUPPORTED_VERSION`, `OBSERVED_DISABLED`, `ACTION_ID_CONFLICT`, `ACTION_NOT_FOUND`, `ACTION_NOT_STARTED`, `ALLOCATION_NOT_FOUND`, `ALLOCATION_NOT_READY`, `DEVICE_BUSY`, `DEVICE_QUARANTINED`, `HOST_CREATION_UNRESOLVED`, `CONFIGURATION_ERROR`, `MIGRATION_REQUIRED`, `STORE_UNAVAILABLE`, `SHUTTING_DOWN`, `WAIT_CANCELLED`, `INTERNAL_ERROR`. Allocation adds its documented preparation reasons. Invalid requests/config can name field paths and safe IDs, never supplied values, raw exceptions, keys, screen text or vendor stderr. The creation-unresolved reason distinguishes the host-wide retained creation guard from ordinary busy ownership and points to its allocation evidence; no automatic clearing/retry.

Ship in a 1.x minor with new observed format version 1 independent of script/report versions; additive optional output fields/reasons may evolve, readers ignore unknown output fields. Renaming/removing/reinterpreting these names/guarantees requires a new observed version; existing frozen surfaces still follow [ADR-0005](../../../docs/adr/0005-the-1-0-stability-contract.md). Preserve the spike's old request spelling as an explicitly experimental adapter: validate its original schema, preserve historical artifacts through admission migration with a once-assigned read-only imported allocationId (never preparation permission), and reject raw-device execution unless it resolves to a dedicated prepared allocation bound to that identity. No silent conversion/adoption of arbitrary deviceId; return a safe migration-required message. New public adapters never accept the spike format.

Implementation gates: CLI/MCP golden schema/exit fixtures and key-free subprocess startup; cross-process identical/conflicting starts and ownership transfer; poll-byte/state invariance; lost reply/restart/cancel/finalization/storage faults through the real shared resolver; allocation guards and compatibility golden tests; fresh-simulator live visible evidence and independent safety review. These are validation work, not unresolved naming. Current transport cannot prove native release or fence old/external operators; migration quiescence and exclusive dedicated-device operation remain prerequisites. No new owner scope or guarantee decision is required.
