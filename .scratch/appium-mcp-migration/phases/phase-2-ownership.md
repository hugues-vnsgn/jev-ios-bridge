# Phase 2 specification: profiles and one admission authority

Status: behavior specified; store schema and lease retirement decisions open; execution paused
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
`PROFILE_CONFLICT`. Without a profile, `limits` behave as today.

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
serialize.

**Resolution.** Every admission resolves the device name (script, profile, env
or vendor file) live; nothing caches a name-to-identity mapping. A name matching
two live identities refuses `DEVICE_AMBIGUOUS`, none refuses `DEVICE_NOT_FOUND`.
The `avd || name` serial fallback is removed: missing provenance refuses. Sources
that disagree (console name versus guest property, one inode under two paths,
serialno versus USB serial) refuse `DEVICE_IDENTITY_CONFLICT` and record the
reason without quarantining the device. A moved or renamed AVD is a new identity;
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
store or deletion of guards to reset authority is permitted.

Test isolated stores first. Applying migration requires a recorded exclusive
writer window, historical roots declared/excluded, whole-store backup and owner
coordination. Do not stop another agent or declare that its writer is stopped.
Preserve protected historical devices and unresolved native studies. Coordinate
actual activation only after these prerequisites; it is not part of planning.

## Release state contract

Decided in [Evidenced release with immutable outcomes](../../appium-phase2/issues/04-evidenced-release-state.md) (owner, 2026-10-19).

**Separate records.** Release touches only the device lease. Everything else is
set once or appended:

- *Attempt outcome* (completed, refused, inconclusive): published at dispatch
  closure, immutable.
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
changes nothing. An accepted receipt releases the live owner's lease or covers
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

Inspect/status is read-only. Explicit recovery diagnoses a recorded abandoned
owner; it neither resumes a scenario nor clears an old exclusion from a fresh
unrelated proof. Missing IDs/processes, unreachable devices and unknown coverage
retain uncertainty. Identical request retrieval has zero new device effects;
changed identity/request conflicts preserve authoritative state.

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
