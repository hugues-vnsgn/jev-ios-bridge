import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { z } from 'zod/v4';
import type { AllocationRecord, AllocationReason } from '../device/admission-allocation.js';
import { simulatorUuid, validSimulatorIdentifiers } from './create-source.js';

const text = z.string().min(1).max(500).refine(s => !!s.trim() && !s.includes('\0'));
export const allocationIdSchema = z.string().regex(simulatorUuid).transform(s => s.toUpperCase());
export const allocationActionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
export const prepareAllocationSchema = z.strictObject({
  version: z.literal(1), actionId: allocationActionIdSchema,
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('create'), deviceTypeId: text, runtimeId: text })
      .refine(s => validSimulatorIdentifiers(s.deviceTypeId, s.runtimeId)),
    z.strictObject({ kind: z.literal('supplied'), inventoryId: text }),
  ]),
  app: z.strictObject({ artifactPath: z.string().min(1).max(4096).refine(p => isAbsolute(p) && !p.includes('\0')),
    bundleId: z.string().max(500).regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/),
    build: z.strictObject({ id: text, origin: text }) }),
  timeoutMs: z.number().int().min(1000).max(900000).default(360000),
});
export type PrepareAllocationRequest = z.infer<typeof prepareAllocationSchema>;
export type AllocationOperationCode = AllocationReason | 'UNSUPPORTED_VERSION' | 'STORE_UNAVAILABLE' | 'MIGRATION_REQUIRED'
  | 'SHUTTING_DOWN' | 'WAIT_CANCELLED' | 'INTERNAL_ERROR';
export class AllocationInputError extends Error {
  constructor(readonly code: AllocationOperationCode) { super('Invalid allocation request'); }
}
export function parsePrepareAllocation(raw: unknown): PrepareAllocationRequest {
  try { if (Buffer.byteLength(JSON.stringify(raw)) > 65536) throw new Error(); }
  catch { throw new AllocationInputError('INVALID_REQUEST'); }
  if (raw && typeof raw === 'object' && 'version' in raw && raw.version !== 1) throw new AllocationInputError('UNSUPPORTED_VERSION');
  const parsed = prepareAllocationSchema.safeParse(raw);
  if (!parsed.success) throw new AllocationInputError('INVALID_REQUEST');
  return parsed.data;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function preparationDigest(request: PrepareAllocationRequest): string { return createHash('sha256').update(canonicalJson(request)).digest('hex'); }
export type AllocationSnapshotV1 = {
  version: 1; allocationId: string; actionId: string; state: AllocationRecord['state']; phase: AllocationRecord['phase'];
  device: { platform: 'ios-simulator'; udid: string } | null; reason: AllocationReason | null;
  outcome: AllocationRecord['outcome']; authority: 'committed' | 'unconfirmed'; readinessEvidence: string[]; evidenceRefs: string[];
  reservation: { bytes: number; capacityHeld: boolean }; hostCreationBlocked: boolean; cancellationRequested: boolean;
};
export type AllocationOperationError = {
  version: 1; kind: 'observed-operation-error'; code: AllocationOperationCode; message: string;
  actionId?: string; allocationId?: string; acceptance: 'no' | 'yes' | 'unknown'; acceptanceKind: 'preparation';
  blockingAllocationId?: string; evidenceDirectory?: string;
};
export type AllocationResult = AllocationSnapshotV1 | AllocationOperationError;
export function allocationSnapshot(record: AllocationRecord, authority: 'committed' | 'unconfirmed' = 'committed'): AllocationSnapshotV1 {
  return { version: 1, allocationId: record.allocationId, actionId: record.actionId, state: record.state, phase: record.phase,
    device: record.device ? { platform: 'ios-simulator', udid: record.device } : null, reason: record.reason,
    outcome: authority === 'committed' ? record.outcome : null, authority,
    readinessEvidence: [...record.readinessEvidence], evidenceRefs: [...new Set([record.evidenceDirectory, ...record.evidenceRefs])],
    reservation: { bytes: record.reservationBytes, capacityHeld: record.capacityHeld },
    hostCreationBlocked: record.hostCreationBlocked, cancellationRequested: record.cancellationRequested };
}
export function allocationError(code: AllocationOperationCode, identity: {
  actionId?: string; allocationId?: string; evidenceDirectory?: string; blockingAllocationId?: string;
} = {}, acceptance: AllocationOperationError['acceptance'] = 'no'): AllocationOperationError {
  return { version: 1, kind: 'observed-operation-error', code, message: `Allocation operation refused: ${code}.`,
    ...identity, acceptance, acceptanceKind: 'preparation' };
}
