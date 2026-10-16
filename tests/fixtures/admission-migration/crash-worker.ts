import { migrateAdmissionForTesting } from '../../../src/device/admission-migration.js';

const [root, journal, leases, milestone] = process.argv.slice(2);
if (!root || !journal || !leases || !milestone) throw new Error('Explicit isolated migration roots and crash milestone are required');
migrateAdmissionForTesting({ version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
  additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [] }, {
  root, backend: 'fake', defaultRoots: { journal, leases },
  checkpoint(point) { if (point === milestone) process.kill(process.pid, 'SIGKILL'); },
});
process.exit(1);
