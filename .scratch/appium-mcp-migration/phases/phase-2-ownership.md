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

Owner input on 2026-10-14: add optional explicit selection plus a project default,
while preserving current inputs. The discussion is recorded in
[Named-profile selection contract](../issues/04-profile-selection-contract.md).

Add an optional CLI profile selector and an optional field on the MCP request
that starts a scenario; keep the versioned scenario JSON unchanged. Document
final names, bounded input shape and configuration location before wiring them.
Use `--profile`/`profile` as the proposed additive spelling, not a new required
field. Apply the same resolved configuration at CLI and MCP composition.

Select explicit profile first, then the project's configured default. With no
profile selection/default, preserve legacy selection and precedence exactly:
scenario iOS UUID, environment default, then legacy configured UUID; Android
scenario serial/AVD then environment; capture serial then AVD then environment.
Preserve the legacy project-config identity reader independently of its old UI
provider, or provide an owner-reviewed compatible migration. Removing the vendor
cannot make a previously valid omitted-device scenario fail silently.

Within the selected profile, compare the effective legacy/scenario app, device
and platform after their established precedence is applied. Equivalent aliases
are compatible; a genuine profile conflict refuses before session creation or
other mutation. Do not reinterpret shadowed legacy settings as new conflicts.
Resolve once and bind the result to the run; hand-back/retrieval cannot switch it.
Observed actions use their durable allocation binding, not a newly selected
profile or alternate device. Define profile use for allocation preparation
without changing its immutable action/artifact/source bindings.

Provide one validated project config with named profiles, optional default,
platform/device category, app identity where specified, capability whitelist,
startup/operation/cleanup budgets and prerequisite references. Keep credentials
outside it. Reject missing/duplicate names, invalid limits, unsupported device
categories, arbitrary remote endpoints and unsafe capability overrides. Reserve
later signing references without enabling physical iPhones. Optional AI remains
disabled and automation receives only required environment variables.

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
