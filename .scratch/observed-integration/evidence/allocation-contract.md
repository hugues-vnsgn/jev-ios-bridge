# Allocation contract

Resolved 2026-10-08 for [Define allocation and uncertain-device lifecycle](../issues/05-allocation-contract.md). Planning only; no device operations, product edits or secret access. The [inventory decision](inventory-decision.md), [provisioning research](provisioning.md), [admission decision](admission-decision.md) and [retained allocation record](../../observed-ui/live/allocation.md) are inspectable evidence. Defaults and interfaces below are design decisions, not measured performance or implemented guarantees.

## Terms and interface

**Device allocation** is one dedicated simulator assignment for one declared action ID. **Allocation reservation** durably holds capacity before device identity exists. **Prepared allocation** has acknowledged preparation and recorded initial visible evidence, with its admission parked for one action. **Retained allocation** can never return to inventory in this slice. **Unknown creation** means creation may have happened without a durably identified device. These extend the domain vocabulary; they do not redefine Device lease or claim native release.

One allocator module owns reservations, source selection, preparation, retention and the admission handoff. MCP/CLI adapters use the same interface through `ObservedActionService`; command sequencing stays internal. The two real source adapters are narrow `simctl create` and explicitly supplied inventory. No caller receives a usable driver or ownership token.

```ts
type PrepareAllocationRequest = {
  version: 1;
  actionId: string; // same validation/global namespace as observed actions
  source:
    | { kind: 'create'; deviceTypeId: string; runtimeId: string }
    | { kind: 'supplied'; inventoryId: string };
  app: {
    artifactPath: string; // absolute existing simulator .app
    bundleId: string;
    build: { id: string; origin: string }; // recorded provenance, not certification
  };
  timeoutMs?: number; // default 360000; integer 1000..900000
};
type AllocationSnapshot = {
  version: 1; allocationId: string; actionId: string;
  state: 'preparing' | 'ready' | 'executing' | 'retained' | 'quarantined';
  phase: 'reserved' | 'creating' | 'admitting' | 'booting' | 'installing'
       | 'launching' | 'readiness' | 'parked' | 'action' | 'terminal';
  device: { platform: 'ios-simulator'; udid: string } | null;
  reason: AllocationReason | null;
  outcome: null | 'prepared' | 'action_completed' | 'refused' | 'uncertain' | 'retired_unused';
  authority: 'committed' | 'unconfirmed';
  readinessEvidence: string[];
  evidenceRefs: string[];
  reservation: { bytes: number; capacityHeld: boolean };
  hostCreationBlocked: boolean;
  cancellationRequested: boolean;
};
interface Allocator {
  prepare(request: PrepareAllocationRequest): Promise<AllocationSnapshot | AllocationRefusal>;
  get(allocationId: string): Promise<AllocationSnapshot | AllocationRefusal>;
  retire(allocationId: string): Promise<AllocationSnapshot | AllocationRefusal>;
  cancel(allocationId: string): Promise<AllocationSnapshot | AllocationRefusal>;
  // Private to ObservedActionService; requires validated immutable action input.
  consume(allocationId: string, actionId: string, actionDigest: string): Promise<AdmittedDriverSession | AllocationRefusal>;
}
```

Public names are `prepare_observed_allocation`, `get_observed_allocation`, `retire_observed_allocation`, `cancel_observed_allocation`; CLI names are `observed-allocate`, `observed-allocation`, `observed-retire`, `observed-allocation-cancel`. Get accepts `{allocationId,waitMs?}` (0–45000, default 0); retire/cancel accept `{allocationId}`. Request objects reject unknown fields and exceed neither 64 KiB nor 4096 characters per path; other strings are nonblank, at most 500 characters. The [public contract](public-contract.md) owns transport envelopes, action schema and exit behavior. Refusals contain a stable reason, message, existing allocation ID/evidence when known, and no fabricated allocation snapshot. Missing or unreadable records cannot produce `ready`.

Only `authority:committed` exposes an outcome: ready is `prepared`, executing/preparing are null, retained is `action_completed`, `refused` or `retired_unused`, quarantined is `uncertain`. Unconfirmed authority has null outcome. Allocation CLI exits 0 for prepared/action_completed/retired_unused, 3 for committed refusal, otherwise 2; an idempotent retirement never promotes uncertainty. Migration assigns historical records read-only allocation IDs once, with no preparation permission.

