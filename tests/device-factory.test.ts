import { FakeAdb, fakeSimulatorProbe } from './fixtures/android-device.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { createDeviceAgreement, createDriverFactory } from '../src/device/factory.js';
import { DeviceReasonError } from '../src/device/index.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import { agreeProfileDevice, profileScenario } from '../src/profiles.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';
import { androidScreen, world } from './fixtures/appium-wire/world.js';

const iosScript: ScriptedScenario = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [] };
const live = () => AbortSignal.timeout(20_000);
const android = world('android', { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [0, 0, 100, 40] }]) });

const pixelProfile = { profile: { platform: 'android', deviceCategory: 'android-emulator', device: 'Pixel_API_35' },
  binding: { name: 'pixel', digest: 'a'.repeat(64) } } as const;

test('profile conflicts compare same-kind names exactly and leave an AVD name against a serial to live agreement', () => {
  const scenario: ScriptedScenario = { version: 1, platform: 'android', app: { package: 'com.example.app' },
    device: { avd: 'Pixel_API_35' }, values: {}, steps: [] };
  assert.deepEqual(profileScenario(scenario, pixelProfile).device, { avd: 'Pixel_API_35' });
  for (const device of [{ avd: 'Different_AVD' }, { avd: 'pixel_api_35' }]) {
    assert.throws(() => profileScenario({ ...scenario, device }, pixelProfile), { code: 'PROFILE_CONFLICT' });
  }
  assert.deepEqual(profileScenario({ ...scenario, device: { serial: 'emulator-5554' } }, pixelProfile).device, { avd: 'Pixel_API_35' });
});

test('an AVD name against a serial agrees only when both resolve live to one emulator', async () => {
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'Pixel_API_35' }, { serial: 'emulator-5556', avd: 'Other_AVD' });
  const agree = createDeviceAgreement({ probe: adb.identityProbe });
  const signal = new AbortController().signal;
  const check = (own: { serial?: string; avd?: string }) => agreeProfileDevice(own, pixelProfile, agree, signal);
  await check({ avd: 'Pixel_API_35' });
  assert.deepEqual(adb.probeCalls, []);
  await check({ serial: 'emulator-5554' });
  await assert.rejects(check({ serial: 'emulator-5556' }),
    { code: 'PROFILE_CONFLICT', message: 'Scenario device conflicts with the selected profile.' });
  await assert.rejects(check({ serial: 'emulator-5558' }), { code: 'PROFILE_CONFLICT',
    message: 'Scenario device conflicts with the selected profile. The device could not be resolved: DEVICE_NOT_FOUND.' });
  await assert.rejects(agreeProfileDevice({ serial: 'emulator-5554' }, pixelProfile, undefined, signal), { code: 'PROFILE_CONFLICT' });
  await assert.rejects(agreeProfileDevice({ serial: 'emulator-5554' }, pixelProfile, async () => { throw new Error('tools'); }, signal),
    { message: 'tools' });
  assert.deepEqual(adb.calls, []);
});

test('the factory passes a run\'s profile device category to the Android driver, so an emulator is not found as a phone', async t => {
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'Pixel_API_35' });
  const w = worldHost(t, { identityProbe: adb.identityProbe, adb: adb.run, worlds: [android] });
  const createDriver = createDriverFactory({ host: w.host, projectDir: w.root });
  const script: ScriptedScenario = { version: 1, platform: 'android', app: { package: 'com.example.app' }, device: { serial: 'emulator-5554' }, values: {}, steps: [] };
  const driver = createDriver(script, { runId: 'phone-profile', deviceCategory: 'android-phone' });
  try {
    await assert.rejects(driver.prepare({ app: { package: 'com.example.app' } }, live()),
      (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_NOT_FOUND');
  } finally { await driver.close(live()); }
  assert.deepEqual([adb.calls, w.opened[0]?.tools()], [[], []]);
});

test('an iOS driver from the factory carries the pinned tap alias rule, and each scenario gets its own driver', async t => {
  const w = worldHost(t, { identityProbe: fakeSimulatorProbe(UDID), worlds: [android] });
  const createDriver = createDriverFactory({ host: w.host, projectDir: w.root, defaultUdid: UDID });
  assert.equal(createDriver(iosScript).tapAliasRule, 'same-frame-buttons-v1');
  assert.notEqual(createDriver(iosScript), createDriver(iosScript));
  assert.equal(w.opened.length, 0, 'building a driver opens nothing');
});

test('the Android driver gets the script\'s device, else JEV_ANDROID_DEVICE, from the factory', async t => {
  const adbCalls: string[] = [];
  const probeNames: (string | undefined)[] = [];
  const adb: AdbRunner = async args => { adbCalls.push(args.join(' ')); return { stdout: '', stderr: '', exitCode: 0 }; };
  const w = worldHost(t, { adb, worlds: [android],
    identityProbe: { android: async (_signal, name) => { probeNames.push(name); return []; },
      simulatorApp: async () => assert.fail('Android uses no simulator app read'),
      simulatorSet: async () => assert.fail('Android uses no simulator inventory') } });
  const createDriver = createDriverFactory({ host: w.host, projectDir: w.root, defaultDevice: 'Default_AVD' });
  const script = (device?: { avd: string }): ScriptedScenario =>
    ({ version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' }, ...(device ? { device } : {}), values: {}, steps: [] });
  for (const [device, named] of [[{ avd: 'Script_AVD' }, 'Script_AVD'], [undefined, 'Default_AVD']] as const) {
    const driver = createDriver(script(device));
    try {
      await assert.rejects(driver.prepare({ app: { package: 'com.hugues.test_cmp' } }, live()),
        (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_NOT_FOUND' && probeNames.at(-1) === named);
    } finally { await driver.close(live()); }
  }
  assert.deepEqual(adbCalls, []);
  assert.deepEqual(probeNames, ['Script_AVD', 'Default_AVD']);
});
