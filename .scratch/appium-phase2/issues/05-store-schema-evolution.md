# Store schema evolution

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: 03, 04

## Question

How does the per-user admission store evolve across schema versions without losing history or allowing a second authority?

## Required investigation or discussion

Today `admission-sqlite.ts` requires `schema_version === 2` exactly and has no upgrade path. Decide: forward-only versioned upgrades, offline-only with an exclusive writer window, receipts per upgrade, behaviour of older binaries against a newer store, interrupted-upgrade recovery, backup, and how new device categories and record types land without rewrites.

Input from [Canonical device identity](03-canonical-device-identity.md): identity is the pair (category, value), unique as a pair. The existing `devices.platform` column becomes the category (widened from `ios-simulator` only); existing iOS values and checksummed allocation records are not rewritten. Today `devices.device` is the sole primary key and `attempts`/`imported_actions` reference it, so decide how references carry the category. Emulator provenance attributes (AVD name, AVD id, device and inode, emulator version) belong on the device; serial, pid and start time belong on the attempt.

Input from [Evidenced release with immutable outcomes](04-evidenced-release-state.md): new append-only record types land here: quarantines (kind `native`/`historical`/`exclusion`, cause, generation, covering receipt), fence receipts, the per-generation native component inventory, each command's component, and late-reply observations. `devices.state` stops being the source of truth for availability, which is derived. Decide how v1.4.0 quarantined rows, protected devices and declared exclusions become quarantines without rewriting outcomes or allocation records.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.

## Answer

Owner decision, 2026-10-19 (grilling over three rounds, every recommendation accepted, summary confirmed):

- **Explicit offline upgrades.** `admission-maintenance upgrade <declaration>` runs numbered forward-only steps, each in one transaction, under the `migration.lock` guard. Opening the store never upgrades it.
- **Exact version match.** A binary opens only its own schema version and otherwise refuses with `STATE_UNAVAILABLE`, naming the upgrade command. There is no reader range, so an older binary can never ignore quarantines it doesn't understand.
- **The tool takes the backup.** Using `VACUUM INTO` plus `installation.json` into a private `backups/` folder, it verifies the copy and records its path and sha256. No backup, no upgrade.
- **Append-only `upgrades` receipts,** one per step. The original migration receipt is untouched, and an identical rerun returns the stored receipt.
- **Checked `upgrade --recover`.** It removes a left-behind upgrade guard only when the store is cleanly old (matching the backup) or cleanly new (with that token's receipt).
- **Composite (category, value) device key.** Tables are rebuilt in the 2 to 3 step, and existing iOS UUIDs and checksummed allocation records keep their values.
- **All four categories are in the schema's CHECK from schema 3.** The entry points refuse `ios-phone` with `CATEGORY_NOT_ENABLED`.
- **SQLite triggers make append-only records immutable,** apart from their one-time writes.
- **The 2 to 3 step reshapes only existing records.** v1.4.0 quarantines become `historical` quarantines; protected and excluded devices become `exclusion` quarantines. Any `active` attempt blocks the step (`UPGRADE_BLOCKED`) until recovered, and parked preparations carry over.
- **Legacy Android lease import is a separate maintenance step.** It graduated into the Legacy lease import ticket.
- **Fresh and test stores use the same step chain.**
- **No downgrade.**

Spec change: added "Store schema evolution" to [the Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md). The spec now names the checked recover as the only tool path that removes a guard, adds upgrade cases to Verification, and has an updated status line. ADR: [ADR-0012 Forward-only offline admission store upgrades](../../../docs/adr/0012-forward-only-offline-admission-store-upgrades.md). Glossary: no new domain terms; these are operational details.

Facts found: the real per-user store exists at `~/Library/Application Support/jev-ios-bridge/admission` (schema 2, created and last written 2026-10-11). It was not opened or changed. v1.4.0 already refuses any version other than 2, so upgraded stores fail closed for old binaries.

Open limits: scheduling the update of installed v1.4.0 binaries and plugins around the real upgrade belongs to the activation runbook (map fog). Exact table and column names and the trigger list are implementation detail within the stated rules.

