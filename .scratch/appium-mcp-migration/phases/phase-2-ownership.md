# Phase 2 specification: profiles and one admission authority

Status: behavior specified; release-state decision open; execution paused
Authority: [published spec](../spec.md), Decisions 9, 18 through 26;
Testing Decisions 6, 15 through 19
Context: [master handoff](../handoff.md), ADR-0008/0009/0011

## Entry and existing seams

Require reviewed Phase 1 GO. Read `src/device/admission.ts`,
`admission-sqlite.ts`, `admission-migration.ts`, `admission-maintenance.ts`,
`src/device/lease.ts`, CLI/MCP composition and observed allocation contracts.
The existing schema is iOS-simulator-only; `canonicalDevice` accepts UUIDs.
Keep allocation UUID validation separate when generalizing device identities.

Resolve the logical release-state contract in
[Evidenced release with immutable outcomes](../issues/05-evidenced-release-state.md)
before choosing persistence/API changes. The three-condition release predicate
is settled; its representation must preserve old monotonic uncertainty and
immutable outcomes instead of silently clearing them.

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

Resolve simulator UUID/set and Android AVD/serial names by bounded read-only
inspection. Emulator transport serial changes cannot create a new device lease.
Record enough AVD provenance to distinguish ambiguously named/custom-root
emulators; refuse unknown or conflicting mappings rather than guess. Tag device
category/platform so phone serials cannot collide with emulator/simulator keys.
Preserve existing iOS records and allocation IDs through canonicalization.

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
- HOME/cwd/project/temp/path aliases: one production authority; fake-store
  attachment refusal and no alternate authority on corruption.
- Existing/Android historical uncertainty, reservations, imported records,
  partial migration, before/after-COMMIT crashes and identical retrieval.
- Cancellation before/after authorization, late replies, stale-owner proof,
  absent/incomplete native coverage and complete supported recovery: lease
  unavailable until proof; immutable history and capacity unchanged afterward.

Exit with compatible preflight, preserved migration logical records, explicit
activation readiness, and verified authorization/recovery behavior. Repeat full
public composition checks in Phase 3. Keep old-binary/external-tool exclusivity
limits explicit; this database coordinates only participants.

## Owner-assigned race tests, 2026-10-18

Packages 2C and 2D own H01–H03, H11, P3 and P4 from the previous qualification plan: two concurrent creates, close racing dispatch, durable admission/issue/closure ordering, authority death and recovery-writer contention. These are not Phase 1 entry gates. Phase 1 preserves its existing per-case at-most-one creation, no replay and closure-before-abort checks.
