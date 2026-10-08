import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AdmissionError } from './admission-sqlite.js';
import { migrateAdmission, migrateAdmissionForTesting, type MigrationTestOptions } from './admission-migration.js';

const help = `Usage: node dist/device/admission-maintenance.js migrate <declaration.json>

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
    if (argv.length !== 2 || argv[0] !== 'migrate') throw new AdmissionError('INVALID_REQUEST', 'Use migrate with one declaration file, or --help');
    const path = argv[1]!;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new AdmissionError('INVALID_REQUEST', 'Declaration must be a regular JSON file of at most 64 KiB');
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(path, 'utf8')); }
    catch { throw new AdmissionError('INVALID_REQUEST', 'Declaration must contain valid JSON'); }
    const receipt = testOptions ? migrateAdmissionForTesting(raw, testOptions) : migrateAdmission(raw);
    output.write(JSON.stringify(receipt) + '\n');
    return 0;
  } catch (error) {
    const code = error instanceof AdmissionError ? error.code : 'STATE_UNAVAILABLE';
    output.write(JSON.stringify({ version: 1, kind: 'admission-migration-error', code,
      message: code === 'INVALID_REQUEST' ? 'Invalid offline migration declaration or invocation; see --help' : 'Offline migration refused; preserve existing storage and inspect quiescence, source roots and installation state' }) + '\n');
    return 3;
  }
}

let directEntry = false;
try { directEntry = !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); }
catch { /* An importing host may have no filesystem entrypoint. */ }
if (directEntry) {
  process.exitCode = runAdmissionMaintenance(process.argv.slice(2), { write: value => { process.stdout.write(value); } });
}
