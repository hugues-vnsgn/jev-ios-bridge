import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppiumTarget } from '../src/appium/driver.js';
import { DeviceReasonError } from '../src/device/index.js';
import { IOS_DEVICE, iosTarget } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const home = world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) });
const refused = (code: string, vendorCode?: string) => (error: unknown) => error instanceof DeviceReasonError && error.code === code
  && error.vendorCode === vendorCode && error.vendorSource === (vendorCode === undefined ? undefined : 'bridge');

const cases: [string, AppiumTarget, string, string | undefined][] = [
  ['a simulator the probe does not list is DEVICE_NOT_FOUND', { ...iosTarget.target, device: 'Missing Simulator' }, 'DEVICE_NOT_FOUND', undefined],
  ['a simulator named in another device set is DEVICE_IDENTITY_UNAVAILABLE / NONDEFAULT_DEVICE_SET', { ...iosTarget.target, deviceSet: '/private/sets/other' },
    'DEVICE_IDENTITY_UNAVAILABLE', 'NONDEFAULT_DEVICE_SET'],
];
for (const [name, target, code, vendorCode] of cases) {
  test(`${name}, before admission or any session`, async t => {
    const f = worldFixture(t, home, { ...iosTarget, target });
    await assert.rejects(f.driver.prepare({ app: { bundleId: 'example.app' } }, live()), refused(code, vendorCode));
    assert.deepEqual([f.tools(), f.admission.inspect(IOS_DEVICE)], [[], undefined]);
  });
}
