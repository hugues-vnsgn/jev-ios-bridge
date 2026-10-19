# Activate the shared admission store

Use this runbook to upgrade an existing schema 2 admission store to schema 3 and import legacy history. The owner must authorize each activation separately. Writing or reviewing this runbook does not authorize execution against the real store.

Only the owner asserts `writersStopped`. An authorized activation agent stops at every refusal and never makes that assertion for the owner. Keep every updated install updated if a later step refuses.

## Quiesce all writers

Coordinate with every agent, terminal, MCP host, Codex session, Claude Code session, and Orca terminal that can run the bridge. Stop their bridge work through their owners. Preflight lists evidence; it never stops processes, closes handles, or proves exclusivity across other OS users or machines.

Inventory historical lease and journal roots, including older home directories and TMPDIR locations. Import includes the default lease root automatically. Declare additional lease roots and newly declared journal roots, or exclude every affected simulator UUID. Journal roots recorded in the original migration receipt are not scanned again. Preserve protected study devices and unresolved native studies.

Use `umask 077` before creating private declaration files. Save `history.json` with the following fields. The owner supplies the assertions and replaces the arrays with the actual roots and exclusions.

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

Save `upgrade.json` with this separate declaration after the owner confirms the writer window.

```json
{"version":1,"kind":"upgrade","from":2,"to":3,"writersStopped":true}
```

Use the new schema 3 package to run steps 2 through 8, from the first preflight through receipt verification. Step 4 updates or removes the other installs. Run the commands below from that new package's directory. For an npm installation, prefix the entry with `node_modules/jev-ios-bridge/`. For a plugin installation, use that plugin's package directory. The authority remains anchored to the OS account's private `Library/Application Support/jev-ios-bridge/admission` directory. There is no destination override.

## Run the first preflight

```sh
node dist/device/admission-maintenance.js preflight history.json
```

Read every named check, not only `ready`. The JSON lists process PIDs and start times, open store handles, discovered install versions, lease files, planned quarantines, active attempts, and any retained guard. Exit 0 with `ready: true` means the detectable checks passed. Exit 3 means stop and resolve the reported condition with the owner.

An unreadable or unsafe source refuses rather than counting as an empty root. A lease with a live PID fails `sources` with `HOLDER_ALIVE`, even if the holder has no recognizable bridge command line. Discovery failures also prevent readiness.

## Stop if any attempt is active

If preflight lists any active attempt, stop and report it to the owner. The upgrade refuses while an attempt is active. v1.4.0 has no supported CLI, MCP tool, or startup path that recovers it. The owner decides each case. This runbook never forces or edits an attempt. Do not resubmit the action or treat process death as native release. Continue only after the owner resolves the condition and a fresh preflight reports no active attempts.

## Update or remove older installs

Update or remove every reachable older bridge install, including the v1.2.0 and v1.3.0 plugins that ignore admission. Inventory Claude Code plugins, Codex registrations, project MCP configurations, npm packages, and terminals with older paths. Review paths that discovery could not identify. An unknown version fails preflight.

The installed v1.4.0 binary also needs an update before use against schema 3. After the upgrade it refuses with `STATE_UNAVAILABLE` and the exact message `Admission identity/schema/migration mismatch`. This message means that the install must be updated before use; it does not name the schema version. Between install updates and the store upgrade, updated binaries refuse the schema 2 store. Do not downgrade or restore an old store to bridge that interval.

## Require a clean preflight, then upgrade

```sh
node dist/device/admission-maintenance.js preflight history.json
node dist/device/admission-maintenance.js upgrade upgrade.json
```

Run the second command only after reviewing a successful first result. `upgrade` repeats the process, handle, install, discovery, guard, active-attempt, and backup checks. It reports import sources but does not refuse an upgrade because of them. An active attempt refuses with `UPGRADE_BLOCKED` and a list of the attempts. A refusal retains the existing state.

A successful upgrade prints `kind: "upgrade"`, `from: 2`, `to: 3`, backup paths and SHA-256 hashes, and equal preserved before/after counts and digests. The tool verifies the backup before committing; `status` reports its `verified` flag. Backups contain the database and installation marker under private `backups/<guard-token>/` storage. Keep the backup permanently. The schema step preserves historical outcomes, IDs, declarations, exclusions, reservations, and checksums. It does not import new history or settle native work.

## Import legacy history

```sh
node dist/device/admission-maintenance.js import history.json
```

Import repeats preflight, takes and verifies its own backup, and commits one immutable receipt with the source path/hash set and created quarantine IDs. A UUID lease becomes a historical quarantine on that exact iOS simulator. Any other lease name becomes an uppercase name match for emulator AVD names and phone serials. Name matches ignore case. Renamed or recreated AVDs may escape that historical name match; keep operational exclusivity.

Every leftover lease remains historical uncertainty, regardless of PID death or `ownedProcesses`. Those fields remain evidence, not a component inventory or proof of release. Phase 2 cannot lift historical quarantines. Source files remain unchanged. An identical declaration and scanned path/hash set returns the same receipt. New files can enter a later import; changed bytes at an already imported path refuse `SOURCE_CONFLICT`.

Source refusals use `IMPORT_REFUSED` with exactly one reason: `HOLDER_ALIVE`, `SOURCE_UNREADABLE`, `SOURCE_UNSAFE`, `SOURCE_INCONSISTENT`, or `SOURCE_CONFLICT`. Record that reason and stop.

## Verify the receipt chain

```sh
node dist/device/admission-maintenance.js status
```

Require schema 3, the original migration receipt, the 2 to 3 upgrade receipt, and the import receipt. Review preserved counts and digests, expected historical quarantines, protected devices as exclusion quarantines, source hashes, and every backup's `verified` flag. Status is read-only and can also inspect schema 2 before activation.

The protected simulator UUIDs are `73997430-DB8A-48C8-8146-12320CE6AEFE`, `2FE383F2-2D0F-4286-8797-D3ACEFCD6220`, `6A8C5F93-F59A-456B-B157-10642209B734`, and `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. These and the declaration's `excludedDevices` appear as exclusion quarantines with cause `protected-device`.

After the owner approves the exact non-protected devices and smoke scenarios, run one simulator smoke and one emulator smoke. Require one owner, an accepted fence receipt, and an available device afterwards. Lifecycle support comes from P2.6; these maintenance tools cannot produce native fence evidence. Do not declare activation complete before those checks pass.

## Preserve evidence and stop at refusals

The authorized operator saves full preflight reports, receipts, status, and smoke results under a private mode 0700 `activation/<date>/` directory in the admission root. Create output files with mode 0600. Commit only a separate short summary with versions, counts, quarantine totals, and pass or fail. Omit paths from that summary.

At any refusal, stop, retain the store, guard, backups, and source files, and report the output to the owner. Do not change a declaration, delete a guard, edit a database, restore a backup, or remove a source to bypass refusal.

For an interrupted operation, the owner may authorize the matching checked recovery command.

```sh
node dist/device/admission-maintenance.js upgrade --recover upgrade.json
node dist/device/admission-maintenance.js import --recover history.json
```

Run only the command matching the retained guard. Recovery verifies the guard, declaration, installation identity, and any recorded backup. It accepts either the unchanged old store or the exact committed state with that guard's receipt. If interruption occurred before the guard recorded a verified backup, recovery requires an unchanged store and no committed receipt for the guard token. It records one maintenance event before removing its own guard. An unmatched guard, changed or missing recorded backup, unrelated store change, or conflicting receipt refuses and remains for investigation. Recovery never replays device work or deletes sources. Migration guards and unknown guards require owner investigation.
