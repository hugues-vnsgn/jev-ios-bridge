import { z } from 'zod/v4';
import type { OwnerProcess, AdmissionClaim, AttemptView, DeviceView, FenceRequest } from './admission.js';
import type { StagedArtifact } from '../observed/artifact.js';
import type { CreationResult } from '../observed/create-source.js';

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(500).refine(s => !!s.trim() && !s.includes('\0'));
const path = z.string().min(1).max(4096).refine(s => s.startsWith('/') && !s.includes('\0'));
const uuid = z.string().regex(/^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/);
const actionId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const stageTime = positive.max(900000);
export const allocationBudgetsSchema = z.strictObject({
  maxRetainedAllocations: positive, maxConcurrentPreparations: positive, reservationBytesPerAllocation: positive,
  maxReservedBytes: positive, minFreeBytes: positive, maxArtifactBytes: positive,
  createTimeoutMs: stageTime, bootTimeoutMs: stageTime, installTimeoutMs: stageTime, launchTimeoutMs: stageTime,
  readinessTimeoutMs: stageTime, readyTtlMs: stageTime, timeoutMs: z.number().int().min(1000).max(900000),
}).refine(b => b.maxConcurrentPreparations <= b.maxRetainedAllocations && b.maxReservedBytes >= b.reservationBytesPerAllocation);
/** Held reservations across every allocation state, independent of current configuration. */
export type AllocationCapacity = { heldAllocations: number; reservedBytes: number };
export type AllocationBudgets = z.infer<typeof allocationBudgetsSchema>;
const sourceFields = { deviceTypeId: text, runtimeId: text };
export const allocationSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create'), ...sourceFields }),
  z.strictObject({ kind: z.literal('supplied'), ...sourceFields, inventoryId: text, udid: uuid,
    creation: z.strictObject({ createdAt: text, origin: text, evidenceRef: path }),
    attestation: z.strictObject({ freshUnused: z.literal(true), exclusive: z.literal(true) }) }),
]);
export type AllocationSource = z.infer<typeof allocationSourceSchema>;
export const reservationSchema = z.strictObject({
  actionId, preparationDigest: digest, preparation: z.json(), appBundleId: text,
  source: allocationSourceSchema, inspectedContentDigest: digest, artifactBytes: z.number().int().nonnegative(),
  configVersion: z.literal(1), configDigest: digest, budgets: allocationBudgetsSchema,
  storage: z.strictObject({ simulatorFreeBytes: z.number().int().nonnegative(), stagingFreeBytes: z.number().int().nonnegative() }),
  evidenceDirectory: path,
});
export type AllocationReservationInput = z.infer<typeof reservationSchema>;
export type AllocationOwner = { allocationId: string; token: string; generation: number; process: OwnerProcess };
export type AllocationReason = 'INVALID_REQUEST' | 'ACTION_ID_CONFLICT' | 'ALLOCATION_NOT_FOUND' | 'ALLOCATION_NOT_READY' | 'ALLOCATION_BUSY'
  | 'CONFIG_INVALID' | 'HOST_PREREQUISITE_MISSING' | 'ARTIFACT_INVALID' | 'ARTIFACT_INCOMPATIBLE' | 'INVENTORY_EXHAUSTED' | 'INVENTORY_INELIGIBLE'
  | 'BUDGET_EXHAUSTED' | 'STORAGE_UNAVAILABLE' | 'HOST_CREATION_UNRESOLVED' | 'CREATE_UNCONFIRMED' | 'ADMISSION_REFUSED'
  | 'BOOT_FAILED' | 'INSTALL_FAILED' | 'LAUNCH_FAILED' | 'READINESS_FAILED' | 'PREPARATION_UNCONFIRMED' | 'CANCELLED'
  | 'READY_EXPIRED' | 'RETAINED_UNUSED' | 'STATE_UNAVAILABLE';