Evidence-reference clarification during rollout (2026-10-08): the shared renderer may include the allocation's already persisted absolute `evidenceDirectory` in `evidenceRefs`, deduplicated with recorded references. It is a directory pointer, not a file manifest or an assertion that a diagnostic file exists, is complete, or belongs to the committed terminal payload. Private diagnostics may arrive after quarantine without changing authority, guard or capacity. Missing required diagnostic proof remains explicit in acceptance evidence; no outcome is reconstructed from directory contents. [Independent contract interpretation](../acceptance/host/allocation-evidence-interpretation.md).

Cancel preparing allocations through admission's durable cancellation/dispatch ordering, wait at most 5000 ms and return the current snapshot. No owner takeover or device cleanup. Ready cancellation retains unused stock; executing returns `ALLOCATION_BUSY` (use action cancellation); terminal cancellation retrieves. At the ready commit the allocation leaves the process-owned active job set. Normal process close/signals cancel only still-active owned preparation/action jobs; they do not retire parked ready allocations. Explicit allocation cancellation or retirement may retire ready stock. Persist `cancellationRequested` and expose it as a boolean snapshot field.

## Prerequisites, configuration and budgets

Use one private per-user configuration file, `~/Library/Application Support/jev-ios-bridge/allocation.json`, independent of cwd/worktree: `{version:1, ...optionalSettingsBelow, inventory:[]}`. No request root override. Missing file uses these defaults; malformed/unsafe configuration refuses preparation. Capture its version/digest and effective limits in each reservation. Changing limits cannot clear previous reservations or exclusions.

| Setting | Default |
| --- | --- |
| `maxRetainedAllocations` / `maxConcurrentPreparations` | 8 / 1 |
| `reservationBytesPerAllocation` / `maxReservedBytes` | 8 GiB / 64 GiB |
| `minFreeBytes` | 20 GiB remaining after outstanding reservations and proposed reservation |
| `maxArtifactBytes` | 2 GiB |
| `createTimeoutMs`, `bootTimeoutMs`, `installTimeoutMs` | 60000, 120000, 120000 |
| `launchTimeoutMs`, `readinessTimeoutMs` | 30000, 30000 |
| `readyTtlMs` | 300000 |

Positive finite integers are required; concurrency cannot exceed retained capacity, aggregate bytes must cover one reservation, and stage/TTL limits cannot exceed 900000 ms. Requests may shorten the effective overall deadline; their ceiling remains 900000 ms. Device calls use the lesser remaining overall/stage deadline. Readiness polls at most once per second. A separate 5000 ms local finalization budget cannot authorize device calls. Ready TTL begins at the parked commit; admission checks expiry even if no worker is running. Reads do not expire records.

Count every new allocation with held capacity, including successful, failed-after-dispatch, supplied and unknown-device allocations. No daily reset or automatic reclamation. Historical protected devices are permanent exclusions, outside this new-allocation count. Free-space checks use host filesystem metadata on the default CoreSimulator storage volume and artifact staging volume, before reservation and again before create/install. Nonstandard device storage requires later explicit support. These are conservative reservation estimates, not disk quotas or protection from external consumption; unreadable/insufficient storage refuses work. Eight retained devices support a bounded evidence batch; further distinct actions require an explicit config increase and free space, not deletion.

Creation requires installed Xcode and explicitly named installed, compatible runtime/device type. Do not select newest, download runtimes, or invoke direct `simctl list`. Creation errors cannot prove no device was created. Supplied entries in the same config contain `inventoryId`, UUID, runtime/type identifiers, creation provenance and exclusive fresh-unused attestation. Vendor listing verifies availability; it cannot prove freshness. Arbitrary listed devices are never adopted. Source is fixed before reservation; exhaustion never switches sources.

