# Phase 2 specification: profiles and one admission authority

Status: behavior specified; package briefs pending; execution paused
Authority: [published spec](../spec.md), Decisions 9, 18 through 26;
Testing Decisions 6, 15 through 19
Context: [master handoff](../handoff.md), ADR-0008/0009/0011

## Entry and existing seams

Require reviewed Phase 1 GO. Read `src/device/admission.ts`,
`admission-sqlite.ts`, `admission-migration.ts`, `admission-maintenance.ts`,
`src/device/lease.ts`, CLI/MCP composition and observed allocation contracts.
The existing schema is iOS-simulator-only; `canonicalDevice` accepts UUIDs.
Keep allocation UUID validation separate when generalizing device identities.

The logical release-state contract is decided below (Release state contract);
persistence for it is decided in Store schema evolution.

## Profile selection behavior

Decided in [Named-profile selection contract](../../appium-phase2/issues/01-profile-selection-contract.md) (owner, 2026-10-19).

**File.** `.jev/profiles.json` in the project folder (`JEV_PROJECT_DIR`, else cwd):
`{ "version": 1, "defaultProfile"?: name, "profiles": { name: profile } }`. Read only
when present; when present it must be valid (`INVALID_PROFILE_FILE`). `.jev/config.json`
is unchanged and still read only for driven scripts.

**Inputs.** `--profile <name>` on `run` and `capture`; optional `profile` on MCP
`start_scenario`, beside `scenario` and `limits`. Scenario JSON is unchanged. No new
environment variable. Observed actions and observed preparation ignore profiles
(their allocation bindings and per-user `allocation.json` stay authoritative; a
preparation hook is reserved). Names match `^[a-z0-9][a-z0-9-]{0,62}$`; an unknown
name refuses with `PROFILE_NOT_FOUND`.

**Profile v1.** `platform` (`ios`|`android`), `deviceCategory` (`ios-simulator`|
`android-emulator`|`android-phone`), `device` (a device name, scenario validation
rules), optional `app` (bundle ID or package; a guard only), optional `budgets`
(startup, operation, cleanup; bounded). Reserved and refused when set:
`capabilities`, `prerequisites`, `signing`, and categories for physical iPhones and
later acceptance hardware. Unknown keys refuse. Credentials never appear here.

**Precedence.** Explicit profile, then `defaultProfile`, then the legacy order
unchanged: iOS scenario UUID, `JEV_DEVICE_UDID`, `.mobilebuildmcp/config.yaml`
`simulatorId`; Android scenario serial, then AVD, then `JEV_ANDROID_DEVICE`;
capture `--serial`, then `--avd`, then `JEV_ANDROID_DEVICE`. A selected profile
silently shadows environment defaults and the vendor file. Only the scenario's own
device/app/platform can conflict: after resolving both to a device identity,
disagreement refuses with `PROFILE_CONFLICT` before any effect; aliases agree.

**Budgets.** A profile's budgets are the default and the ceiling; request `limits`
may only tighten them (minimum wins); a wider request refuses with
`PROFILE_CONFLICT`. Without a profile, `limits` behave as today. Budget fields are
`startupMs`, `operationMs` and `cleanupMs` (integer milliseconds), each with an
explicit default and bound written into the profile schema; requests carry the
same names and are compared field by field. `maxSteps`, `wallTimeMs` and driven
`handbackTimeoutMs` stay independent existing limits, not profile budgets. Defaults keep today's behaviour (Decision 9): `startupMs` caps
`driver.prepare` and `operationMs` caps one step's device operation, and neither
has a default, so without one preparation and steps stay under `wallTimeMs` as
today; `cleanupMs` defaults to the existing `DEFAULT_CLEANUP_MS` (45000).
`wallTimeMs` stays the outer limit over all three. Bounds are 1000 to 600000 for
`startupMs` and `operationMs` and 1000 to 300000 for `cleanupMs`, provisional
until the owner approves them at P2.2's review (main agent, 2026-10-19).

