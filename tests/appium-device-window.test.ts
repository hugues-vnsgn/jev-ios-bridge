/**
 * An iOS run brings its simulator's window to the front before launch, as a recorded and nonfatal step: a window that
 * won't open is a prepare warning, never a refusal, and attach or observed roles never open one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeviceWindowOpener } from '../src/device/index.js';
import { IOS_DEVICE, authorized, iosTarget } from './fixtures/appium-wire/matrix.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const home = world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) });

test('an iOS run opens the simulator window once, before the app launches, as a recorded step', async t => {
  const order: string[] = [];
  const deviceWindow: DeviceWindowOpener = async udid => { order.push(`window ${udid}`); };
  const f = worldFixture(t, home, { ...iosTarget, deviceWindow }, command => { order.push(command.kind); return undefined; });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  assert.deepEqual(order.slice(0, 2), [`window ${UDID}`, 'ios-console']);
  assert.deepEqual(f.driver.prepareWarnings(), []);
  await f.driver.close(live());
  assert.equal(authorized(f.admission, 'run-1').window, 1);
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
});

test('a window that will not open is a prepare warning: the run goes on and the device is released', async t => {
  const deviceWindow: DeviceWindowOpener = async () => { throw new Error('Simulator.app is missing'); };
  const f = worldFixture(t, home, { ...iosTarget, deviceWindow });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  assert.deepEqual(f.driver.prepareWarnings(), ['Simulator window not opened: Simulator could not be opened on the run\'s device.']);
  assert.equal((await f.driver.observe(live())).elements.find(element => element.identifier === 'home')?.label, 'Home');
  await f.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
});
