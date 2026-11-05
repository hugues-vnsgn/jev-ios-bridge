import assert from 'node:assert/strict';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { Admission, componentObservationSchema } from '../../src/device/admission.js';
import { bounded } from './admission-race-harness.js';

const [root, mode, rawComponents] = process.argv.slice(2);
assert.ok(root);
const gates = new Map(['start', 'release'].map(kind => {
  let open = () => {};
  const promise = new Promise<void>(resolve => { open = resolve; });
  return [kind, { promise, open }];
}));
process.on('message', raw => gates.get(z.enum(['start', 'release']).parse(raw))!.open());
const admission = Admission.forTesting({ root: join(root, 'admission'), backend: 'fake', initialize: false });
process.send?.({ kind: 'ready' });
await bounded('E10 owner start barrier', gates.get('start')!.promise);

assert.equal(mode, 'crash');
const components = z.array(componentObservationSchema).parse(JSON.parse(rawComponents!));
const acquired = admission.acquire({ category: 'android-emulator', device: '/fake/avds/Pixel.avd',
  attempt: { kind: 'legacy', id: 'killed-owner' }, digest: 'killed-owner', intent: {} });
assert.equal(acquired.kind, 'acquired');
if (acquired.kind !== 'acquired') throw new Error('E10 owner not admitted');
const claim = acquired.claim;
claim.registerComponent({ id: 'adb', kind: 'adb-command', serial: 'emulator-5554', args: ['-s', 'emulator-5554', 'shell', 'sleep', '11'] });
claim.registerComponent({ id: 'agent', kind: 'android-agent', serial: 'emulator-5554',
  classpath: '/data/local/tmp/jev-ios-bridge-agent.dex', className: 'com.mobilenext.mobilecli.DeviceServer' });
claim.registerComponent({ id: 'stream', kind: 'android-stream', serial: 'emulator-5554', args: ['-s', 'emulator-5554', 'logcat'] });
for (const [index, id] of ['adb', 'agent', 'stream'].entries()) claim.observeComponent(id, components[index]!);
await claim.bindDriver('fake').dispatch({ requestId: 'outstanding-adb', componentId: 'adb', operation: 'adb', payload: {} }, async () => {
  process.send?.({ kind: 'backend' });
  await bounded('E10 outstanding adb command', gates.get('release')!.promise, 30000);
});
process.disconnect();
