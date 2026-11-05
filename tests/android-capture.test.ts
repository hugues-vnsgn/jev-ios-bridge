import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { captureCommand, type CaptureContext, type CaptureDriver, type CaptureRequest, type CaptureSelection } from '../src/capture.js';
import type { Snapshot } from '../src/contracts/index.js';
import { createDeviceAgreement } from '../src/device/factory.js';
import { DeviceReasonError } from '../src/device/index.js';
import { REASON_CODES } from '../src/scripted/vocabulary.js';
import { FakeAdb } from './fixtures/android-device.js';
import { ANDROID_DEVICE, androidTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

/**
 * The `capture` command (release spec phase 6 item 1) over a fake capture driver: what it selects, prints and
 * reports, whatever the driver behind it. The Appium driver's own capture path is in appium-matrix-capture.test.ts.
 */

const signal = () => new AbortController().signal;
const screen: Snapshot = { deviceId: 'emulator-5554', capturedAt: 0, expiresAt: 60_000, sequence: 1, truncated: false,
  elements: [{ ref: 'e1', role: 'text', label: 'Home', identifier: 'home', frame: { x: 16, y: 100, width: 200, height: 40 }, state: { enabled: true, visible: true }, actions: [] }] };
const HOME_LINE = '{"role":"text","label":"Home","identifier":"home","state":{"enabled":true,"visible":true}}\n';

/** A capture driver that records each selection it was built for, and each close. */
function fakeDriver(parts: Partial<CaptureDriver> = {}) {
  const built: CaptureSelection[] = [];
  const closes: AbortSignal[] = [];
  const driver = (selection: CaptureSelection): CaptureDriver => {
    built.push(selection);
    return { capture: parts.capture ?? (async () => screen),
      close: async closeSignal => { closes.push(closeSignal); await parts.close?.(closeSignal); } };
  };
  return { built, closes, driver };
}

async function capture(request: CaptureRequest, context: Omit<CaptureContext, 'write' | 'signal'> & { signal?: AbortSignal }) {
  let stdout = '';
  let stderr = '';
  const code = await captureCommand(request, { signal: signal(), ...context, write: { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } } });
  return { code, stdout, stderr };
}

async function project(t: TestContext, profiles?: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'jev-android-capture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (profiles) {
    await mkdir(join(root, '.jev'));
    await writeFile(join(root, '.jev/profiles.json'), JSON.stringify(profiles));
  }
  return root;
}

/** A capture or close that runs until its signal ends it, as a stalled device read would. */
const stalled = (until: AbortSignal) => new Promise<never>((_, reject) => {
  if (until.aborted) reject(until.reason);
  else until.addEventListener('abort', () => reject(until.reason), { once: true });
});

test('capture selects a profile over the environment and checks a serial flag against the profile AVD live before device work', async t => {
  const projectDir = await project(t, { version: 1, defaultProfile: 'pixel', profiles: {
    pixel: { platform: 'android', deviceCategory: 'android-emulator', device: 'jev-actions-api31' } } });
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'jev-actions-api31' }, { serial: 'emulator-5556', avd: 'other-avd' });
  const fake = fakeDriver();
  const context = { projectDir, defaultDevice: 'Invalid_environment_AVD', driver: fake.driver, agreeDevices: createDeviceAgreement({ probe: adb.identityProbe }) };
  const conflict = await capture({ profile: 'pixel', serial: 'emulator-5556' }, context);
  assert.deepEqual([conflict.code, conflict.stdout, conflict.stderr], [3, '', 'PROFILE_CONFLICT: Capture device flags conflict with the selected profile.\n']);
  assert.equal(fake.built.length, 0, 'no driver, so no device work');
  assert.deepEqual(await capture({ profile: 'pixel', serial: 'emulator-5554' }, context), { code: 0, stdout: HOME_LINE, stderr: '' });
  assert.deepEqual(await capture({}, context), { code: 0, stdout: HOME_LINE, stderr: '' });
  assert.deepEqual(fake.built.map(selection => [selection.name, selection.category, selection.profile?.name]),
    [['jev-actions-api31', 'android-emulator', 'pixel'], ['jev-actions-api31', 'android-emulator', 'pixel']], 'the profile\'s device, not the environment\'s');
  assert.equal(fake.closes.length, 2);
});

test('capture ignores an iOS default profile, but an explicit iOS profile refuses before device work', async t => {
  const projectDir = await project(t, { version: 1, defaultProfile: 'ios', profiles: {
    ios: { platform: 'ios', deviceCategory: 'ios-simulator', device: 'ABCDEF00-0000-4000-8000-000000000001' } } });
  const fake = fakeDriver();
  const context = { projectDir, defaultDevice: 'jev-actions-api31', driver: fake.driver };
  assert.deepEqual(await capture({ profile: 'ios' }, context), { code: 3, stdout: '', stderr: 'PROFILE_CONFLICT: Capture requires an Android profile; the selected profile is iOS.\n' });
  assert.equal(fake.built.length, 0);
  assert.deepEqual(await capture({}, context), { code: 0, stdout: HOME_LINE, stderr: '' });
  assert.deepEqual(fake.built.map(selection => [selection.name, selection.profile, selection.category]), [['jev-actions-api31', undefined, undefined]]);
});