Installed Xcode path trust (owner decision, 2026-10-09): trust local administrators for the canonical `/Applications` ancestor of the fixed `/Applications/Xcode.app` tree only when that ancestor is a nonsymlink directory owned by root (uid0), group admin (gid80), with exactly mode0775 and no extra permission bits. Preserve strict owner/write/symlink checks for the Xcode bundle, every descendant and every leaf, plus stable metadata identity/bytes, executable and command/environment checks. This permits administrator management of that installed namespace; it does not certify atomic binding against concurrent administrator or trusted-account path replacement. No arbitrary writable-ancestor exception, public path override or host chmod is granted. Root prepares and independently reviews the narrow repair before integration. [Owner decision and reproduction](../acceptance/host/runtime-visibility-2026-10-09/owner-trust-decision.json).

Installed Cryptex runtime trust (separate owner decision, 2026-10-09): the owner approves the exact frozen [bounded v3 policy](../acceptance/host/runtime-visibility-2026-10-09/cryptex-policy-proposal.md), including root/daemon-group namespace-manager trust for root0/gid1/exact0775 nonsymlink `/private/var/run` solely to reach `com.apple.security.cryptexd/mnt`. All finite discovery, exact-runtime uniqueness, fresh exact unwritable mount, same-device descendant, stable identity/bytes, exact mode, parser and guarded child limits in that policy remain required. No broader writable-ancestor exception is granted. ACLs were not inspected and this mode-based trust does not certify exhaustive writers or atomic ancestor binding. [Exact answer](../acceptance/host/runtime-visibility-2026-10-09/owner-cryptex-trust-decision.json). Implementation, independent reviews and repaired installed proofs precede production compatibility/live entry.

Require an existing unmodified simulator `.app`, known bundle ID and build provenance. No recursive build-output search, automatic build or physical-iPhone binary fallback. Offline inspection checks bundle identity, simulator platform, architecture and minimum OS against declared runtime/host; missing or incompatible metadata refuses. After reservation, while still `reserved`, stage a private immutable copy, reject escaping symlinks, compute/persist its canonical content digest before creation and verify it before install. Stage bytes count against storage. Repeated preparation reads the prior digest first and never copies or probes devices merely to retrieve it; changed submitted input conflicts, and changed artifact content before initial staging completion fails preparation. Installation remains the final compatibility check; provenance is not a trust certificate.

## Durable records and transitions

Extend the admission SQLite store; do not add a second authority. Atomic reservation checks global action uniqueness, source exclusions, capacity and the unknown-create guard, then inserts allocation and action reservation. Store: allocation ID, action ID, preparation digest, nullable write-once action digest/UUID, source/provenance, intended unique name, staged artifact digest/metadata, effective budgets, state/phase, owner token/generation, operation receipts, evidence, timestamps and held capacity. Inventory IDs/UUIDs are unique assignments. Source selection and inventory reservation occur in this transaction. Preparation request hashing uses the public contract's canonical JSON rules after filling defaults; separately bind artifact content digest at staging completion.

Before creation, persist `creating` and a host-wide unknown-create guard in the same transaction. Every updated **new iOS admission**, including legacy, supplied-device and ready-consumption paths, checks this guard; existing executing owners may finish. A valid single UUID success receipt atomically binds the allocation, installs its durable exclusion and clears the guard. Collision with any existing allocation/protected identity or receipt persistence failure leaves the guard held. Device admission then checks all claims before boot. Name matching is never ownership proof.

| State/event | Required next state and permitted work |
| --- | --- |
| Repeated action ID, identical prepare input | Retrieval only, no allocation, staging or device calls |
| Repeated ID, changed preparation/source/allocation | `ACTION_ID_CONFLICT`; no effects |
| Invalid input/prerequisite/budget before reservation | Refusal; no identity consumed or device calls |
| Reserved; certified no process/device dispatch | Failure may release capacity; retain terminal action reservation and diagnostics |
| Creation spawn/receipt lost, nonzero exit, malformed UUID, crash | Quarantined, possibly null UUID; retain capacity and host guard; never retry |
| Known UUID, device admission refused | Retained/excluded, capacity held; no boot/install |
| Admitted | Boot once, install once, launch once via pinned MobileBuildMCP; journal before each dispatch |
| Acknowledged boot/install/launch | Advance only after underlying operation settles; no receipt substitutes for readiness |
| Settled acknowledged stage failure or no-tap action refusal | Retained/refused, capacity held; no automatic retry |
| Readiness | Bounded vendor listing for boot state and app accessibility/screenshot capture; persist initial observation |
| Preparation complete | Close issuance, settle all operations/local cleanup, park admission atomically; `ready` |
| Ready, valid first start before TTL | Bind action digest and transfer admission atomically; `executing` |
| Successful action / already-satisfied | Atomic action terminal + retained allocation; capacity held |
| Preparation/action uncertainty, cancellation with work outstanding, readiness timeout or evidence failure | Quarantined; retain capacity/claim; no further device dispatch |
| Ready expiry or explicit ready retirement | Retained unused; consume action identity permanently; no device cleanup |
| Retire active / quarantined / terminal | Active: refuse `ALLOCATION_BUSY`; otherwise idempotent retrieval, no claim clearing |

