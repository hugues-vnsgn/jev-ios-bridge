import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AdmissionError } from './admission-sqlite.js';
import { migrateAdmission, migrateAdmissionForTesting, type MigrationTestOptions } from './admission-migration.js';
import { upgradeAdmission, upgradeAdmissionForTesting, recoverAdmissionUpgrade, recoverAdmissionUpgradeForTesting } from './admission-upgrade.js';

import { importAdmission, importAdmissionForTesting, recoverImportAdmission, recoverImportAdmissionForTesting, preflightAdmission, preflightAdmissionForTesting, admissionStatus, admissionStatusForTesting, requireMaintenanceRecoveryHost, type HostInventory } from './admission-import.js';

const help = `Usage: node dist/device/admission-maintenance.js migrate <declaration.json>

       node dist/device/admission-maintenance.js preflight [declaration.json]
       node dist/device/admission-maintenance.js status
       node dist/device/admission-maintenance.js import <declaration.json>
       node dist/device/admission-maintenance.js import --recover <declaration.json>
       node dist/device/admission-maintenance.js upgrade <declaration.json>
       node dist/device/admission-maintenance.js upgrade --recover <declaration.json>

Preflight lists processes, store handles, installs, leases, active attempts and
planned quarantines without changing files or stopping anything. Exit 3 means
not ready. Pass the import declaration to include every declared source root.
Upgrade and import repeat preflight before mutation. Status reads schema 2 or 3,
receipts, preserved counts/digests, quarantines and verifies backup hashes.
Import uses the migration declaration below, on schema 3. A live holder refuses
IMPORT_REFUSED with HOLDER_ALIVE; unsafe, unreadable, inconsistent or conflicting
sources refuse with SOURCE_UNSAFE, SOURCE_UNREADABLE, SOURCE_INCONSISTENT or
SOURCE_CONFLICT. Sources remain unchanged. Identical path/hash sets retrieve the
receipt; new files permit a later receipt. Import --recover checks only matching
import guards against the verified backup or committed receipt.
See docs/guide/admission-activation.md for the owner-only activation sequence.
Stop at every refusal and preserve all files. Never delete a guard or restore
an older backup to bypass refusal. Agents never assert writersStopped.

Upgrade declaration (version 1):
{"version":1,"kind":"upgrade","from":2,"to":3,"writersStopped":true}

Upgrades are explicit and forward only. The tool takes and verifies a private
whole-store backup before changing an existing committed store. Opening a store
never upgrades it. Each binary opens exactly its own schema version.
Restoring an older backup after new work drops that work and its guarantees.
Checked upgrade --recover removes only a matching upgrade guard after verifying
the old backup-equivalent state or the new state with that guard's receipt.
Migration and unknown guards require operator investigation.

Offline only. Stop all old bridge/experimental writers and arrange exclusive
updated-bridge operation of the dedicated devices before declaring quiescence.
No device commands are issued. The declaration is an operator assertion, not
proof of process quiescence or native release. Declare every non-default journal
and lease root (including historical home/TMPDIR locations), or exclude all
affected device UUIDs. Existing declared roots must be readable.

Declaration (version 1, no additional fields):
{"version":1,"writersStopped":true,"historicalRootsDeclaredOrExcluded":true,"additionalJournalRoots":[],"additionalLeaseRoots":[],"excludedDevices":[]}

Default historical roots are always included. Admission uses the OS account's
private Application Support root; this command accepts no destination override.
Sources are never rewritten or deleted. A repeated identical import returns
the original receipt and IDs. Partial installations or a retained migration guard
require operator investigation; do not delete them to reset authority.
Back up the whole admission store. Deleting the entire root or restoring an old
backup cannot be detected by its local installation marker and invalidates its
guarantees. Matching well-formed non-UUID leases are classified outside iOS;
the legacy format carries no platform tag, so this is not Android attestation.
`;