**Binding.** The resolved profile (name plus content digest) is recorded on the run
and in the admission attempt intent. Hand-back, retrieval and recovery use the
recorded binding, never the current file.

**Vendor file.** Keep reading `simulatorId` from `.mobilebuildmcp/config.yaml`
read-only after Phase 3 removes MobileBuildMCP, with a one-line run-log note
suggesting a profile. Removal needs a major version.

## Identity and preflight

Decided in [Canonical device identity](../../appium-phase2/issues/03-canonical-device-identity.md)
(owner, 2026-10-19).

**Identity.** A device identity is the pair (category, value), unique as a pair;
`category:value` is a display form only. Categories are a closed list:
`ios-simulator`, `android-emulator`, `android-phone` (enabled) and `ios-phone`
(reserved; every entry point refuses it with `CATEGORY_NOT_ENABLED` before
effects, including a device name shaped like a physical iPhone UDID). A new
category needs a spec change.

| Category | Value | Recorded attributes (never part of the key) |
|---|---|---|
| `ios-simulator` | uppercase UDID | device-set path; only the default set is admitted, others refuse with a named reason |
| `android-emulator` | `realpath(avd path)` | AVD name, AVD id, device and inode, emulator version, serial, pid and start time |
| `android-phone` | `getprop ro.serialno` | adb transport serial (USB, `ip:port` or mDNS), revalidated before effects |

Existing iOS rows keep their bare uppercase UUID values with category
`ios-simulator`; no stored device value or checksummed allocation record is
rewritten. Allocation IDs get their own normalizer (`canonicalAllocationId`,
uppercase UUID) instead of `canonicalDevice`; every existing ID stays valid.
`-id` clones and `-read-only` second instances of one AVD share its key and
serialize. A device name that reaches more than one live transport (two running
instances of one AVD) refuses `DEVICE_AMBIGUOUS` unless an explicit serial
selects one; all instances keep the one admission key.

**Resolution.** Every admission resolves the device name (script, profile, env
or vendor file) live; nothing caches a name-to-identity mapping. A name matching
two live identities refuses `DEVICE_AMBIGUOUS`, none refuses `DEVICE_NOT_FOUND`.
The `avd || name` serial fallback is removed: missing provenance refuses. Sources
that disagree (console name versus guest property, one inode under two paths,
serialno versus USB serial) refuse `DEVICE_IDENTITY_CONFLICT` and record the
reason without quarantining the device. A required source that cannot be read
or is not admissible refuses `DEVICE_IDENTITY_UNAVAILABLE` with exactly one reason
from a closed set: `NONDEFAULT_DEVICE_SET`, `EMULATOR_VERSION_UNSUPPORTED`,
`REMOTE_CONSOLE`, `MALFORMED_PROVENANCE`, `PROVENANCE_INACCESSIBLE`,
`PROBE_TIMEOUT`; the "named reasons" below are these. A moved or renamed AVD is a new identity;
the old record keeps its state and a same-name match only adds a note, never an
adoption (name-only legacy records are never upgraded by name).

**Emulator provenance**, per the
[provenance research](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/emulator-provenance/.scratch/appium-phase2/research/emulator-provenance.md)
(Steps 0-5):

- Identity comes from the console: `adb -s S emu avd name`, `avd id`, `avd path`,
  accepting only the exact `<value>\r\nOK\r\n` reply. Empty stdout, `KO:`,
  `NO_AVD_INFO`, an empty value or a non-absolute path refuse.
  `ro.boot.qemu.avd_name` is a cross-check only; process argv and
  `pid_<pid>.ini` are optional corroboration.
- Never read or store discovery-file keys beyond `port.serial`, `avd.id`,
  `avd.dir` and `emulator.version`; never call `avd discoverypath`; never compute
  identity from AVD-root environment variables.
- Emulators older than 30 refuse with a named reason. An `emulator-N` serial
  whose console is not on this host's loopback (remote adb server) refuses.