export type AllocationRefusal = { kind: 'refused'; reason: AllocationReason; blockingAllocationId?: string };
export type ActionEvidence = {
  bridgeVersion: string; directory: string; request: string; observations: string[]; observationCount: number;
  actionAttempted: boolean | null; actionAcknowledged: boolean | null;
  state: 'running' | 'finalizing' | 'terminal'; terminal: string | null; exportStatus: 'pending' | 'complete' | 'failed';
};
/** Internal durable record. Wire rendering belongs to the observed modules. */
export type AllocationRecord = {
  allocationId: string; actionId: string; preparationDigest: string; preparation: z.infer<ReturnType<typeof z.json>>;
  appBundleId: string; source: AllocationSource; inspectedContentDigest: string; artifactBytes: number;
  configVersion: 1; configDigest: string; budgets: AllocationBudgets; evidenceDirectory: string;
  intendedName: string; staged: StagedArtifact | null; device: string | null; creationReceipt: CreationResult | null;
  actionDigest: string | null; actionRequest: z.infer<ReturnType<typeof z.json>> | null;
  state: 'preparing' | 'ready' | 'executing' | 'retained' | 'quarantined';
  phase: 'reserved' | 'creating' | 'admitting' | 'booting' | 'installing' | 'launching' | 'readiness' | 'parked' | 'action' | 'terminal';
  reason: AllocationReason | null; outcome: 'prepared' | 'action_completed' | 'refused' | 'uncertain' | 'retired_unused' | null;
  capacityHeld: boolean; reservationBytes: number; cancellationRequested: boolean;
  owner: AllocationOwner; createdAt: number; readyAt: number | null; expiresAt: number | null;
  readinessEvidence: string[]; evidenceRefs: string[]; actionEvidence: ActionEvidence | null;
  hostCreationBlocked: boolean;
};
export type AllocationCommit = { authority: 'committed'; allocation: AllocationRecord } | { authority: 'unconfirmed'; reason: 'STATE_UNAVAILABLE' };
export interface AllocationReservation {
  readonly identity: AllocationOwner;
  readonly snapshot: AllocationRecord;
  stage(artifact: StagedArtifact): AllocationRecord;
  create(effect: () => Promise<CreationResult>): Promise<CreationResult>;
  admit(): { kind: 'admitted'; claim: PreparationClaim } | AllocationRefusal;
  fail(reason: AllocationReason, evidenceRefs?: string[], fence?: FenceRequest): AllocationCommit;
}
export interface PreparationClaim extends AdmissionClaim {
  park(readinessEvidence: string[], evidenceRefs?: string[]): AllocationCommit;
}
export interface ObservedClaim extends AdmissionClaim {
  recordObservation(refs: string[]): AllocationRecord;
  recordActionReceipt(flags: { actionAttempted: boolean | null; actionAcknowledged: boolean | null }): AllocationRecord;
  beginFinalization(): AllocationRecord;
}
export type ReserveAllocationResult = { kind: 'reserved'; reservation: AllocationReservation } | { kind: 'retrieved'; allocation: AllocationRecord } | AllocationRefusal;
export type ActionBinding = {
  allocationId: string; actionId: string; actionDigest: string; request: z.infer<ReturnType<typeof z.json>>; appBundleId: string;
  evidence: { bridgeVersion: string; directory: string; request: string };
};
export const actionBindingSchema = z.strictObject({ allocationId: uuid, actionId, actionDigest: digest, request: z.json(), appBundleId: text,
  evidence: z.strictObject({ bridgeVersion: text, directory: path, request: path }) });
export type ConsumeAllocationResult = { kind: 'consumed'; claim: ObservedClaim; allocation: AllocationRecord } | { kind: 'retrieved'; allocation: AllocationRecord } | AllocationRefusal;

export type ActionRecordView = { kind: 'allocation'; allocation: AllocationRecord; attempt: AttemptView | null; admission: DeviceView | null }
  | { kind: 'imported'; action: import('./admission-migration.js').ImportedObservedAction; admission: DeviceView | null };
