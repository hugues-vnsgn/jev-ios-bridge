import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GenerationView } from '../src/device/admission.js';
import { androidIdentitySchema, hostIdentitySchema } from '../src/appium/fence/schema.js';

test('process identities parse into distinct host and Android domains', () => {
  const android = androidIdentitySchema.parse({ pid: 12, startTime: '123' });
  const host = hostIdentitySchema.parse({ pid: 12, startTime: 'host-start' });
  // @ts-expect-error Host and Android PIDs belong to different identity domains.
  const mixed: typeof host.pid = android.pid;
  assert.deepEqual({ host: host.startTime, android: android.startTime, pid: mixed }, { host: 'host-start', android: '123', pid: 12 });
});
function closureTypes() {
  // @ts-expect-error An open recovery cannot already have an accepted closure.
  const impossible: GenerationView['recoveries'][number] = { id: 'one', process: { pid: 1, incarnation: 'x' }, closedAt: null, closure: 'accepted' };
  return impossible;
}
void closureTypes;
