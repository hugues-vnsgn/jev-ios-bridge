import { ObservedOperationError, observedAllocationIdSchema } from '../observed/schema.js';
/** Read-only compatibility facade. Historical files are imported by explicit offline migration. */
export class ObservedActionJournal {
    resolver;
    constructor(resolver) {
        this.resolver = resolver;
    }
    async read(deviceId, actionId) {
        if (typeof this.resolver === 'string')
            throw migrationRequired();
        const device = observedAllocationIdSchema.safeParse(deviceId);
        if (!device.success)
            throw new ObservedOperationError('INVALID_REQUEST', 'Invalid historical device identity');
        try {
            const snapshot = await this.resolver.inspect(actionId);
            return snapshot.device.udid === device.data ? snapshot : undefined;
        }
        catch (error) {
            if (error instanceof ObservedOperationError && error.code === 'ACTION_NOT_FOUND')
                return undefined;
            throw error;
        }
    }
    async begin(_input) { throw migrationRequired(); }
    async deviceStatus(_deviceId) { throw migrationRequired(); }
}
function migrationRequired() {
    return new ObservedOperationError('MIGRATION_REQUIRED', 'Historical journal writes require the shared prepared-allocation service');
}