- Probes use a separate read-only runner with a per-command deadline that may
  kill its child, distinct from the effect runner.
- A provenance read that fails because the console token or discovery directory
  lives in another home refuses with that reason; the bridge never reads another
  user's files and never logs, stores or passes the console token or `grpc.*`
  values.

Before effects, validate profile/scenario compatibility, platform prerequisites,
already-booted/installed-app requirements, app identity, frozen stack/artifacts,
identity/transport binding, authority activation and detectable foreign work.
Ordinary run/capture cannot gain implicit boot/install/reset/erase. Observed
preparation retains its bounded authorized boot/install/creation path.
Revalidate an ephemeral transport before an effect when its identity may have
changed; a reused serial/port is not continuation of an old owner.

**Pre-admission identity probes** (owner, 2026-10-19). The read-only reads that
resolve a device name to its identity (console `avd name`/`avd id`/`avd path`,
`getprop`, simulator listing) run before admission and are not owner commands:
the rule that every device command is recorded before it is sent applies from
admission onward. They run only through the read-only probe runner above, never
the effect runner, and change no device state. Their exact replies are recorded
in the attempt intent once admission authorizes; a refused admission records
nothing.

## Offline migration contract

Extend the SAME per-user SQLite authority. Production root stays anchored to the
OS account and cannot change with project, HOME, cwd or TMPDIR. Keep test stores
fake-only; no real device backend may attach to them.

Inventory the selected-base schema and declared historical sources. Preserve
logical action IDs/digests/intents/outcomes/tombstones; allocation/artifact
bindings, reservations/capacity, unknown-creation guard, exclusions/quarantines,
owner generations and prior migration receipts/source hashes. Preserve Android
legacy lease uncertainty even where old iOS import merely classified it as
outside iOS. An old PID's death never settles native work.

Specify a versioned offline migration receipt, transactional schema/state
change, installation identity and interrupted-operation behavior. Keep sources
unchanged. Repeating identical completed maintenance retrieves its receipt;
partial/corrupt/conflicting sources or guards fail closed. No automatic fallback
store or deletion of guards to reset authority is permitted; the checked
`upgrade --recover` below is the only tool path that removes a guard.

Test isolated stores first. Applying migration requires a recorded exclusive
writer window, historical roots declared/excluded, whole-store backup and owner
coordination. Do not stop another agent or declare that its writer is stopped.
Preserve protected historical devices and unresolved native studies. Coordinate
actual activation only after these prerequisites; it is not part of planning.

## Store schema evolution

Decided in [Store schema evolution](../../appium-phase2/issues/05-store-schema-evolution.md) (owner, 2026-10-19); [ADR-0012](../../../docs/adr/0012-forward-only-offline-admission-store-upgrades.md).

**Upgrades.** Only `admission-maintenance upgrade <declaration>` changes the
schema. Opening the store never upgrades it. Steps are forward-only and
numbered (2 to 3, 3 to 4, and so on); each step is one `BEGIN IMMEDIATE`
transaction covering schema, data reshaping, the version bump and its receipt.
The command takes the existing `migration.lock` guard with a fresh token
recording from, to and backup path, so every v1.4.0 and newer opener refuses
meanwhile. The declaration is version 1 `{ "version": 1, "kind": "upgrade",
"from": n, "to": n+1, "writersStopped": true }`; like the migration declaration,
it is an operator assertion, not proof of quiescence.

**Version match.** A binary opens only the schema version it was built for;
any other version refuses `STATE_UNAVAILABLE`, naming the store's version and
the upgrade command. There is no reader range. Once the real store is upgraded,
installed v1.4.0 binaries and plugins refuse it until updated, which the
activation runbook must schedule.

**Backup.** Under the guard and before any change, the command writes
`VACUUM INTO` a copy plus `installation.json` into a private (0700) `backups/`
folder in the admission root, reopens the copy, verifies its schema version and
row counts, and records path and sha256. No verified backup, no upgrade. Backups
are never deleted by the tool.

