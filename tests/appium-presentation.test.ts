import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDriverFactory } from '../src/device/factory.js';
import { DeviceReasonError, type DeviceWindowOpener } from '../src/device/index.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';
import { IOS_DEVICE, iosTarget } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const home = world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) });
const capability = (f: ReturnType<typeof worldFixture>) => (JSON.parse(String(f.calls().find(call => call.params?.arguments?.action === 'create')!
  .params!.arguments!.capabilities)) as Record<string, unknown>)['appium:isHeadless'];
const window: DeviceWindowOpener = async () => {};
const cases: [string, 'visible' | 'headless', DeviceWindowOpener | undefined, boolean][] = [
  ['a booted simulator with no UI client, run with --no-device-window', 'headless', undefined, true],
  ['a booted simulator with no UI client, run with the window step', 'headless', window, true],
  ['Simulator.app showing the device, run with --no-device-window', 'visible', undefined, false],
];
for (const [name, shown, deviceWindow, headless] of cases) {
  test(`${name}: isHeadless is ${String(headless)}, from the read and not the window flag`, async t => {
    const f = worldFixture(t, home, { ...iosTarget, presentation: async () => shown, ...(deviceWindow ? { deviceWindow } : {}) });
    await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
    assert.equal(capability(f), headless);
    await f.driver.close(live());
  });
}

test('the presentation is read after the window step and before the session', async t => {
  const order: string[] = [];
  const f = worldFixture(t, home, { ...iosTarget, deviceWindow: async () => { order.push('window'); },
    presentation: async () => { order.push(`read with ${String(f.tools().length)} tool calls`); return 'visible'; } });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  assert.deepEqual(order, ['window', 'read with 0 tool calls']);
  await f.driver.close(live());
});

test('a presentation that cannot be read refuses before any session with DEVICE_ERROR / PRESENTATION_UNKNOWN, and releases the simulator', async t => {
  const f = worldFixture(t, home, { ...iosTarget, presentation: async () => { throw new Error('pgrep is missing'); } });
  await assert.rejects(f.driver.prepare({ app: { bundleId: 'example.app' } }, live()), (error: unknown) => error instanceof DeviceReasonError
    && error.code === 'DEVICE_ERROR' && error.vendorCode === 'PRESENTATION_UNKNOWN' && error.vendorSource === 'bridge');
  assert.deepEqual(f.tools().filter(tool => tool === 'appium_session_management'), []);
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
});

test('a run with --no-device-window on a simulator Simulator.app shows asks for a visible session, so the stack quits nothing', async t => {
  const w = worldHost(t, { identityProbe: fakeSimulatorProbe(UDID), worlds: [home], presentation: async () => 'visible' });
  const script = parseScriptedScenario({ version: 1, app: { bundleId: 'example.app' }, values: {},
    steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });
  const driver = createDriverFactory({ host: w.host, projectDir: w.root, defaultUdid: UDID })(script, { runId: 'no-window' });
  await driver.prepare({ app: script.app }, live());
  try {
    const created = w.opened[0]!.creates()[0]!;
    assert.equal((JSON.parse(String(created.params!.arguments!.capabilities)) as Record<string, unknown>)['appium:isHeadless'], false);
  } finally { await driver.close(live()); }
});