test('capture applies the profile operation budget to a stalled screen read, and still closes the driver', async t => {
  const deadlines = new Map<number, AbortController>();
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    const controller = new AbortController();
    deadlines.set(ms, controller);
    return controller.signal;
  });
  const projectDir = await project(t, { version: 1, defaultProfile: 'pixel', profiles: {
    pixel: { platform: 'android', deviceCategory: 'android-emulator', device: 'jev-actions-api31', budgets: { operationMs: 1000, cleanupMs: 2000 } } } });
  let read: AbortSignal | undefined;
  const fake = fakeDriver({ capture: async readSignal => {
    read = readSignal;
    deadlines.get(1000)!.abort(new DOMException('Operation timed out', 'TimeoutError'));
    return stalled(readSignal);
  } });
  const printed = await capture({}, { projectDir, driver: fake.driver });
  assert.deepEqual([printed.code, printed.stdout, read?.aborted], [3, '', true]);
  assert.match(printed.stderr, /^[A-Z_]+: .+\n$/);
  assert.doesNotMatch(printed.stderr, /CLEANUP_FAILED/);
  assert.deepEqual(fake.closes, [deadlines.get(2000)!.signal], 'close gets the profile\'s cleanup budget');
});

test('capture cleanup uses the profile cleanup budget, and a cleanup that stalls past it is CLEANUP_FAILED with no screen', async t => {
  const deadlines = new Map<number, AbortController>();
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    const controller = new AbortController();
    deadlines.set(ms, controller);
    return controller.signal;
  });
  const projectDir = await project(t, { version: 1, profiles: {
    pixel: { platform: 'android', deviceCategory: 'android-emulator', device: 'jev-actions-api31', budgets: { operationMs: 2000, cleanupMs: 1000 } } } });
  const fake = fakeDriver({ close: async closeSignal => {
    assert.equal(closeSignal, deadlines.get(1000)!.signal);
    deadlines.get(1000)!.abort(new DOMException('Cleanup timed out', 'TimeoutError'));
    await stalled(closeSignal);
  } });
  const printed = await capture({ profile: 'pixel' }, { projectDir, driver: fake.driver });
  assert.deepEqual([printed.code, printed.stdout], [3, '']);
  assert.match(printed.stderr, /^CLEANUP_FAILED: .+\n$/);
});

test('capture refusals exit 3 with the reason code on stderr, print nothing on stdout, and build no driver when there is no device to name', async t => {
  const projectDir = await project(t);
  const cases: [string, CaptureRequest, string | undefined, string][] = [
    ['no device', {}, undefined, 'NO_DEVICE'],
    ['an empty JEV_ANDROID_DEVICE', {}, '', 'NO_DEVICE'],
    ['a bad --serial', { serial: 'has a space' }, undefined, 'INVALID_DEVICE'],
    ['an empty --serial', { serial: '' }, undefined, 'INVALID_DEVICE'],
    ['a bad --avd', { avd: 'emulator:5554' }, undefined, 'INVALID_DEVICE'],
    ['a bad --avd beside a good --serial', { serial: 'emulator-5554', avd: 'has a space' }, undefined, 'INVALID_DEVICE'],
    ['a bad JEV_ANDROID_DEVICE', {}, 'has a space', 'INVALID_DEVICE'],
  ];
  for (const [name, request, defaultDevice, code] of cases) {
    const fake = fakeDriver();
    const printed = await capture(request, { projectDir, defaultDevice, driver: fake.driver });
    assert.equal(printed.code, 3, name);
    assert.match(printed.stderr, new RegExp(`^${code}: \\S`), name);
    assert.equal(printed.stdout, '', name);
    assert.equal(fake.built.length, 0, name);
  }
});

test('a driver refusal exits 3 with its code and the bridge\'s own message, as ANDROID_TOOLS_UNAVAILABLE does', async t => {
  const projectDir = await project(t);
  const fake = fakeDriver({ capture: async () => { throw new DeviceReasonError('ANDROID_TOOLS_UNAVAILABLE', 'adb could not be found'); } });
  assert.deepEqual(await capture({ avd: 'jev-actions-api31' }, { projectDir, driver: fake.driver }),
    { code: 3, stdout: '', stderr: 'ANDROID_TOOLS_UNAVAILABLE: adb could not be found\n' });
  assert.equal(fake.closes.length, 1);
});

