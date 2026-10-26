import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceReasonError } from '../src/device/index.js';
import { ANDROID_DEVICE, androidTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, world, worldFixture, type AndroidPreflight } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const screens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [16, 100, 216, 140] }]) };

function phone(t: Parameters<typeof worldFixture>[0], preflight: AndroidPreflight) {
  const target = androidTarget({ state: 'device', ...preflight });
  return worldFixture(t, world('android', screens), target.options, target.nativeReply);
}

const cases: [string, AndroidPreflight, string, string][] = [
  ['a phone below API 31 is DEVICE_UNSUPPORTED', { api: 30 }, 'DEVICE_UNSUPPORTED', 'Device PHONE123 runs API 30; the bridge needs Android 12 (API 31) or later'],
  ['a phone that has not finished booting is DEVICE_NOT_BOOTED', { booted: false }, 'DEVICE_NOT_BOOTED', 'Device PHONE123 hasn\'t finished booting'],
  ['an app that is not installed is APP_NOT_INSTALLED', { installed: ['other.app'] }, 'APP_NOT_INSTALLED', 'example.missing isn\'t installed on PHONE123'],
];
for (const [name, preflight, code, message] of cases) {
  test(`${name}, before any Appium session, and the phone is released`, async t => {
    const f = phone(t, preflight);
    await assert.rejects(f.driver.prepare({ app: { package: 'example.missing', activity: '.Main' } }, live()),
      (error: unknown) => error instanceof DeviceReasonError && error.code === code && error.message === message);
    assert.deepEqual(f.tools().filter(tool => tool === 'appium_session_management'), []);
    assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
  });
}

test('capture names no app, so it checks the API level and boot state only', async t => {
  const f = phone(t, { installed: [] });
  await f.driver.capture(live());
  await f.driver.close(live());
  const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!.owner;
  const reads = f.admission.readGeneration(owner).commands.map(command => command.operation).filter(operation => operation.startsWith('android-preflight'));
  assert.deepEqual(reads, ['android-preflight-api', 'android-preflight-boot']);
  const old = phone(t, { api: 29 });
  await assert.rejects(old.driver.capture(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_UNSUPPORTED');
});
