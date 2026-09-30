import assert from 'node:assert/strict';
import { mobilecliProgramPath } from '../../src/device/android/agent-supply.js';
import { DeviceReasonError } from '../../src/device/index.js';

/** The refusal `promise` rejects with: an `ANDROID_TOOLS_UNAVAILABLE` `DeviceReasonError`. */
export async function refusal(promise: Promise<unknown>): Promise<DeviceReasonError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof DeviceReasonError, `expected a DeviceReasonError, got ${String(error)}`);
    assert.equal(error.code, 'ANDROID_TOOLS_UNAVAILABLE');
    return error;
  }
  assert.fail('expected ANDROID_TOOLS_UNAVAILABLE');
}

/** Whether the Mac mobilecli program is installed here, for the tests that read the real one. */
export const installed = (() => {
  try {
    return Boolean(mobilecliProgramPath());
  } catch {
    return false;
  }
})();
