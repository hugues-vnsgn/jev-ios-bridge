import { z } from 'zod';
import { DEVICE_CATEGORIES } from '../../src/device/admission.js';
import type { AllocationReason } from '../../src/device/admission-allocation.js';
import { reservationSchema, actionBindingSchema } from '../../src/device/admission-allocation.js';

const phase = z.enum(['constructor','reserve','consume','cancel','retire','attach','authorize','dispatch','settle','journey']);
const mode = z.enum(['reserve','consume','cancel','retire','journey','park']);
const point = z.enum(['beforeCommit','afterCommit']);
const hook = { operation: z.string(), point };
const control = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('hold'), ...hook, entered: z.string(), release: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), ...hook }),
]);
const common = { root: z.string(), input: reservationSchema, now: z.number().optional(),
  fault: z.strictObject(hook).optional(), control: control.optional(),
  gate: z.strictObject({ entered: z.string(), release: z.string() }).optional() };
export const workSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...common, mode: z.literal('reserve') }),
  z.strictObject({ ...common, mode: z.literal('consume'), binding: actionBindingSchema }),
  z.strictObject({ ...common, mode: z.literal('cancel'), allocationId: z.string() }),
  z.strictObject({ ...common, mode: z.literal('retire'), allocationId: z.string() }),
  z.strictObject({ ...common, mode: z.literal('park') }),
  z.strictObject({ ...common, mode: z.literal('journey') }),
]);
export type Work = z.infer<typeof workSchema>;
const owner = z.strictObject({ category: z.enum(DEVICE_CATEGORIES), device: z.string(), attempt: z.strictObject({ kind: z.enum(['legacy','preparation','observed']), id: z.string() }),
  token: z.string().min(1), generation: z.number().int().positive(), process: z.strictObject({ pid: z.number().int().nonnegative(), incarnation: z.string() }) });
const evidence = { actor: z.number().int().positive(), phase, effects: z.number().int().nonnegative(), authorizations: z.array(owner), effectOwners: z.array(owner), callbackEntries: z.array(z.strictObject({ owner, authorizationSeenAtEntry: z.boolean() })) };
const reason = z.enum(['INVALID_REQUEST','ACTION_ID_CONFLICT','ALLOCATION_NOT_FOUND','ALLOCATION_NOT_READY','ALLOCATION_BUSY',
  'CONFIG_INVALID','HOST_PREREQUISITE_MISSING','ARTIFACT_INVALID','ARTIFACT_INCOMPATIBLE','INVENTORY_EXHAUSTED','INVENTORY_INELIGIBLE',
  'BUDGET_EXHAUSTED','STORAGE_UNAVAILABLE','HOST_CREATION_UNRESOLVED','CREATE_UNCONFIRMED','ADMISSION_REFUSED','BOOT_FAILED','INSTALL_FAILED',
  'LAUNCH_FAILED','READINESS_FAILED','PREPARATION_UNCONFIRMED','CANCELLED','READY_EXPIRED','RETAINED_UNUSED','STATE_UNAVAILABLE']);
type AssertNever<T extends never> = T;
type ReasonCoverage = AssertNever<Exclude<AllocationReason, z.infer<typeof reason>> | Exclude<z.infer<typeof reason>, AllocationReason>>;
export const resultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...evidence, mode: z.literal('reserve'), kind: z.literal('reserved'), allocationId: z.string() }),
  z.strictObject({ ...evidence, mode: z.enum(['reserve','consume','cancel','retire']), kind: z.literal('retrieved'), allocationId: z.string() }),
  z.strictObject({ ...evidence, mode: z.enum(['reserve','consume','cancel','retire']), kind: z.literal('refused'), reason }),
  z.strictObject({ ...evidence, mode: z.literal('consume'), kind: z.literal('consumed'), allocationId: z.string() }),
  z.strictObject({ ...evidence, mode: z.literal('park'), kind: z.literal('parked'), allocationId: z.string() }),
  z.strictObject({ ...evidence, mode: z.literal('journey'), kind: z.literal('completed') }),
  z.strictObject({ ...evidence, mode, kind: z.literal('state-unavailable'), code: z.literal('STATE_UNAVAILABLE') }),
  z.strictObject({ ...evidence, mode, kind: z.literal('unexpected-error'), message: z.string() }),
]);
export type WorkerResult = z.infer<typeof resultSchema>;
export type WorkerOutcome = { [K in WorkerResult['kind']]: Omit<Extract<WorkerResult, { kind: K }>, keyof typeof evidence | 'mode'> }[WorkerResult['kind']];
export const messageSchema = z.union([z.strictObject({ ready: z.literal(true) }), resultSchema]);
export function requireResult({ value, policy = 'strict' }: { value: unknown; policy?: 'strict' | 'contention' }): WorkerResult {
  const result = resultSchema.parse(value);
  if (result.kind === 'unexpected-error' || (result.kind === 'state-unavailable' && policy === 'strict')) throw new Error(JSON.stringify(result));
  return result;
}
