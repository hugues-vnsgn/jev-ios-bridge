import { z } from 'zod/v4';
import { admissionRoot } from './admission.js';
import { AdmissionError, AdmissionSqlite } from './admission-sqlite.js';

const declarationSchema = z.strictObject({
  version: z.literal(1), kind: z.literal('upgrade'), from: z.number().int().positive(),
  to: z.number().int().positive(), writersStopped: z.literal(true),
}).refine(value => value.to === value.from + 1);
export type UpgradeDeclaration = z.infer<typeof declarationSchema>;
export type PreservedRecords = Record<string, { count: number; digest: string }>;
export type UpgradeReceipt = {
  version: 1; kind: 'upgrade'; id: string; guardToken: string; from: number; to: number;
  binaryVersion: string; time: number; declaration: UpgradeDeclaration;
  backup: { path: string; sha256: string; installationPath: string; installationSha256: string };
  preserved: { before: PreservedRecords; after: PreservedRecords };
  quarantines: { historical: number; exclusion: number };
};
export type UpgradeRecovery = { version: 1; kind: 'upgrade-recovery'; guardToken: string; schemaVersion: number; receiptId: string | null };
export type UpgradeCheckpoint = 'guarded' | 'backupVerified' | 'beforeCommit' | 'afterCommit' | 'recoveryCommitted' | 'beforeGuardRemoval';
export type UpgradeTestOptions = { root: string; backend: 'fake'; now?: () => number; checkpoint?: (point: UpgradeCheckpoint) => void };

export function parseUpgradeDeclaration(raw: unknown): UpgradeDeclaration {
  const result = declarationSchema.safeParse(raw);
  if (!result.success) throw new AdmissionError('INVALID_REQUEST', 'Expected a version 1 adjacent upgrade declaration with writersStopped true');
  if (result.data.from !== 2 || result.data.to !== 3) throw new AdmissionError('INVALID_REQUEST', 'This binary implements only the admission schema 2 to 3 step');
  return result.data;
}
export function upgradeAdmission(raw: unknown): UpgradeReceipt {
  return AdmissionSqlite.upgrade({ root: admissionRoot(), mode: 'production' }, parseUpgradeDeclaration(raw));
}
export function recoverAdmissionUpgrade(raw: unknown): UpgradeRecovery {
  return AdmissionSqlite.recoverUpgrade({ root: admissionRoot(), mode: 'production' }, parseUpgradeDeclaration(raw));
}
export function upgradeAdmissionForTesting(raw: unknown, options: UpgradeTestOptions): UpgradeReceipt {
  if (options.backend !== 'fake') throw new AdmissionError('INVALID_REQUEST', 'Upgrade tests require a fake backend');
  return AdmissionSqlite.upgrade({ ...options, mode: 'test' }, parseUpgradeDeclaration(raw), options.checkpoint);
}
export function recoverAdmissionUpgradeForTesting(raw: unknown, options: UpgradeTestOptions): UpgradeRecovery {
  if (options.backend !== 'fake') throw new AdmissionError('INVALID_REQUEST', 'Upgrade tests require a fake backend');
  return AdmissionSqlite.recoverUpgrade({ ...options, mode: 'test' }, parseUpgradeDeclaration(raw), options.checkpoint);
}