After boot acknowledgement, bounded vendor listing must show Booted before install, within the boot deadline. Preparation does not establish a before/after predicate. The action captures fresh evidence before checking its guards; ownership transfer never relaunches the app. For separate CLI processes, the parked admission explicitly has no live driver. `consume` compares generation, unexpired readiness, action ID and allocation binding, attaches one new driver capability and increments generation/new token transactionally. Concurrent starts yield one owner; duplicates retrieve. The first immutable action digest can only be bound once. Late preparation continuations cannot operate after parking. Every updated admission also checks allocation eligibility, so “available” host admission never makes a retained device usable by legacy runs.

Restart/status cannot resume creation, preparation or input. Explicit recovery quarantines abandoned active phases under expected token/generation; uncertain liveness stays busy. Parked readiness survives process exit until TTL because all preparation operations settled. Unknown creation blocks new iOS work with `HOST_CREATION_UNRESOLVED`, allocation ID and evidence. Ownership reconciliation and guard clearing are outside the initial interface, with no automatic expiry. Store/commit ambiguity returns unconfirmed authority; only a fresh authoritative read can establish a committed snapshot. Missing/corrupt state fails closed under admission migration rules.

## Reasons, retention and acceptance

`AllocationReason` includes `INVALID_REQUEST`, `ACTION_ID_CONFLICT`, `ALLOCATION_NOT_FOUND`, `ALLOCATION_BUSY`, `CONFIG_INVALID`, `HOST_PREREQUISITE_MISSING`, `ARTIFACT_INVALID`, `ARTIFACT_INCOMPATIBLE`, `INVENTORY_EXHAUSTED`, `INVENTORY_INELIGIBLE`, `BUDGET_EXHAUSTED`, `STORAGE_UNAVAILABLE`, `HOST_CREATION_UNRESOLVED`, `CREATE_UNCONFIRMED`, `ADMISSION_REFUSED`, `BOOT_FAILED`, `INSTALL_FAILED`, `LAUNCH_FAILED`, `READINESS_FAILED`, `PREPARATION_UNCONFIRMED`, `CANCELLED`, `READY_EXPIRED`, `RETAINED_UNUSED`, `STATE_UNAVAILABLE`. Known acknowledged stage errors use stage reasons; lost/ambiguous preparation replies use `PREPARATION_UNCONFIRMED` plus phase. Vendor errors are diagnostic detail.

Never automatically stop, shut down, erase, reset, delete or reuse allocated simulators. Preserve protected UUIDs and all claims: `73997430-DB8A-48C8-8146-12320CE6AEFE`, `2FE383F2-2D0F-4286-8797-D3ACEFCD6220`, `6A8C5F93-F59A-456B-B157-10642209B734`, `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. Explicit retirement is bookkeeping only. New devices support distinct authorized actions; renaming the same business action is outside detectable identity guarantees.

Required interface tests cover concurrent reservation/budget exhaustion, both source adapters, all protected UUIDs, unknown-create exclusion of legacy admission, crash at every receipt/transaction milestone, no repeated mutation, independent-process ready transfer, TTL/start race, immutable identities across devices, missing runtime/incompatible artifact, storage failures and retained-success exclusion. Live acceptance must exercise this public interface on fresh devices with unchanged apps. Older binaries/external tools still require operational exclusivity. No native proof is promised. Root consolidates the inventory decision's ADR-0002 creation amendment and ADR-0007 cross-reference; no unresolved design decision remains in this ticket.
