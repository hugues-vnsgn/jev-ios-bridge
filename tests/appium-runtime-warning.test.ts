import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hostVersions, productionAppiumHost, type AppiumHost } from '../src/appium/composition.js';
import { FrozenStack } from '../src/appium/stack.js';
import { Admission } from '../src/device/admission.js';
import { createDriverFactory } from '../src/device/factory.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';
import { iosScreen, world } from './fixtures/appium-wire/world.js';
import { stackRelease } from './fixtures/stack-release.js';

const OFF_RANGE = ['Unsupported iOS 26.4; qualified version is 26.5.', 'Unsupported Xcode 26.3; qualified version is 27.0.'];

test('the production host checks the stack against the selected simulator\'s iOS runtime and the active Xcode', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-host-store-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = Admission.forTesting({ root, backend: 'fake', durability: 'fast' });
  const asked: unknown[] = [];
  const host = productionAppiumHost({ environment: { PATH: '/nonexistent' }, stack: FrozenStack.forTesting(release), openAdmission: () => store,
    readVersions: async device => { asked.push(device); return { iosVersion: '26.4', xcodeVersion: '26.3' }; } });
  assert.deepEqual((await host({ target: { platform: 'ios', device: UDID, deviceSet: '/sets/private' } })).stack.warnings, OFF_RANGE);
  assert.deepEqual(asked, [{ device: UDID, deviceSet: '/sets/private' }]);
});

test('the stack\'s unsupported iOS and Xcode warnings reach the run\'s prepare warnings', async t => {
  const w = worldHost(t, { identityProbe: fakeSimulatorProbe(UDID),
    worlds: [world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) })] });
  const offRange: AppiumHost = async request => {
    const parts = await w.host(request);
    return { ...parts, stack: { ...parts.stack, warnings: OFF_RANGE } };
  };
  const script = parseScriptedScenario({ version: 1, app: { bundleId: 'example.app' }, values: {},
    steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });
  const driver = createDriverFactory({ host: offRange, projectDir: w.root, defaultUdid: UDID })(script, { runId: 'off-range' });
  try {
    await driver.prepare({ app: script.app }, AbortSignal.timeout(20_000));
    assert.deepEqual(driver.prepareWarnings?.(), OFF_RANGE);
  } finally { await driver.close(AbortSignal.timeout(20_000)); }
});

test('the version reader takes iOS from the device\'s runtime and Xcode from the active developer folder, and leaves an unreadable one unnamed', async () => {
  const replies: Record<string, { code: number; stdout: string }> = {
    '/usr/bin/xcode-select -p': { code: 0, stdout: '/Applications/Xcode-beta.app/Contents/Developer\n' },
    [`/usr/libexec/PlistBuddy -c print runtime /sets/private/${UDID}/device.plist`]: { code: 0, stdout: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4\n' },
    '/usr/libexec/PlistBuddy -c print CFBundleShortVersionString /Applications/Xcode-beta.app/Contents/Info.plist': { code: 0, stdout: '26.3\n' },
  };
  const read = hostVersions(async (file, args) => replies[[file, ...args].join(' ')] ?? { code: 1, stdout: '' });
  const signal = AbortSignal.timeout(1000);
  assert.deepEqual(await read({ device: UDID, deviceSet: '/sets/private' }, signal), { iosVersion: '26.4', xcodeVersion: '26.3' });
  assert.deepEqual(await read({ device: UDID, deviceSet: '/sets/other' }, signal), { xcodeVersion: '26.3' });
  assert.deepEqual(await hostVersions(async () => { throw new Error('no PlistBuddy'); })({ device: UDID, deviceSet: '/sets/private' }, signal), {});
});
