import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppiumDriver, RawScreenPair } from '../src/appium/driver.js';
import { identityProbe } from '../src/device/android/probe.js';
import { DeviceReasonError } from '../src/device/index.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, SERIAL, androidTarget, iosTarget } from './fixtures/appium-wire/matrix.js';
import { ONE_PIXEL_PNG, androidScreen, iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const iosHome = iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 120, 200, 40] }]);
const androidHome = androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] }]);
const pairOf = (driver: AppiumDriver, signal = live()): Promise<RawScreenPair> => driver.capturePair(signal);

test('a raw capture pair on a simulator is the page source and screenshot bytes of one call pair, with no launch and nothing left behind', async t => {
  const f = worldFixture(t, world('ios', { home: iosHome }), iosTarget);
  const pair = await pairOf(f.driver);
  await f.driver.close(live());
  assert.equal(pair.xml, iosHome, 'the page source untouched');
  assert.equal(pair.png.toString('base64'), ONE_PIXEL_PNG, 'the screenshot untouched');
  assert.equal(pair.sessionId, 'ios-session');
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_session_management']);
  assert.deepEqual(f.native.calls.map(call => call.command.kind), [], 'no simctl launch, terminate or install');
  assert.deepEqual(f.fence.wda, [], 'the session\'s runner is stopped');
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
});

test('a raw capture pair on a phone is read under admission with only the read-only probes, and releases the phone', async t => {
  const target = androidTarget();
  const f = worldFixture(t, world('android', { home: androidHome }), target.options, target.nativeReply);
  const pair = await pairOf(f.driver);
  await f.driver.close(live());
  assert.equal(pair.xml, androidHome);
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_session_management']);
  assert.ok(f.native.calls.every(call => ['android-keyguard', 'android-wake'].includes(call.command.kind)), 'no launch, stop or install');
  assert.equal(f.admission.inspect({ ...ANDROID_DEVICE, value: SERIAL })!.state, 'available');
});

test('a raw capture pair is refused on a simulator that is not booted, before any session', async t => {
  const shutdown = identityProbe({ adb: '/fake/adb', environment: {}, simulatorApp: async () => ({ kind: 'missing', reply: '' }),
    simulator: async () => ({ deviceSet: '/fake/CoreSimulator/Devices',
      reply: JSON.stringify({ devices: { 'fake-runtime': [{ udid: UDID, name: UDID, state: 'Shutdown', isAvailable: true }] } }) }),
    spawn: () => { throw new Error('no Android probe'); } });
  const f = worldFixture(t, world('ios', { home: iosHome }), { ...iosTarget, identityProbe: shutdown });
  await assert.rejects(pairOf(f.driver), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_NOT_BOOTED');
  assert.deepEqual(f.calls(), []);
});

test('the Android-only capture still refuses a simulator', async t => {
  const f = worldFixture(t, world('ios', { home: iosHome }), iosTarget);
  await assert.rejects(f.driver.capture(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'UNSUPPORTED_ACTION');
  assert.deepEqual(f.calls(), []);
});
