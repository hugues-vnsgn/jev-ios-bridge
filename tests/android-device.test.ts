import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceReasonError, selectAndroidDeviceName } from '../src/device/index.js';

test('a script-named serial is chosen over JEV_ANDROID_DEVICE', () => {
  const chosen = selectAndroidDeviceName({ serial: 'emulator-5554' }, 'jev-actions-api31');
  assert.equal(chosen, 'emulator-5554');
});

test('a script-named AVD is chosen over JEV_ANDROID_DEVICE', () => {
  const chosen = selectAndroidDeviceName({ avd: 'jev-actions-api31' }, 'emulator-5554');
  assert.equal(chosen, 'jev-actions-api31');
});

test('falls back to JEV_ANDROID_DEVICE when the script names no device', () => {
  const chosen = selectAndroidDeviceName(undefined, 'jev-actions-api31');
  assert.equal(chosen, 'jev-actions-api31');
});

test('an empty JEV_ANDROID_DEVICE counts as unset', () => {
  assert.throws(() => selectAndroidDeviceName(undefined, ''), (error: unknown) =>
    error instanceof DeviceReasonError && error.code === 'NO_DEVICE');
});

test('no device at all fails with NO_DEVICE', () => {
  assert.throws(() => selectAndroidDeviceName(undefined, undefined), (error: unknown) =>
    error instanceof DeviceReasonError && error.code === 'NO_DEVICE');
});

test('a malformed JEV_ANDROID_DEVICE fails with INVALID_DEVICE, naming the Android patterns', () => {
  assert.throws(() => selectAndroidDeviceName(undefined, 'has a space'), (error: unknown) =>
    error instanceof DeviceReasonError && error.code === 'INVALID_DEVICE' &&
    /serial/.test(error.message) && /AVD/.test(error.message));
});