**Receipts.** A new append-only `upgrades` table holds one row per step: from,
to, binary version, time, declaration, backup path and sha256, and per-table row
counts and digests of preserved logical records before and after. The original
migration receipt in `metadata` is never edited. Repeating an identical upgrade
on a store already at its target returns the stored receipt with no change; a
different declaration for a completed step refuses.

**Interrupted upgrades.** A crash before COMMIT leaves the old version intact
and the guard behind; a crash after COMMIT leaves the new version and the guard.
`upgrade --recover <declaration>` removes the guard only when it is an upgrade
guard and the store is in one of two clean states: old version and identical to
the recorded backup, or new version with the receipt for that guard's token.
Otherwise it refuses. It records the recovery as its own immutable maintenance
event (in a maintenance journal that exists at both versions), linked to the
guard token and to the step receipt when one committed; the step receipt itself
is never edited. A migration guard
or unknown guard still needs operator investigation.

**Device key.** Tables key a device on (category, value). The `devices` key
becomes the pair (category in today's `devices.platform` column), and
`attempts`, `imported_actions`, `allocations` and the release-state tables
carry both columns. The 2 to 3 step rebuilds these tables inside its
transaction; existing iOS rows keep their exact uppercase UUIDs with category
`ios-simulator`, and checksummed allocation records are not rewritten. The
category CHECK lists `ios-simulator`, `android-emulator`, `android-phone` and
`ios-phone` from schema 3; entry points refuse `ios-phone` with
`CATEGORY_NOT_ENABLED`, so enabling it needs code, not an upgrade. A new
category or record type is a new upgrade step.

**Immutability in the store.** `BEFORE UPDATE` and `BEFORE DELETE` triggers abort
any change to terminal attempt outcomes, non-outstanding command dispositions,
quarantines, fence receipts, component inventory, `upgrades` and imported records.
The only writes allowed are the one-time ones: outcome from null, disposition
from `outstanding`, a quarantine's covering receipt from null.

**The 2 to 3 step.** It reshapes only what the store already holds:

- Adds quarantines, fence receipts, component inventory, each command's
  component, late-reply observations and `upgrades`. Availability becomes
  derived; `devices.state` no longer stores `available` or `quarantined`.
- Each v1.4.0 `quarantined` device becomes a `historical` quarantine with its
  recorded reason. Protected devices and declared `excludedDevices` become
  `exclusion` quarantines. Available devices get no quarantine.
- Any attempt still `active` refuses the step with `UPGRADE_BLOCKED`, listing
  them; the operator runs the existing abandoned-owner recovery first. Parked
  preparations carry over unchanged.
- It scans no outside files. Importing legacy Android leases and newly declared
  iOS history is a separate maintenance step with its own receipt (Legacy lease
  import).

**Fresh and test stores.** Offline migration creates schema 2 and applies every
step in the same transaction, so there is one definition of each version; test
fixture stores use the same chain. This fresh initialization is a separate mode:
it reuses each step's schema and data changes inside its one transaction and keeps
the original migration receipt. The per-step backup and `upgrades` receipt rules
apply only to upgrading an existing committed store.

**No downgrade.** Forward only. Restoring a backup after the upgraded store has
recorded work drops that work and its guarantees; the help text says so, and a
restored store is treated as the older version it is.

## Legacy lease import

Decided in [Legacy lease import](../../appium-phase2/issues/07-legacy-lease-import.md) (owner, 2026-10-19).

**Step.** `admission-maintenance import <declaration>` runs only on a store at the
schema version the binary was built for (schema 3 or later), normally right after
the 2 to 3 upgrade in the same writer window. It uses the upgrade rules: the
`migration.lock` guard, a writer-window declaration, a verified tool-taken backup,
append-only receipts and checked `--recover`. It scans the default `$TMPDIR`
lease root (`jev-ios-bridge-device-locks`) and every declared lease and journal
root; newly declared iOS journal history imports through the v1 scanner's rules.

**Each leftover legacy lease becomes a `historical` quarantine.** Old binaries
delete their lease at release, so any file left behind is a run that never
released. This holds whether or not it lists `ownedProcesses`. A lease whose
PID is alive refuses the import (it contradicts the writer window), and an
unreadable, unsafe or inconsistent file fails it closed.

- A UUID-named lease becomes a quarantine on (`ios-simulator`, UUID).
- Any other name cannot be mapped to an identity: the legacy format has no
  platform tag, the name is uppercased, and an AVD root is not recorded. It
  becomes a quarantine keyed on its legacy name. Admission refuses any
  `android-emulator` whose recorded AVD name matches it (case-insensitive) and
  any `android-phone` whose serial matches. Over-matching is the intended safe
  direction. An AVD renamed or recreated since then is not caught.
- The lease's `ownedProcesses`, PID, token and run ID are kept as evidence on the
  quarantine. They are not a component inventory; no receipt covers these
  quarantines in Phase 2.

This adds an optional legacy-name key to quarantines (Store schema evolution).

**Repeatable.** Each run appends a receipt listing every source file's path and
sha256 and the quarantines it created. A file already imported with the same
path and hash is skipped; an identical rerun returns the same receipt; source
files are never changed or deleted. A legacy lease found in a new root, or
written later by an old binary despite exclusivity, enters through a later run.

**Markers.** An imported legacy lease file (same path and sha256) counts as known
to admission, so its quarantine, not the marker rule, refuses the device. Phase 2
never deletes it. A legacy file that appears after import stays unknown and
refuses `DEVICE_BUSY` until imported.

## Activation runbook requirements

Decided in [Activation runbook for the real store](../../appium-phase2/issues/09-activation-runbook.md) (owner, 2026-10-19).
Applying it to the real store needs a separate owner go-ahead. Package 2B writes
the runbook text against the commands it builds and updates
`docs/guide/14-observed-actions.md` when it ships. The text must follow these
rules.

**Preflight.** `admission-maintenance preflight` is read-only and never stops
anything. It lists:

- processes whose command line names the bridge or its MCP server, with PID and
  start time;
- open handles on the store files;
- lock files in the default and declared lease roots;
- active attempts in the store;
- installed bridge plugins and their versions (Claude Code, Codex, project MCP
  configs).

`upgrade` and `import` repeat these checks themselves and refuse on a live bridge
process, an open handle, or a reachable install older than the admission
authority. Only the owner asserts `writersStopped`, after reading the report.

**Order.**

1. Quiesce every agent and terminal that could run the bridge (owner coordination).
2. Run preflight.
3. Recover any active attempt with v1.4.0, because the upgrade refuses on one.
4. Update or remove every older install, including v1.2.0 and v1.3.0 plugins,
   which ignore admission. Between this step and step 6, new binaries refuse the
   schema 2 store.
5. Run preflight again; it must be clean.
6. `upgrade` (2 to 3).
7. `import`.
8. Verify.

**Verification.** First, read-only status shows:

- schema 3;
- the receipt chain (v1 migration, 2 to 3 upgrade, import);
- preserved row counts and digests;
- the expected quarantines, including the protected devices as `exclusion`
  quarantines and any imported legacy leases;
- the verified backup.

Then one owner-approved smoke run on a non-protected simulator and on an
emulator: one owner, an accepted fence receipt, and the device available
afterwards.

**Refusal.** Any refusal stops the runbook at that step and keeps the store,
guard, backup and sources as they are. Record the output and report it to the
owner. Never edit a declaration, delete a guard or restore a backup to get past
a refusal. Updated installs stay updated.

**Records.** Full outputs (preflight reports, receipts, verification, smoke
result) go to a private (0700) `activation/<date>/` folder in the admission root.
A short committed summary lists only versions, counts, quarantine totals and
pass or fail, with no paths.

**Executor.** The owner, or an agent the owner has explicitly authorized for that
activation. The agent stops at every refusal and never asserts `writersStopped`.

## Release state contract

Decided in [Evidenced release with immutable outcomes](../../appium-phase2/issues/04-evidenced-release-state.md) (owner, 2026-10-19).

**Separate records.** Release touches only the device lease. Everything else is
set once or appended:

- *Attempt outcome* (observed, completed, refused, inconclusive): published at
  dispatch closure, immutable. `observed` keeps its v1.4.0 meaning and stored
  values.
- *Command disposition*: `outstanding`, then `settled` or `uncertain`, once.
  Each command records the native component it was sent through. A creation
  request whose reply is lost stays an outstanding command. Closure turns every
  outstanding command `uncertain`.
- *Native component inventory*: each component (session, server or driver
  process, on-device helper) is recorded under its owner generation before it
  starts. A lost creation reply without a session ID marks that generation's
  inventory incomplete.
- *Quarantine*: an append-only record on a device with kind (`native`, bound to
  one owner generation; `historical`; `exclusion`), cause and time. Its only
  later write is setting its covering fence receipt, once. Never deleted.
- *Fence receipt*: append-only; binds the owner token and generation, the
  components and non-settled commands it fences, and the stop-evidence references.
- *Allocation capacity*: release and receipts never change it.

**Availability is derived.** A device lease is available when no owner holds it
and every quarantine on it is covered. A stored device state is at most a view.
This replaces v1.4.0 `terminal()`, which sets the device's state from the outcome,
so an inconclusive outcome quarantines the device permanently.

**Release.** Closure publishes the outcome and leaves the lease with its owner,
fencing. The authority, not the caller, then checks a submitted receipt against
its own records for that one generation: dispatch durably closed; every command
settled or listed; inventory complete and every recorded component, including
each listed command's component, covered by stop evidence. On any failure it
refuses (`DISPATCH_OPEN`, `COMMANDS_UNFENCED`, `COVERAGE_UNKNOWN`,
`COVERAGE_INCOMPLETE`, `STALE_OWNER`, `UNBOUND_PROOF`, `NOT_COVERABLE`) and
changes nothing. Checks run in this order and the first failure names the code:
wrong owner or generation `STALE_OWNER`; missing binding `UNBOUND_PROOF`; a
forbidden quarantine kind or unknown creation `NOT_COVERABLE`; open dispatch
`DISPATCH_OPEN`; otherwise incomplete inventory `COVERAGE_UNKNOWN`; a non-settled
command not listed `COMMANDS_UNFENCED`; a component without stop proof
`COVERAGE_INCOMPLETE`. An accepted receipt releases the live owner's lease or covers
that generation's `native` quarantine. An inconclusive outcome does not block
release: the outcome stays inconclusive and the allocation stays quarantined.

**Late replies.** A reply for a command that is no longer outstanding, whose
dispatch is closed, or whose generation is not current is appended to the
journal as an observation tied to the command. It changes no disposition,
outcome, quarantine or receipt.

**Lost COMMIT replies.** Retrying an identical issue, closure, terminal or receipt
request retrieves the committed record with zero device effects. A new mutation
for a command that is not settled refuses.

**Abandoned owners.** Process death changes nothing. Explicit recovery of a
recorded owner whose process is gone commits closure, turns the lease into a
`native` quarantine for that generation, and does not resume the scenario. Only
a receipt bound to that generation covers it.

**Proof that covers nothing.** A receipt binds to exactly one generation; one
offered for another generation refuses `STALE_OWNER`. A fresh probe naming no
generation, components or commands ("nothing is running now") refuses
`UNBOUND_PROOF`.

**Not lifted in Phase 2.** `historical` quarantines (imported legacy Android
leases, v1.4.0 quarantined devices and unresolved native studies), `exclusion`
quarantines (protected and declared-excluded devices) and `native` quarantines
with incomplete inventory (unknown creation) refuse every receipt. Reserve a
receipt kind for lifting them, refused in Phase 2; Phase 5 or a separate
owner-approved maintenance step defines it.

## Authoritative operation and recovery contract

Authorize one owner atomically before effects. Persist owner token/generation,
run/allocation/action binding, native session/components, request/command
identity and outstanding disposition. Serialize commands per canonical device;
perform native work outside SQL transactions. Commit cancellation/closure before
abort. A lost COMMIT reply never authorizes reissuing a mutation.

Publish native stop/coverage receipts in this authority before any lease release.
Validate their owner/generation/component/command binding and three-condition
proof, rather than accepting caller-supplied success booleans. Distinguish
session deletion, native component settlement, device lease availability,
immutable attempt outcome and retained allocation capacity. Safe recovery keeps
an uncertain outcome inconclusive and cannot reclaim retained allocations.

Inspect/status is read-only. Recovery of a recorded abandoned owner, whether
explicit or at admission (below), neither resumes a scenario nor clears an old
exclusion from a fresh unrelated proof. Missing IDs/processes, unreachable devices and unknown coverage
retain uncertainty. Identical request retrieval has zero new device effects;
changed identity/request conflicts preserve authoritative state.

## Retiring DeviceLease as an ownership authority

Decided in [Retiring DeviceLease as an ownership authority](../../appium-phase2/issues/06-device-lease-retirement.md) (owner, 2026-10-19).

**One owner record.** Admission is the only record of who owns a device, on
both platforms and every entry point. `src/device/lease.ts` stops deciding
ownership; each of its jobs moves:

| Today in `lease.ts` | Phase 2 home |
| --- | --- |
| `$TMPDIR` lock file per device | Compatibility marker only (below) |
| `ownedProcesses` in the lock file (Mac-side streams, port forwards, agent PIDs) | Admission's component inventory, recorded before each start |
| In-memory per-kind command ledger (`mobilebuildmcp`, `adb`, `agent`) | Admission's commands, every one committed before it is sent, each tied to its component |
| `fence(kind)` / `settled(kind)` | Per-component stop evidence in fence receipts |
| Android dead-holder reclaim and sweep | Recovery at admission (below) |
| `track`/`settle`/`releaseLate` and the write queue | Stay in-process, in the class renamed (for example `OperationTracker`); never ownership |

**Every command is recorded.** Read-only adb queries, screenshots, agent
requests and MobileBuildMCP calls each commit an outstanding command before
they are sent and a settlement after, because even a read-only query can outlive
its owner and hold Android's single automation slot.

**Compatibility marker.** The `$TMPDIR` lock file (`DEFAULT_LEASE_ROOT`) is
written only after admission authorizes, and removed at release. It exists so
v1.4.0 and older binaries see the device busy. Nothing reclaims it on process
death, and no ownership decision reads it, except as follows. A leftover marker
whose token admission recorded is replaced once admission frees the device. A
marker admission does not know refuses `DEVICE_BUSY`, even when its process is
dead, until Legacy lease import decides otherwise. The exclusivity limits for
old binaries are unchanged.

**Recovery at admission.** When a run finds the device's recorded owner dead
(by PID and process start time, so a reused PID is not that owner), admission
commits the recovery: closure and a `native` quarantine for that generation. The
run then sweeps exactly that generation's recorded components, submits the stop
evidence as a fence receipt, and proceeds only if the authority accepts it.
Otherwise it refuses `DEVICE_QUARANTINED` and the quarantine stays. A later run
may retry the same generation-bound sweep. The sweep runs under one durable,
exclusive recovery claim per target generation: only the claim holder issues
sweep commands, each recorded like any other command; a competing claimant
causes no device effect, and ordinary admission of the device waits until the
claim closes with its receipt accepted. iOS and Android behave the same: iOS
gains this recovery, and Android loses reclaim on process death alone.

**Stop evidence in Phase 2.** Besides the device agent's existing stop check:

- adb command: its host adb client process (recorded PID and start time) has
  exited, and the device's process list shows no process matching the recorded
  command. The outcome stays uncertain; the command can no longer take effect.
- Mac-side streams and port forwards: their process has exited or the forward
  is gone.
- MobileBuildMCP commands get no stop evidence, so an uncertain one keeps its
  device quarantined, as v1.4.0 keeps the iOS lease today. A settled one-shot
  MobileBuildMCP command whose invocation is confirmed complete is its own
  terminal evidence for that command's component; persistent components still
  need stop evidence.

Appium session and driver evidence is Phase 3 adapter work.

## Verification and exit

Through existing admission/maintenance and public integration seams, cover:

- Invalid/conflicting profiles and missing/changed preconditions: zero mutations.
- Legacy/default/profile selection with equivalent aliases, disagreements,
  shadowed defaults and both transports; compatible launch/budget meanings.
- Cross-process scripted/observed/capture competition and AVD/serial aliases:
  one owner, unchanged losing state and no losing backend request.
- Identity aliasing against a fake adb and console: same AVD name under two
  roots, two ini files naming one directory, a `-read-only` second instance,
  serial reuse between two reads, empty/`KO:`/`NO_AVD_INFO` replies, empty
  property with a good console, property and console disagreeing, an `offline`
  emulator, a phone over USB then Wi-Fi, a reserved `ios-phone` name, and
  existing iOS keys and allocation IDs unchanged.
- One live trial on the pinned emulator captures the exact console stdout for
  success, missing/empty/mismatched token, `offline` and a `-read-only` second
  instance, kept as fixtures.
- HOME/cwd/project/temp/path aliases: one production authority; fake-store
  attachment refusal and no alternate authority on corruption.
- Existing/Android historical uncertainty, reservations, imported records,
  partial migration, before/after-COMMIT crashes and identical retrieval.
- Cancellation before/after authorization, late replies, stale-owner proof,
  absent/incomplete native coverage and complete supported recovery: lease
  unavailable until proof; immutable history and capacity unchanged afterward.
- Legacy lease import: UUID and name-keyed quarantines, case-insensitive AVD-name
  and serial matching, live-PID and malformed-file refusal, skipped duplicates,
  identical rerun retrieval, a later new file, and unchanged sources.
- Lease retirement: an owner killed with outstanding adb, agent and stream
  components recovers at the next admission only after verified stop evidence;
  a reused owner PID proves the old owner gone and permits recovery, while a
  reused component PID never authorizes stopping the new process and release
  refuses without independent proof; an offline device, an unknown marker and an
  uncertain MobileBuildMCP command each refuse; markers appear and disappear only with
  admission ownership.
- Store upgrades on isolated stores: 2 to 3 with preserved row counts and
  digests, crashes before and after COMMIT with checked `--recover`, identical
  rerun retrieval, `UPGRADE_BLOCKED` on active attempts, wrong-version openers
  refused both ways, trigger-blocked edits, and fresh stores built by the chain.
- Release-state cases from the [prototype](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/prototype/release-state/.scratch/appium-phase2/prototypes/release-state.prototype.html):
  happy path, late reply, lost COMMIT reply, abandoned owner, earlier-generation
  receipt, unknown creation and imported history, each with its refusal code
  and unchanged outcome, quarantine and capacity records.

Exit with compatible preflight, preserved migration logical records, explicit
activation readiness, and verified authorization/recovery behavior. Repeat full
public composition checks in Phase 3. Keep old-binary/external-tool exclusivity
limits explicit; this database coordinates only participants.

## Owner-assigned race tests, 2026-10-18

Packages 2C and 2D own H01–H03, H11, P3 and P4 from the previous qualification plan: two concurrent creates, close racing dispatch, durable admission/issue/closure ordering, authority death and recovery-writer contention. These are not Phase 1 entry gates. Phase 1 preserves its existing per-case at-most-one creation, no replay and closure-before-abort checks.
