/**
 * Foreign automation that appears while a run holds the device: the close checks ownership before any stop, so it
 * stops nothing (neither the foreign automation nor its own) and keeps the device quarantined.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceReasonError } from '../src/device/index.js';
import { ANDROID_DEVICE, IOS_DEVICE, SERIAL, androidTarget, iosTarget } from './fixtures/appium-wire/matrix.js';
import { UDID, WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { androidScreen, iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const busy = (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY';
const writes = new Set(['wda-stop', 'host-signal', 'host-signal-group', 'android-stop', 'forward-remove', 'settings-write']);

test('a foreign WDA runner that appears before close: DEVICE_BUSY, no runner is stopped, and the simulator stays quarantined', async t => {
  const f = worldFixture(t, world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) }), iosTarget);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const foreign = { udid: UDID, bundleId: 'com.other.WebDriverAgentRunner.xctrunner', pid: 999 };
  f.fence.wda.push(foreign);
  await assert.rejects(f.driver.close(live()), busy);
  assert.deepEqual(f.fence.effects.filter(effect => writes.has(effect.kind)), [], 'nothing is stopped, the bridge\'s own runner included');
  assert.deepEqual(f.fence.wda, [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 7001 }, foreign]);
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'quarantined');
});

test('a foreign automation forward that appears before close: DEVICE_BUSY, nothing is removed or stopped, and the phone stays quarantined', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [16, 100, 216, 140] }]) }),
    phone.options, command => command.kind === 'android-foreground' ? 'topResumedActivity=ActivityRecord{abc u0 example.app/.Main t1}\n' : phone.nativeReply(command));
  await f.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live());
  const foreign = { serial: SERIAL, local: 'tcp:18999', remote: 'tcp:6790' };
  f.fence.forwards.push(foreign);
  await assert.rejects(f.driver.close(live()), busy);
  assert.deepEqual(f.fence.effects.filter(effect => writes.has(effect.kind)), []);
  assert.deepEqual(f.fence.forwards.map(row => row.local), ['tcp:18200', 'tcp:18999'], 'both forwards stay');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'quarantined');
});
