import { DeviceReasonError } from '../index.js';

/**
 * A device command whose outcome was lost: an `adb` child killed with no exit status, or a device agent
 * request that timed out, lost its connection or was abandoned after it was sent. It may still act on
 * the device, so the lease's ledger records it as unknown until a fence ends it. Never re-send one.
 */
export class OutcomeUnknownError extends DeviceReasonError {
  declare readonly vendorCode: 'adb' | 'agent';

  constructor(vendorCode: 'adb' | 'agent', message: string, options: { cause?: unknown } = {}) {
    super('DEVICE_ERROR', message, { vendorCode });
    this.name = 'OutcomeUnknownError';
    if ('cause' in options) this.cause = options.cause;
  }
}
