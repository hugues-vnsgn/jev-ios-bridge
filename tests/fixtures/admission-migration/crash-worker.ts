import { migrateAdmissionForTesting } from '../../../src/device/admission-migration.js';

const [root, journal, leases, milestone, operation = 'migration'] = process.argv.slice(2);
if (!root || !journal || !leases || !milestone) throw new Error('Explicit isolated migration roots and crash milestone are required');
const checkpoint = (point: string) => { if (point === milestone) process.kill(process.pid, 'SIGKILL'); };
if (operation === 'upgrade' || operation === 'recover') {
  const { upgradeAdmissionForTesting, recoverAdmissionUpgradeForTesting } = await import('../../../src/device/admission-upgrade.js');
  const execute = operation === 'upgrade' ? upgradeAdmissionForTesting : recoverAdmissionUpgradeForTesting;
  execute({ version: 1, kind: 'upgrade', from: 2, to: 3, writersStopped: true }, { root, backend: 'fake', checkpoint });
} else if (operation === 'migration') migrateAdmissionForTesting({ version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
  additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [] }, {
  root, backend: 'fake', defaultRoots: { journal, leases },
  checkpoint,
});
else throw new Error('Unknown isolated maintenance operation');
process.exit(1);
