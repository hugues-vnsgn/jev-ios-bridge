# Observed actions (experimental)

An observed action submits one authored iOS simulator tap and checks visible before/after predicates. It returns an **observed outcome**, not a Jev verdict. Read the installed [observed format](reference/observed-format.md) for the normative version 1 requests, snapshots, identity and retention rules.

## Prerequisites

Use Node 24.0.0 or later, an installed compatible Xcode at `/Applications/Xcode.app`, an explicitly named installed simulator runtime/device type, and an unchanged simulator-compatible `.app` at an absolute path. Supply its bundle ID and build provenance. The bridge checks metadata, stages a private immutable copy and verifies its digest before install; it does not build an app, search build folders, download a runtime or accept a physical-iPhone binary as a fallback.

Use test data in an app you control. Arrange exclusive operation of dedicated devices: older bridge binaries and external tools do not participate in updated admission. Observed CLI/MCP startup and operations need no `TYPESAFE_API_KEY`, SDK construction or Jev call. Scripted/driven scenarios still need their normal Jev credentials when started.

## Migrate offline before enabling effects

Stop all old bridge and experimental writers first. Inventory every historical journal and lease location, including other home and TMPDIR locations. Declare every nondefault root below, or exclude every affected simulator UUID. Set `writersStopped` and `historicalRootsDeclaredOrExcluded` to true only after doing that work. These booleans are operator assertions; they prove neither process liveness nor native release.

Create a private declaration file (`umask 077`) with exactly these fields, replacing the empty arrays with your actual historical roots/exclusions:

```json
{
  "version": 1,
  "writersStopped": true,
  "historicalRootsDeclaredOrExcluded": true,
  "additionalJournalRoots": [],
  "additionalLeaseRoots": [],
  "excludedDevices": []
}
```

From an npm installation, run:

```sh
node node_modules/jev-ios-bridge/dist/device/admission-maintenance.js --help
node node_modules/jev-ios-bridge/dist/device/admission-maintenance.js migrate declaration.json
```

From the installed package directory, the entry is `node dist/device/admission-maintenance.js migrate <declaration.json>`. For a plugin installation, use its `dist/device/admission-maintenance.js` under the plugin root.

Admission always uses the OS account's private `Library/Application Support/jev-ios-bridge/admission` directory. There is no destination override; changing HOME, cwd, worktree, `JEV_PROJECT_DIR` or `JEV_RUNS_DIR` does not create another admission domain. Default historical journal/lease roots are included automatically, and declared sources remain untouched. Preserve a failed/partial migration and its guard for investigation. Back up the whole store; deleting its root or restoring an old backup invalidates its guarantees and cannot be detected by its local installation marker.

Set `JEV_EXPERIMENTAL_OBSERVED=1` in the CLI or MCP server environment after migration. Only the exact string `1` enables preparation/start; `true` does not. When disabled, reads, cancellation and retirement remain available for existing identities. Invalid configuration never falls back to another source.

## Prepare one allocation

Choose the `actionId` before any effects. Keep it for the whole business action. The server returns a distinct UUID `allocationId`; one allocation serves that one action.

Save an allocation request, replacing the illustrative artifact/type/runtime values with installed compatible ones:

```json
{
  "version": 1,
  "actionId": "open-settings-001",
  "source": {
    "kind": "create",
    "deviceTypeId": "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
    "runtimeId": "com.apple.CoreSimulator.SimRuntime.iOS-27-0"
  },
  "app": {
    "artifactPath": "/absolute/build/Example.app",
    "bundleId": "com.example.app",
    "build": {
      "id": "local-build-001",
      "origin": "local simulator build"
    }
  },
  "timeoutMs": 360000
}
```

```sh
JEV_EXPERIMENTAL_OBSERVED=1 jev-ios-bridge observed-allocate allocation.json --json
jev-ios-bridge observed-allocation <allocation-id> --json --wait-ms 45000
```

