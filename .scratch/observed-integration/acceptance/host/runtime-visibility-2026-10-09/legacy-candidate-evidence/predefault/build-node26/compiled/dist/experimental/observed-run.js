import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { selectorSchema, screenGuardSchema } from '../scripted/schema.js';
import { ObservedOperationError } from '../observed/schema.js';
const selector = selectorSchema.transform(value => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)));
const guard = screenGuardSchema.transform(value => ({ present: value.present.map(item => selector.parse(item)), absent: (value.absent ?? []).map(item => selector.parse(item)) }));
export const observedExperimentSchema = z.strictObject({
    experimental: z.literal('observed-tap-v1'), actionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
    deviceId: z.string().uuid().transform(value => value.toUpperCase()),
    app: z.strictObject({ bundleId: z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/) }),
    selector, before: guard, after: guard, timeoutMs: z.number().int().min(100).max(60_000),
});
/** Historical migration location, never an alternate admission store. */
export const OBSERVED_JOURNAL_ROOT = join(homedir(), 'Library', 'Application Support', 'jev-ios-bridge', 'observed-actions');
/** Original request spelling delegates all execution, evidence and authority to the shared service. */
export function parseObservedExperiment(raw) {
    let bytes;
    try {
        bytes = JSON.stringify(raw);
    }
    catch {
        throw new ObservedOperationError('INVALID_REQUEST', 'Invalid historical action request');
    }
    if (!bytes || Buffer.byteLength(bytes) > 64 * 1024)
        throw new ObservedOperationError('INVALID_REQUEST', 'Historical action request exceeds its JSON size limit');
    const parsed = observedExperimentSchema.safeParse(raw);
    if (!parsed.success)
        throw new ObservedOperationError('INVALID_REQUEST', 'Invalid historical action request');
    return parsed.data;
}
export async function runObservedExperiment(raw, _evidenceDir, options) {
    const config = parseObservedExperiment(raw);
    if (!options.service)
        throw new ObservedOperationError('MIGRATION_REQUIRED', 'Raw-device execution requires a matching prepared allocation in the shared service');
    const request = { version: 1, actionId: config.actionId, app: config.app, action: { kind: 'tap', selector: config.selector },
        before: config.before, after: config.after, timeoutMs: config.timeoutMs };
    let snapshot = await options.service.startHistorical(request, config.deviceId);
    while (snapshot.state === 'running' || snapshot.state === 'finalizing') {
        snapshot = await options.service.inspect(config.actionId, { waitMs: 45_000, ...(options.signal ? { signal: options.signal } : {}) });
    }
    return snapshot;
}
export async function readObservedExperiment(path) {
    const bytes = await readFile(path);
    if (bytes.length > 64 * 1024)
        throw new ObservedOperationError('INVALID_REQUEST', 'Historical action request exceeds its JSON size limit');
    try {
        return JSON.parse(bytes.toString('utf8'));
    }
    catch {
        throw new ObservedOperationError('INVALID_REQUEST', 'Expected a JSON historical action request');
    }
}
