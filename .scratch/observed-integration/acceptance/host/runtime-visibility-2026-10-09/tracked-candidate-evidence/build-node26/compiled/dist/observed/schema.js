import { createHash } from 'node:crypto';
import { z } from 'zod/v4';
import { selectorSchema, screenGuardSchema } from '../scripted/schema.js';
export const observedActionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
export const observedAllocationIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .transform(value => value.toUpperCase());
const guardSchema = screenGuardSchema.transform(guard => ({ present: guard.present, absent: guard.absent ?? [] }));
export const observedActionRequestSchema = z.strictObject({
    version: z.literal(1), actionId: observedActionIdSchema, allocationId: observedAllocationIdSchema,
    app: z.strictObject({ bundleId: z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/) }),
    action: z.strictObject({ kind: z.literal('tap'), selector: selectorSchema }),
    before: guardSchema, after: guardSchema, timeoutMs: z.number().int().min(100).max(60_000),
});
export const observedReadOptionsSchema = z.strictObject({ waitMs: z.number().int().min(0).max(45_000).default(0) });
export const observedReasons = ['PRECONDITION_NOT_MET', 'TARGET_NOT_UNIQUE', 'AMBIGUOUS_CONDITION', 'INVALID_OBSERVATION',
    'TARGET_UNAVAILABLE', 'UNSUPPORTED_ACTION', 'DEVICE_ERROR', 'DEADLINE_EXCEEDED', 'CANCELLED', 'PREPARATION_UNCONFIRMED',
    'OBSERVATION_UNCONFIRMED', 'UI_ACTION_UNCONFIRMED', 'FINISH_UNCONFIRMED', 'RESULT_EVIDENCE_UNCONFIRMED', 'OWNER_LOST',
    'INTERNAL_ERROR', 'OWNER_UNAVAILABLE', 'FINALIZATION_UNCONFIRMED'];
/** Messages are bridge-owned; never incorporate raw request values or vendor errors. */
export class ObservedOperationError extends Error {
    code;
    snapshot;
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'ObservedOperationError';
        this.code = code;
        this.snapshot = { version: 1, kind: 'observed-operation-error', code, message, acceptance: 'no', acceptanceKind: 'action', ...details };
    }
    toJSON() { return this.snapshot; }
}
export function canonicalJson(value) {
    const normalize = (item) => {
        if (Array.isArray(item))
            return item.map(normalize);
        if (item !== null && typeof item === 'object')
            return Object.fromEntries(Object.entries(item)
                .filter(([, field]) => field !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([name, field]) => [name, normalize(field)]));
        return item;
    };
    return JSON.stringify(normalize(value));
}
export function parseObservedAction(raw) {
    let bytes;
    try {
        bytes = JSON.stringify(raw);
    }
    catch {
        throw new ObservedOperationError('INVALID_REQUEST', 'Expected a bounded JSON action request');
    }
    if (!bytes || Buffer.byteLength(bytes) > 64 * 1024)
        throw new ObservedOperationError('INVALID_REQUEST', 'Action request exceeds its JSON size limit');
    if (typeof raw === 'object' && raw !== null && raw.version !== 1) {
        throw new ObservedOperationError('UNSUPPORTED_VERSION', 'Observed actions require version 1');
    }
    const parsed = observedActionRequestSchema.safeParse(raw);
    if (!parsed.success)
        throw new ObservedOperationError('INVALID_REQUEST', 'Invalid observed action request');
    const snapshot = JSON.parse(canonicalJson(parsed.data));
    const freeze = (value) => {
        if (value !== null && typeof value === 'object') {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
    };
    freeze(snapshot);
    return snapshot;
}
export function observedActionDigest(request) {
    return createHash('sha256').update(canonicalJson(request)).digest('hex');
}
export function observedReason(value, fallback = 'DEVICE_ERROR') {
    return observedReasons.includes(value) ? value : fallback;
}
