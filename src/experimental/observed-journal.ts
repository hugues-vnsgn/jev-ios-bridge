import type { ObservedActionService } from '../observed/service.js';
import type { ObservedActionSnapshot } from '../observed/report.js';
import { ObservedOperationError, observedAllocationIdSchema } from '../observed/schema.js';

export interface ObservedIntent { deviceId: string; actionId: string; intent: unknown }
export interface ObservedAttempt {
  readonly actionId: string;
  complete(result: unknown): Promise<void>;
  uncertain(reason: string): Promise<void>;
}
export type ObservedRecord = ObservedActionSnapshot;

/** Read-only compatibility facade. Historical files are imported by explicit offline migration. */
export class ObservedActionJournal {
  constructor(private readonly resolver: ObservedActionService | string) {}
  async read(deviceId: string, actionId: string): Promise<ObservedRecord | undefined> {
    if (typeof this.resolver === 'string') throw migrationRequired();
    const device = observedAllocationIdSchema.safeParse(deviceId);
    if (!device.success) throw new ObservedOperationError('INVALID_REQUEST', 'Invalid historical device identity');
    try {
      const snapshot = await this.resolver.inspect(actionId);
      return snapshot.device.udid === device.data ? snapshot : undefined;
    } catch (error) {
      if (error instanceof ObservedOperationError && error.code === 'ACTION_NOT_FOUND') return undefined;
      throw error;
    }
  }
  async begin(_input: ObservedIntent): Promise<ObservedAttempt> { throw migrationRequired(); }
  async deviceStatus(_deviceId: string): Promise<'available' | 'quarantined'> { throw migrationRequired(); }
}
function migrationRequired(): ObservedOperationError {
  return new ObservedOperationError('MIGRATION_REQUIRED', 'Historical journal writes require the shared prepared-allocation service');
}