test('an unexpected failure still closes the driver, and never prints the error\'s own message', async t => {
  const projectDir = await project(t);
  const fake = fakeDriver({ capture: async () => { throw new Error('Screen says: Hello secret'); } });
  const printed = await capture({ avd: 'jev-actions-api31' }, { projectDir, driver: fake.driver });
  assert.deepEqual([printed.code, printed.stdout], [3, '']);
  assert.match(printed.stderr, /^EXECUTION_ERROR: \S/);
  assert.doesNotMatch(printed.stderr, /secret/);
  assert.equal(fake.closes.length, 1);
});

test('--jev on a screen with nothing to show Jev exits 3 with EMPTY_SCREEN, after cleaning up', async t => {
  const projectDir = await project(t);
  const fake = fakeDriver({ capture: async () => ({ ...screen, elements: [] }) });
  const printed = await capture({ avd: 'jev-actions-api31', jev: true }, { projectDir, driver: fake.driver });
  assert.deepEqual([printed.code, printed.stdout, fake.closes.length], [3, '', 1]);
  assert.match(printed.stderr, /^EMPTY_SCREEN: \S/);
});

test('a cleanup that fails exits 3 with CLEANUP_FAILED and prints no screen', async t => {
  const projectDir = await project(t);
  const fake = fakeDriver({ close: async () => { throw new Error('adb died'); } });
  const printed = await capture({ avd: 'jev-actions-api31' }, { projectDir, driver: fake.driver });
  assert.deepEqual([printed.code, printed.stdout], [3, '']);
  assert.match(printed.stderr, /^CLEANUP_FAILED: \S/);
});

test('a capture that fails and a cleanup that fails report both, in order, with the cleanup\'s own message', async t => {
  const projectDir = await project(t);
  const fake = fakeDriver({ capture: async () => { throw new DeviceReasonError('DEVICE_ERROR', 'The page source could not be read'); },
    close: async () => { throw new DeviceReasonError('CLEANUP_FAILED', 'The device stays quarantined'); } });
  const printed = await capture({ avd: 'jev-actions-api31' }, { projectDir, driver: fake.driver });
  assert.deepEqual([printed.code, printed.stdout], [3, '']);
  assert.deepEqual(printed.stderr.split('\n'), ['DEVICE_ERROR: The page source could not be read',
    `CLEANUP_FAILED: ${REASON_CODES.CLEANUP_FAILED} The device stays quarantined.`, '']);
});

test('an interrupt mid-capture still closes the driver and prints nothing', async t => {
  const projectDir = await project(t);
  const interrupt = new AbortController();
  const fake = fakeDriver({ capture: async readSignal => { interrupt.abort(new Error('SIGINT')); return stalled(readSignal); } });
  assert.deepEqual(await capture({ avd: 'jev-actions-api31' }, { projectDir, driver: fake.driver, signal: interrupt.signal }), { code: 3, stdout: '', stderr: '' });
  assert.equal(fake.closes.length, 1);
});

test('an interrupt once the screen was read prints nothing, even after a clean close', async t => {
  const projectDir = await project(t);
  const interrupt = new AbortController();
  const fake = fakeDriver({ close: async () => { interrupt.abort(new Error('SIGINT')); } });
  assert.deepEqual(await capture({ avd: 'jev-actions-api31' }, { projectDir, driver: fake.driver, signal: interrupt.signal }), { code: 3, stdout: '', stderr: '' });
});

test('the Appium capture wakes a screen that is only off, and refuses a locked one before any session', async t => {
  const policy = (showing: boolean, awake: boolean) =>
    `WINDOW MANAGER POLICY STATE\n    KeyguardServiceDelegate\n      showing=${String(showing)}\n      interactiveState=INTERACTIVE_STATE_${awake ? 'AWAKE' : 'SLEEP'}\n`;
  const phone = (locked: boolean) => {
    const target = androidTarget();
    let awake = false;
    return worldFixture(t, world('android', { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [16, 100, 216, 140] }]) }), target.options,
      command => command.kind === 'android-keyguard' ? policy(locked, awake) : command.kind === 'android-wake' ? (awake = true, '') : target.nativeReply(command));
  };
  const asleep = phone(false);
  assert.deepEqual((await asleep.driver.capture(signal())).elements.map(element => element.label), ['Home']);
  await asleep.driver.close(signal());
  assert.deepEqual(asleep.native.calls.map(call => call.command.kind), ['android-keyguard', 'android-wake', 'android-keyguard']);
  const locked = phone(true);
  await assert.rejects(locked.driver.capture(signal()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_LOCKED');
  assert.deepEqual([locked.tools(), locked.native.calls.map(call => call.command.kind)], [[], ['android-keyguard']]);
  assert.equal(locked.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});
