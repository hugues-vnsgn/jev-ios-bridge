import { DeviceReasonError } from '../index.js';
import type { DeviceCommandKind, DeviceLease } from '../lease.js';

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

/**
 * Run one `adb` command or device agent request inside the lease's in-flight ledger: recorded before it
 * starts, `exited()` on a known outcome (a result, or any error but `OutcomeUnknownError`), `unknown()`
 * when its outcome was lost. The error, if any, is rethrown unchanged.
 */
export async function inLedger<T>(lease: Pick<DeviceLease, 'command'>, kind: DeviceCommandKind, issue: () => Promise<T>): Promise<T> {
  const issued = lease.command(kind);
  try {
    const result = await issue();
    issued.exited();
    return result;
  } catch (error) {
    if (error instanceof OutcomeUnknownError) issued.unknown();
    else issued.exited();
    throw error;
  }
}
