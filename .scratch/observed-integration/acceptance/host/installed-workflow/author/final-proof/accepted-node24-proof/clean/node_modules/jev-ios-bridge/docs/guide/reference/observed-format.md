# Observed format version 1

This installed reference defines the experimental observed CLI/MCP workflow. The [workflow guide](../14-observed-actions.md) gives the migration and submission sequence. Observed format version 1 is independent of script and report versions. Existing scripted/driven verdicts and Android contracts retain their meanings. Readers ignore unknown output fields; inputs are strict.

## Requests

All requests are JSON objects of at most 64 KiB. Reject unknown fields, unsupported/missing versions, raw device UUIDs, coordinates, element references, launch arguments, extra actions, arbitrary evidence paths and admission root/token overrides. `actionId` matches `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`. `allocationId` is a UUID normalized uppercase. Get requests accept `waitMs`, an integer from 0 to 45000, default 0; cancellation/retirement accept only the corresponding ID.

Preparation requires these fields:

```ts
{
  version: 1,
  actionId: string,
  source: { kind: 'create', deviceTypeId: string, runtimeId: string }
        | { kind: 'supplied', inventoryId: string },
  app: { artifactPath: string, bundleId: string,
         build: { id: string, origin: string } },
  timeoutMs?: number
}
```

`artifactPath` is an absolute existing simulator `.app` path, at most 4096 characters. Other preparation strings are nonblank, at most 500 characters. Creation IDs must explicitly identify an installed iOS simulator device type/runtime. `timeoutMs` defaults to 360000 and must be an integer 1000–900000. Preparation binds the submitted input separately from the staged artifact content digest. Provenance records the build's origin; it is not certification.

Action requests require every field below:

```ts
{
  version: 1, actionId: string, allocationId: string,
  app: { bundleId: string },
  action: { kind: 'tap', selector: Selector },
  before: Guard, after: Guard, timeoutMs: number
}
```