Proceed only with a committed `prepared` allocation. Preparation reserves capacity before creation, boots/installs/launches once and records readiness. A normal allocating CLI exit leaves readiness parked for a separate action process. Supplied inventory is an explicit alternative in the [format reference](reference/observed-format.md#configuration-and-supplied-inventory); it is never an automatic fallback after creation uncertainty.

## Submit once, then retrieve

Save the returned allocation ID in the action request, keeping the original action ID. Author exact selectors and screen anchors from real captures; the following identifiers are illustrative:

```json
{
  "version": 1,
  "actionId": "open-settings-001",
  "allocationId": "ABCDEF00-0000-4000-8000-000000000001",
  "app": {
    "bundleId": "com.example.app"
  },
  "action": {
    "kind": "tap",
    "selector": {
      "identifier": "settings-button"
    }
  },
  "before": {
    "present": [
      {
        "identifier": "home-title"
      }
    ]
  },
  "after": {
    "present": [
      {
        "identifier": "settings-title"
      }
    ]
  },
  "timeoutMs": 10000
}
```

```sh
JEV_EXPERIMENTAL_OBSERVED=1 jev-ios-bridge observed-action action.json --json
jev-ios-bridge observed-report open-settings-001 --json --wait-ms 45000
```

After a lost reply, retrieve using those original IDs or submit the exact original request again. Identical bound requests retrieve; changed input conflicts with zero backend calls. Never replace an uncertain action's allocation or rename that business action to try again. The bridge cannot recognize a deliberately renamed business operation.

Read `authority`, `outcome`, `admission` and `allocationState` together. Only committed terminal action authority establishes an outcome. Provisional files, a transport acknowledgement or a late callback cannot establish success. Evidence pointers locate private local requests/captures and terminal exports; observed execution has no Jev report conversion, watch page or log pane.

## Cancel or retire

```sh
jev-ios-bridge observed-cancel open-settings-001 --json
jev-ios-bridge observed-allocation-cancel <allocation-id> --json
jev-ios-bridge observed-retire <allocation-id> --json
```

Action cancellation durably prevents later dispatch authorization; already authorized input may still act. It waits at most five seconds for local finalization and returns current authority. Cancelling a request transport or stopping a read wait does not cancel the action. Cancel a preparing allocation explicitly; an executing allocation returns `ALLOCATION_BUSY` and directs action cancellation. Retirement changes retention metadata only, with no device operation.

## MCP equivalents

Every MCP reply has a visible summary and complete JSON in a second text block. Read both. Operation errors set `isError`; committed `refused`/`inconclusive` outcomes are successful tool calls with explicit outcomes.

| CLI | MCP tool and arguments |
| --- | --- |
| `observed-allocate allocation.json` | `prepare_observed_allocation` with the allocation request |
| `observed-allocation ID --wait-ms N` | `get_observed_allocation` with `{allocationId, waitMs?}` |
| `observed-allocation-cancel ID` | `cancel_observed_allocation` with `{allocationId}` |
| `observed-retire ID` | `retire_observed_allocation` with `{allocationId}` |
| `observed-action action.json` | `start_observed_action` with the action request |
| `observed-report ID --wait-ms N` | `get_observed_action` with `{actionId, waitMs?}` |
| `observed-cancel ID` | `cancel_observed_action` with `{actionId}` |

MCP start returns an admitted snapshot; poll the corresponding get tool. CLI action waits for terminal/unresolved. See [exits and errors](reference/observed-format.md#exits-and-errors) when scripting.

## Retention and limits

Every allocated device is retained by default, including successful allocations. Quarantine and unknown creation keep claims/capacity; retirement does not free them. Unknown creation may leave an unidentified simulator and a host-wide creation guard, blocking new iOS admission with `HOST_CREATION_UNRESOLVED`. Preserve its allocation ID and evidence for a separate ownership reconciliation. Do not clear claims, reset storage, match a device by name or retry creation to recover.

Default capacity is eight retained allocations, one concurrent preparation, 8 GiB reserved per allocation, 64 GiB total and 20 GiB free after reservations. Budgets are estimates, not disk quotas. For a further distinct authorized action, an explicit valid configuration increase and sufficient storage are required. See [configuration](reference/observed-format.md#configuration-and-supplied-inventory).

This slice supports one deterministic tap on an iOS simulator. Visible predicate evidence does not prove causality, native input consumption, settlement or release. Whole host/live acceptance remains unverified here. Supplied-source live operation, physical devices, other runtimes/sizes, real transport severance and native consumption remain untested. L04 is synthetic reply loss after backend success; it is not real transport failure certification. See [troubleshooting](08-troubleshooting.md#observed-actions-experimental).
