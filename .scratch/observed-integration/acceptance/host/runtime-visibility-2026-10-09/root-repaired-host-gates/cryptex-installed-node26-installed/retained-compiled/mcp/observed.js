import { z } from 'zod/v4';
import { observedActionRequestSchema, observedActionIdSchema, observedAllocationIdSchema, parseObservedAction, ObservedOperationError } from '../observed/schema.js';
import { prepareAllocationSchema, parsePrepareAllocation } from '../observed/allocation-schema.js';
import { observedError, isObservedError, observedSummary } from '../observed/cli.js';
const actionId = z.strictObject({ actionId: observedActionIdSchema });
const allocationId = z.strictObject({ allocationId: observedAllocationIdSchema });
const wait = { waitMs: z.number().int().min(0).max(45000).optional() };
/** Keep the published strict schema; invalid raw input reaches our safe versioned error renderer. */
function transportSchema(schema) {
    return { '~standard': { ...schema['~standard'], validate: value => ({ value }) } };
}
function parsed(schema, raw) {
    try {
        if (Buffer.byteLength(JSON.stringify(raw)) > 65536)
            throw new Error();
    }
    catch {
        throw new ObservedOperationError('INVALID_REQUEST', 'Expected bounded observed input');
    }
    const value = schema.safeParse(raw);
    if (!value.success)
        throw new ObservedOperationError('INVALID_REQUEST', 'Invalid observed input');
    return value.data;
}
export function registerObservedTools(server, module) {
    const register = (name, description, schema, kind, call, readOnly = false) => {
        server.registerTool(name, { description, inputSchema: transportSchema(schema),
            ...(readOnly ? { annotations: { readOnlyHint: true } } : {}) }, async (raw, ctx) => {
            let reply;
            try {
                reply = await call(raw, ctx.mcpReq.signal);
            }
            catch (error) {
                reply = observedError(error, kind);
            }
            return { content: [{ type: 'text', text: observedSummary(reply) }, { type: 'text', text: JSON.stringify(reply) }],
                ...(isObservedError(reply) ? { isError: true } : {}) };
        });
    };
    if (module.enabled) {
        register('start_observed_action', 'Start one observed tap on a prepared dedicated allocation. Returns visible predicate evidence, never a Jev verdict or native receipt. Retry the exact same identity/request only to retrieve; poll get_observed_action. Transport cancellation does not cancel an admitted action.', observedActionRequestSchema, 'action', raw => { parseObservedAction(raw); return module.start(raw); });
        register('prepare_observed_allocation', 'Prepare one dedicated simulator for the declared action identity, retaining it after use or uncertainty. Requires explicit compatible source and unmodified app artifact. No automatic replacement or replay; preparation waits within its bounded budgets.', prepareAllocationSchema, 'preparation', raw => { parsePrepareAllocation(raw); return module.prepareAllocation(raw); });
    }
    register('get_observed_action', 'Read one consistent authoritative observed action snapshot and full local evidence pointers. waitMs is 0–45000; aborting this wait stops only the wait. No recovery or replay.', actionId.extend(wait), 'action', async (raw, signal) => {
        const input = parsed(actionId.extend(wait), raw);
        return module.inspect(input.actionId, { waitMs: input.waitMs ?? 0, signal });
    }, true);
    register('cancel_observed_action', 'Explicitly cancel the exact observed action and wait at most 5000ms for local finalization. Cancellation cannot certify native release; unknown work stays unavailable. Terminal cancellation retrieves.', actionId, 'action', raw => module.cancel(parsed(actionId, raw).actionId));
    register('get_observed_allocation', 'Read persisted allocation authority, evidence and retention. waitMs is 0–45000; aborting this wait stops only the wait. Historical readOnly/historicalOutcome never grant preparation or input permission.', allocationId.extend(wait), 'preparation', async (raw, signal) => {
        const input = parsed(allocationId.extend(wait), raw);
        return module.getAllocation(input.allocationId, { waitMs: input.waitMs ?? 0, signal });
    }, true);
    register('cancel_observed_allocation', 'Cancel active preparation with bounded local finalization, or retire ready unused stock. Executing ALLOCATION_BUSY directs cancel_observed_action; no device cleanup, reuse or owner takeover.', allocationId, 'preparation', raw => module.cancelAllocation(parsed(allocationId, raw).allocationId));
    register('retire_observed_allocation', 'Change ready allocation retention metadata only; never stop, delete or reuse a device. Active preparing ALLOCATION_BUSY directs cancel_observed_allocation; executing directs cancel_observed_action. Terminal and historical retirement retrieve.', allocationId, 'preparation', raw => module.retireAllocation(parsed(allocationId, raw).allocationId));
}
