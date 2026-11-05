import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DeviceDriver, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { DeviceReasonError, deviceWindowOpener, simulatorWindowCommand } from '../src/device/index.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { SCRIPTED_JEV_MODEL } from '../src/scripted/jev.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { IOS_DEVICE, authorized, iosTarget } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const shown = world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) });
const app = { app: { bundleId: 'example.app' } };

function listedAs(state: string) {
  const listing = fakeSimulatorProbe(UDID);
  return { ...listing, simulatorSet: async (signal: AbortSignal) => {
    const inventory = await listing.simulatorSet(signal);
    return { ...inventory, reply: inventory.reply.replaceAll('Booted', state) };
  } };
}

const notBooted = (state: string) => (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_NOT_BOOTED' &&
  error.message.includes(UDID) && error.message.includes(state);

test('with the window on, a shut-down simulator is refused as DEVICE_NOT_BOOTED before the window opens, the app launches or the device is admitted', async t => {
  let opened = 0;
  const f = worldFixture(t, shown, { ...iosTarget, identityProbe: listedAs('Shutdown'), deviceWindow: async () => { opened++; } });
  await assert.rejects(f.driver.prepare(app, live()), notBooted('Shutdown'));
  assert.equal(opened, 0, 'opening Simulator on a shut-down device would boot it');
  assert.deepEqual([f.native.calls.length, f.tools(), f.admission.inspect(IOS_DEVICE)], [0, [], undefined]);
  const next = f.open(shown, { identityProbe: fakeSimulatorProbe(UDID) });
  await next.driver.prepare(app, live());
  await next.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)?.state, 'available');
});

test('a simulator still booting is DEVICE_NOT_BOOTED too', async t => {
  const f = worldFixture(t, shown, { ...iosTarget, identityProbe: listedAs('Booting'), deviceWindow: async () => assert.fail('No window on a booting device') });
  await assert.rejects(f.driver.prepare(app, live()), notBooted('Booting'));
  assert.deepEqual([f.native.calls.length, f.tools()], [0, []]);
});

test('with the window off, a run opens no window and records no warning', async t => {
  const f = worldFixture(t, shown, iosTarget);
  await f.driver.prepare(app, live());
  assert.deepEqual(f.driver.prepareWarnings(), []);
  await f.driver.close(live());
  assert.equal(authorized(f.admission, 'run-1').window, undefined);
});

test('the window command opens Simulator on the run\'s device', () => {
  assert.deepEqual(simulatorWindowCommand(UDID), ['open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', UDID]]);
});

test('the window is on by default, off with --no-device-window or JEV_DEVICE_WINDOW=off', () => {
  assert.equal(typeof deviceWindowOpener(false, {}), 'function');
  assert.equal(typeof deviceWindowOpener(false, { JEV_DEVICE_WINDOW: 'on' }), 'function');
  assert.equal(deviceWindowOpener(true, {}), undefined);
  assert.equal(deviceWindowOpener(false, { JEV_DEVICE_WINDOW: 'off' }), undefined);
});

function memoryLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'window-1', sequence: events.length + 1,
      at: new Date().toISOString(), type, data }); },
    async read() { return events; } };
}

const script: ScriptedScenario = { version: 1, app: { bundleId: 'example.app' }, values: {}, steps: [
  { id: 'home', kind: 'checkpoint', guard: { present: [{ label: 'Home' }] }, assertions: [{ id: 'home', claim: 'Home is shown' }] },
] };
const home: Snapshot = { deviceId: 'sim', capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: 1, truncated: false,
  elements: [{ ref: 'h', role: 'text', label: 'Home', actions: [], frame: { x: 0, y: 0, width: 100, height: 30 },
    state: { enabled: true, visible: true } }] };
const judge = { async judge() { return { probabilities: { home: 0.97 }, inputTokens: 1, latencyMs: 1, model: SCRIPTED_JEV_MODEL }; } };

test('a run records prepare warnings on its prepared event, and nothing when there are none', async () => {
  const driver = (warnings?: string[]): DeviceDriver => ({ async prepare() {}, async observe() { return home; },
    async act() {}, async close() {}, ...(warnings ? { prepareWarnings: () => warnings } : {}) });
  const preparedOf = async (subject: DeviceDriver) => {
    const log = memoryLog();
    const report = await runScriptedScenario({ runId: 'window-1', scenario: script, driver: subject, judge, log });
    assert.equal(report.verdict, 'passed', report.reason);
    return log.events.find(event => event.type === 'prepared')!.data;
  };
  assert.deepEqual((await preparedOf(driver(['Simulator window not opened: could not open Simulator']))).warnings,
    ['Simulator window not opened: could not open Simulator']);
  assert.deepEqual(Object.keys(await preparedOf(driver([]))), ['prepareDurationMs']);
  assert.deepEqual(Object.keys(await preparedOf(driver())), ['prepareDurationMs']);
});

test('a run on a shut-down simulator ends inconclusive with DEVICE_NOT_BOOTED, not DEVICE_ERROR', async t => {
  const f = worldFixture(t, shown, { ...iosTarget, identityProbe: listedAs('Shutdown') });
  const log = memoryLog();
  const report = await runScriptedScenario({ runId: 'window-1', scenario: script, driver: f.driver, judge, log });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'DEVICE_NOT_BOOTED');
  assert.equal(log.events.find(event => event.type === 'error')?.data.code, 'DEVICE_NOT_BOOTED');
});

test('the CLI takes --no-device-window on run only, and its help names it', { timeout: 20_000 }, async () => {
  const { execFile } = await import('node:child_process');
  const cli = join(process.cwd(), 'src/cli.ts');
  const execute = (args: string[]) => new Promise<{ code: number; stdout: string; stderr: string }>(done => {
    execFile(process.execPath, ['--import', import.meta.resolve('tsx'), cli, ...args],
      { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } },
      (error, stdout, stderr) => done({ code: error ? Number(error.code) : 0, stdout, stderr }));
  });
  const help = await execute(['--help']);
  assert.match(help.stdout, /--no-device-window/);
  assert.match(help.stdout, /JEV_DEVICE_WINDOW=off/);
  const report = await execute(['report', 'some-run', '--no-device-window']);
  assert.equal(report.code, 3);
  assert.match(report.stderr, /--no-device-window applies only to run/);
});