`app.bundleId` matches the prepared app and the iOS bundle pattern. `timeoutMs` is an integer 100–60000, covering admitted action observation/execution. Local finalization has a separate 5000 ms budget. `Selector` uses the [script selector fields and roles](script-format.md#selectors): optional `identifier`, `role`, `label`, `value`, with at least identifier/role/label. Identifier/label are nonblank 1–500 characters; value is a 1–500 character filter. Match every supplied field exactly. `Guard` is `{present: Selector[], absent?: Selector[]}`: 1–12 present selectors, 0–12 absent selectors. Present requires exactly one visible positive-frame match; absent requires none. Ambiguity refuses execution.

## Identity and authority

Declare the action ID before preparation. The per-user store globally reserves it with one distinct generated allocation ID; no replacement allocation is allowed for that action. Preparation and action digests are immutable separate bindings. Canonical JSON sorts object keys recursively, preserves array/text order, normalizes the UUID and fills absent guard arrays with `[]` (and preparation defaults). Device identity is immutable resolved metadata.

Identical repeated preparation retrieves without staging or device calls. Identical bound action start retrieves before checking current allocation availability. Changed input returns `ACTION_ID_CONFLICT` with zero backend calls. Concurrent identical starts have one executor. An unready allocation returns `ALLOCATION_NOT_READY` without action binding/execution; `ACTION_NOT_STARTED` describes a reserved identity without action binding. Neither permits a replacement preparation. After reply loss, read or resubmit only the exact original request/IDs. Deliberately renaming the same business operation is outside detectable identity guarantees.

The admission store is authoritative. Polling reads one consistent durable snapshot and does not expire, recover or mutate records. Explicit owner-aware recovery may quarantine proven abandoned claims; uncertain liveness remains busy. It never resumes preparation/input. Missing/corrupt storage refuses effects; exports cannot reconstruct authority.

### Action snapshot

| Field | Meaning |
| --- | --- |
| `version`, `kind` | `1`, `observed-action` |
| `actionId`, `allocationId`, `device`, `bridgeVersion` | Immutable identities; device is `{platform:'ios-simulator', udid}` |
| `state` | `running`, `finalizing`, `terminal`, `unresolved` |
| `authority` | `none`, `committed`, `unconfirmed` |
| `disposition` | `started` only in first start reply; otherwise `retrieved` |
| `cancellationRequested` | Durable cancellation flag |
| `actionAttempted`, `actionAcknowledged` | Boolean or null; dispatch and transport acknowledgement, never native consumption |
| `observations` | Number of durably recorded captures |
| `outcome`, `reason` | Outcome only with terminal committed authority; otherwise null outcome |
| `admission`, `allocationState` | Current admission (`active`, `available`, `quarantined`, `unknown`) and allocation disposition, separate from historical outcome |
| `evidence` | Absolute directory/request/observation pointers, nullable terminal pointer and `exportStatus`: `pending`, `complete`, `failed` |

Committed terminal outcomes are `outcome_observed`, `already_satisfied`, `refused`, `inconclusive`. `outcome_observed` has attempted/acknowledged true; `already_satisfied` has both false. `refused` means no tap submitted with settled host operations; it does not undo preparation. Unknown work yields inconclusive quarantine. Unknown persisted flags stay null after interruption. `unresolved/unconfirmed` has null outcome with `OWNER_UNAVAILABLE` or `FINALIZATION_UNCONFIRMED` and unavailable admission. Late acknowledgements cannot promote an outcome or clear uncertainty.

Terminal refusal/inconclusive reasons are `PRECONDITION_NOT_MET`, `TARGET_NOT_UNIQUE`, `AMBIGUOUS_CONDITION`, `INVALID_OBSERVATION`, `TARGET_UNAVAILABLE`, `UNSUPPORTED_ACTION`, `DEVICE_ERROR`, `DEADLINE_EXCEEDED`, `CANCELLED`, `PREPARATION_UNCONFIRMED`, `OBSERVATION_UNCONFIRMED`, `UI_ACTION_UNCONFIRMED`, `FINISH_UNCONFIRMED`, `RESULT_EVIDENCE_UNCONFIRMED`, `OWNER_LOST`, `INTERNAL_ERROR`. Observed successes have null reason.

### Allocation snapshot

Allocation snapshots contain `version`, `allocationId`, `actionId`, `state`, `phase`, nullable `device`, `reason`, `outcome`, `authority`, `readinessEvidence`, `evidenceRefs`, `reservation:{bytes,capacityHeld}`, `hostCreationBlocked`, and `cancellationRequested`.

| State | Committed outcome / disposition |
| --- | --- |
| `preparing` | null; reservation/preparation in progress |
| `ready` | `prepared`; settled preparation parked for one action |
| `executing` | null; action owns the allocation |
| `retained` | `action_completed`, `refused`, or `retired_unused`; no reuse |
| `quarantined` | `uncertain`; claims/capacity retained |

Unconfirmed authority always has null outcome. Phases are `reserved`, `creating`, `admitting`, `booting`, `installing`, `launching`, `readiness`, `parked`, `action`, `terminal`. `evidenceRefs` may include an absolute directory pointer; it is not a file manifest or proof that every diagnostic exists. Imported historical allocations have read-only IDs with no preparation permission and may include `readOnly`/`historicalOutcome`.

Preparation reserves action/capacity before creation, records creation intent before spawn, binds a valid unique UUID receipt before boot and dispatches boot/install/launch once through the pinned provider. Readiness requires acknowledged settlement plus visible capture. Ready commit closes preparation issuance and parks durable ownership without a live driver. First valid start before TTL binds the action digest and transfers fenced ownership; it captures fresh evidence without relaunching. Normal process exit leaves parked readiness intact. Ready expiry or retirement retains unused stock and consumes the action identity permanently.

Unknown creation retains a possibly unidentified simulator, held capacity and a host-wide guard blocking new iOS admission. Name matching, process exit and nonzero creation exit do not prove that no device was created. There is no automatic retry, source fallback, guard clearing, reclaim, shutdown, erase, delete or reuse. Success retains capacity too. All historical protected devices remain excluded.

## Configuration and supplied inventory

Configuration is per OS account at `Library/Application Support/jev-ios-bridge/allocation.json`, independent of cwd. The bridge directory must be private mode 700 and the regular configuration file mode 600. Missing configuration uses defaults; malformed/unsafe configuration refuses preparation. Changing budgets cannot clear earlier reservations/exclusions.

| Setting | Default |
| --- | --- |
| `maxRetainedAllocations`, `maxConcurrentPreparations` | 8, 1 |
| `reservationBytesPerAllocation`, `maxReservedBytes` | 8 GiB, 64 GiB |
| `minFreeBytes`, `maxArtifactBytes` | 20 GiB after reservations, 2 GiB |
| `createTimeoutMs`, `bootTimeoutMs`, `installTimeoutMs` | 60000, 120000, 120000 |
| `launchTimeoutMs`, `readinessTimeoutMs`, `readyTtlMs` | 30000, 30000, 300000 |

Settings are positive finite integers. Concurrency cannot exceed retained capacity; aggregate bytes must cover one reservation. Stage/TTL limits cannot exceed 900000 ms. Held reservations count success, uncertainty and supplied allocations. Historical protected exclusions are outside the new-allocation count. Storage checks cover the default CoreSimulator and staging volumes; estimates are not disk quotas or protection against external consumption.

A supplied request uses `source:{kind:'supplied',inventoryId}`. Configure each inventory entry with `inventoryId`, `udid`, `deviceTypeId`, `runtimeId`, `creation:{createdAt,origin,evidenceRef}`, and `attestation:{freshUnused:true,exclusive:true}`. `createdAt` is a date string; `evidenceRef` is an absolute provenance path. Listing checks availability, not freshness. Operators must establish the attestation; arbitrary existing devices are never adopted.

## Cancellation and evidence

Action/allocation cancellation durably orders against dispatch authorization: later authorization is denied after cancellation commits, but already authorized work may still act. It waits at most 5000 ms for local finalization, without owner takeover or a cleanup promise. Transport cancellation only stops a read wait. Executing allocation cancellation/retirement returns `ALLOCATION_BUSY` and directs action cancellation; preparing retirement directs allocation cancellation. Ready allocation cancellation retires unused stock. Terminal/quarantined cancellation/retirement retrieves without clearing claims.

Evidence lives under `<runsDir>/observed/<actionId>/`: private `request.json`, `observation-N.json` and optional JPEG, explicitly non-authoritative `provisional-result.json`, and `terminal.json` exported from committed authority. Absolute pointers survive cwd/restart changes. Export failure after commit does not rewrite the outcome. Screens/requests may contain app text and stay local; reads return pointers rather than arbitrary file content. `JEV_RUNS_DIR` changes evidence placement only; `JEV_PROJECT_DIR` resolves project/request configuration, never admission identity/root.

## Exits and errors

`--json` prints one complete snapshot/error on stdout; stderr carries notices only. MCP returns a visible summary plus complete JSON in a second text block, without depending on hidden structured output. Operation errors set `isError`; committed refused/inconclusive snapshots do not.

| CLI result | Exit |
| --- | --- |
| Action committed `outcome_observed` / `already_satisfied` | 0 |
| Action committed `inconclusive`, active/finalizing/unresolved | 2 |
| Action committed `refused` or operation error | 3 |
| Allocation committed `prepared` / `action_completed` / `retired_unused` | 0 |
| Allocation committed `refused` or operation error | 3 |
| Other allocation state/uncertainty | 2 |

Exit 1 remains reserved for legacy failed verdicts. SIGINT/SIGTERM revoke owned active work, attempt bounded finalization and exit 130/143; read signals only stop waiting.

Operation errors are `{version:1,kind:'observed-operation-error',code,message,acceptance,acceptanceKind}` with optional safe `actionId`, `allocationId`, `blockingAllocationId`, `evidenceDirectory` (allocation busy errors may also carry `state`). `acceptance` is `no`, `yes`, or `unknown`; `acceptanceKind` distinguishes action binding from preparation reservation, never whether a simulator exists. `yes`/`unknown` requires original-identity retrieval; `no` does not permit replacing an already reserved preparation. Messages exclude submitted values, raw exceptions, keys, screen text and vendor stderr.

Action operation codes are `INVALID_REQUEST`, `UNSUPPORTED_VERSION`, `OBSERVED_DISABLED`, `ACTION_ID_CONFLICT`, `ACTION_NOT_FOUND`, `ACTION_NOT_STARTED`, `ALLOCATION_NOT_FOUND`, `ALLOCATION_NOT_READY`, `DEVICE_BUSY`, `DEVICE_QUARANTINED`, `HOST_CREATION_UNRESOLVED`, `CONFIGURATION_ERROR`, `MIGRATION_REQUIRED`, `STORE_UNAVAILABLE`, `SHUTTING_DOWN`, `WAIT_CANCELLED`, `INTERNAL_ERROR`. Allocation adds `ALLOCATION_BUSY`, `CONFIG_INVALID`, `HOST_PREREQUISITE_MISSING`, `ARTIFACT_INVALID`, `ARTIFACT_INCOMPATIBLE`, `INVENTORY_EXHAUSTED`, `INVENTORY_INELIGIBLE`, `BUDGET_EXHAUSTED`, `STORAGE_UNAVAILABLE`, `CREATE_UNCONFIRMED`, `ADMISSION_REFUSED`, `BOOT_FAILED`, `INSTALL_FAILED`, `LAUNCH_FAILED`, `READINESS_FAILED`, `PREPARATION_UNCONFIRMED`, `CANCELLED`, `READY_EXPIRED`, `RETAINED_UNUSED`, `STATE_UNAVAILABLE`.

## Accepted contract sources and limits

The accepted public, allocation, admission and inventory decisions define this reference's version 1 contract. They live in the repository's rollout planning records and are not part of the published v1.3.1 tag. Use this shipped reference for installed observed usage; the [workflow guide](../14-observed-actions.md) links here rather than to unpublished planning files.

Updated-process admission is not native ownership/release certification and cannot fence older binaries, external tools or other OS users. Operational quiescence and dedicated-device exclusivity remain prerequisites. Visible predicates are not causal attribution or Jev judgment. Whole host/live acceptance, supplied-source live operation, physical devices, other runtimes/sizes, real transport severance and native consumption/settlement/release are unverified here. L04 is synthetic reply loss after backend success.