/** Tests supply only isolated fake-store options; the executable accepts no such override. */
export function runAdmissionMaintenance(argv: string[], output: { write(value: string): void }, testOptions?: MigrationTestOptions & { host?: () => HostInventory }): number {
  if (argv.length === 1 && argv[0] === '--help') { output.write(help); return 0; }
  try {
    const command=argv[0];
    const recover=(command==='upgrade'||command==='import')&&argv[1]==='--recover';
    if(command==='status') {
      if(argv.length!==1)throw new AdmissionError('INVALID_REQUEST','Status takes no arguments');
      output.write(JSON.stringify(testOptions?admissionStatusForTesting(testOptions):admissionStatus())+'\n');return 0;
    }
    if(command==='preflight'&&argv.length===1) {
      const report=testOptions?preflightAdmissionForTesting(undefined,testOptions):preflightAdmission();
      output.write(JSON.stringify(report)+'\n');return report.ready?0:3;
    }
    if((!recover&&(argv.length!==2||!['migrate','upgrade','import','preflight'].includes(command!)))||(recover&&argv.length!==3))throw new AdmissionError('INVALID_REQUEST','Use migrate, upgrade, import, preflight, status, or --help');
    const path=argv[recover?2:1]!;
    const stat=lstatSync(path);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024)throw new AdmissionError('INVALID_REQUEST','Declaration must be a regular JSON file of at most 64 KiB');
    let raw:unknown;
    try {raw=JSON.parse(readFileSync(path,'utf8'));} catch {throw new AdmissionError('INVALID_REQUEST','Declaration must contain valid JSON');}
    if(command==='preflight') {
      const report=testOptions?preflightAdmissionForTesting(raw,testOptions):preflightAdmission(raw);
      output.write(JSON.stringify(report)+'\n');return report.ready?0:3;
    }
    if(command==='upgrade'&&recover)requireMaintenanceRecoveryHost(testOptions);
    const upgradeOptions=testOptions?{root:testOptions.root,backend:testOptions.backend,defaultRoots:testOptions.defaultRoots,...(testOptions.host?{host:testOptions.host}:{})}:undefined;
    const importOptions=testOptions?{root:testOptions.root,backend:testOptions.backend,defaultRoots:testOptions.defaultRoots,...(testOptions.host?{host:testOptions.host}:{})}:undefined;
    const receipt=command==='migrate'
      ?testOptions?migrateAdmissionForTesting(raw,testOptions):migrateAdmission(raw)
      :command==='import'
      ?recover?importOptions?recoverImportAdmissionForTesting(raw,importOptions):recoverImportAdmission(raw):importOptions?importAdmissionForTesting(raw,importOptions):importAdmission(raw)
      :recover?upgradeOptions?recoverAdmissionUpgradeForTesting(raw,upgradeOptions):recoverAdmissionUpgrade(raw)
      :upgradeOptions?upgradeAdmissionForTesting(raw,upgradeOptions):upgradeAdmission(raw);
    output.write(JSON.stringify(receipt) + '\n');
    return 0;
  } catch (error) {
    const code = error instanceof AdmissionError ? error.code : 'STATE_UNAVAILABLE';
    output.write(JSON.stringify({ version: 1, kind: 'admission-migration-error', code,
      ...(error instanceof AdmissionError&&error.reason?{reason:error.reason}:{}),
      message: error instanceof AdmissionError && error.message.startsWith('Activation preflight refused:') ? error.message : code === 'UPGRADE_BLOCKED' && error instanceof AdmissionError ? error.message : code === 'INVALID_REQUEST' ? 'Invalid offline maintenance declaration or invocation; see --help' : 'Offline maintenance refused; preserve existing storage and inspect quiescence, source roots and installation state' }) + '\n');
    return 3;
  }
}

let directEntry = false;
try { directEntry = !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); }
catch { /* An importing host may have no filesystem entrypoint. */ }
if (directEntry) {
  process.exitCode = runAdmissionMaintenance(process.argv.slice(2), { write: value => { process.stdout.write(value); } });
}
