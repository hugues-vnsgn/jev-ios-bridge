import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AdmissionError } from './admission-sqlite.js';
import { migrateAdmission, migrateAdmissionForTesting, type MigrationTestOptions } from './admission-migration.js';
import { upgradeAdmission, upgradeAdmissionForTesting, recoverAdmissionUpgrade, recoverAdmissionUpgradeForTesting } from './admission-upgrade.js';

const help = `Usage: node dist/device/admission-maintenance.js migrate <declaration.json>

       node dist/device/admission-maintenance.js upgrade <declaration.json>
       node dist/device/admission-maintenance.js upgrade --recover <declaration.json>

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
export function runAdmissionMaintenance(argv: string[], output: { write(value: string): void }, testOptions?: MigrationTestOptions): number {
  if (argv.length === 1 && argv[0] === '--help') { output.write(help); return 0; }
  try {
    const recover=argv[0]==='upgrade'&&argv[1]==='--recover';
    if ((!recover&&(argv.length!==2||!['migrate','upgrade'].includes(argv[0]!)))||(recover&&argv.length!==3)) throw new AdmissionError('INVALID_REQUEST', 'Use migrate, upgrade, upgrade --recover with one declaration file, or --help');
    const path = argv[recover?2:1]!;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new AdmissionError('INVALID_REQUEST', 'Declaration must be a regular JSON file of at most 64 KiB');
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(path, 'utf8')); }
    catch { throw new AdmissionError('INVALID_REQUEST', 'Declaration must contain valid JSON'); }
    const upgradeOptions=testOptions?{root:testOptions.root,backend:testOptions.backend}:undefined;
    const receipt = argv[0]==='migrate'
      ? testOptions?migrateAdmissionForTesting(raw,testOptions):migrateAdmission(raw)
      : recover?upgradeOptions?recoverAdmissionUpgradeForTesting(raw,upgradeOptions):recoverAdmissionUpgrade(raw)
      : upgradeOptions?upgradeAdmissionForTesting(raw,upgradeOptions):upgradeAdmission(raw);
    output.write(JSON.stringify(receipt) + '\n');
    return 0;
  } catch (error) {
    const code = error instanceof AdmissionError ? error.code : 'STATE_UNAVAILABLE';
    output.write(JSON.stringify({ version: 1, kind: 'admission-migration-error', code,
      message: code === 'UPGRADE_BLOCKED' && error instanceof AdmissionError ? error.message : code === 'INVALID_REQUEST' ? 'Invalid offline maintenance declaration or invocation; see --help' : 'Offline maintenance refused; preserve existing storage and inspect quiescence, source roots and installation state' }) + '\n');
    return 3;
  }
}

let directEntry = false;
try { directEntry = !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); }
catch { /* An importing host may have no filesystem entrypoint. */ }
if (directEntry) {
  process.exitCode = runAdmissionMaintenance(process.argv.slice(2), { write: value => { process.stdout.write(value); } });
}
