import { z } from 'zod/v4';
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
const sourceFields = { deviceTypeId: text, runtimeId: text };
export const allocationSourceSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('create'), ...sourceFields }),
    z.strictObject({ kind: z.literal('supplied'), ...sourceFields, inventoryId: text, udid: uuid,
        creation: z.strictObject({ createdAt: text, origin: text, evidenceRef: path }),
        attestation: z.strictObject({ freshUnused: z.literal(true), exclusive: z.literal(true) }) }),
]);
export const reservationSchema = z.strictObject({
    actionId, preparationDigest: digest, preparation: z.json(), appBundleId: text,
    source: allocationSourceSchema, inspectedContentDigest: digest, artifactBytes: z.number().int().nonnegative(),
    configVersion: z.literal(1), configDigest: digest, budgets: allocationBudgetsSchema,
    storage: z.strictObject({ simulatorFreeBytes: z.number().int().nonnegative(), stagingFreeBytes: z.number().int().nonnegative() }),
    evidenceDirectory: path,
});
export const actionBindingSchema = z.strictObject({ allocationId: uuid, actionId, actionDigest: digest, request: z.json(), appBundleId: text,
    evidence: z.strictObject({ bridgeVersion: text, directory: path, request: path }) });
