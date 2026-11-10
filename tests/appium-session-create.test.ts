import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RunEvent } from '../src/contracts/index.js';
import { SESSION_CREATE_TIMEOUT_MS, createSessionProfile } from '../src/appium/session.js';
import { DeviceReasonError } from '../src/device/index.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { driverStack, UDID } from './fixtures/appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, androidTarget, iosTarget, passingJudge } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, world, worldFixture, type WorldRule } from './fixtures/appium-wire/world.js';
import { withRunLog } from './fixtures/run-log.js';

const live = () => AbortSignal.timeout(30_000);
const iosScreens = { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) };
const androidScreens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [0, 0, 320, 80] }]) };
const iosApp = { app: { bundleId: 'example.app' } };
const androidApp = { app: { package: 'example.app', activity: '.Main' } };
const lostCreate: WorldRule[] = [{ tool: 'appium_session_management', match: { action: 'create' }, fault: { kind: 'lost' } }];
const iosScript = { version: 1, app: { bundleId: 'example.app' }, device: { udid: UDID }, values: {},
  steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] };
const errors = (events: RunEvent[]) => events.filter(event => event.type === 'error').map(event => [event.data.phase, event.data.code, event.data.vendorCode ?? null]);
const unsettled = (f: ReturnType<typeof worldFixture>) => {
  const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!.owner;
  return f.admission.readGeneration(owner).commands.filter(command => command.state !== 'settled').map(command => [command.operation, command.state]);
};

test('the bridge waits for a session create past Appium\'s own agent launch bounds on both platforms', t => {
  const stack = driverStack(t);
  const ios = createSessionProfile(stack, { platform: 'ios', device: UDID, path: 'run', presentation: 'visible' }).capabilities;
  const android = createSessionProfile(stack, { platform: 'android', device: 'PHONE123', path: 'run', serverInstallation: { kind: 'install' } }).capabilities;
  assert.ok(SESSION_CREATE_TIMEOUT_MS > Number(ios['appium:wdaLaunchTimeout']), 'past the WDA launch timeout');
  // UiAutomator2 8.7.0 installs both server APKs at once, then launches the server: up to two 30 s tries 3 s apart.
  assert.ok(SESSION_CREATE_TIMEOUT_MS > Number(android['appium:uiautomator2ServerInstallTimeout']) + 2 * 30_000 + 3_000, 'past the server install and launch');
});

test('a session create Appium answers after the per-command deadline is still heard, and close releases the device', async t => {
  const slow: WorldRule[] = [{ tool: 'appium_session_management', match: { action: 'create' }, fault: { kind: 'late', ms: 7_000 } }];
  const f = worldFixture(t, world('ios', iosScreens, slow), { ...iosTarget, timeoutMs: 5_000 });
  await f.driver.prepare(iosApp, live());
  await f.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
  assert.deepEqual(unsettled(f), []);
});

for (const { when, limits, first } of [
  { when: 'cut by its own wait', limits: {}, first: ['prepare', 'DEVICE_ERROR', 'ACKNOWLEDGEMENT_LOST'] },
  { when: 'still pending at the wall limit', limits: { wallTimeMs: 500 }, first: ['prepare', 'WALL_LIMIT', null] },
]) {
  test(`a run whose session create never answers, ${when}, ends CLEANUP_FAILED and leaves the device quarantined`, async t => {
    const f = worldFixture(t, world('ios', iosScreens, lostCreate), { ...iosTarget, timeoutMs: 6_000, sessionCreateTimeoutMs: 1_500 });
    const next = f.open(world('ios', iosScreens));
    const { report, events } = await withRunLog('run-1', async log => ({
      report: await runScriptedScenario({ runId: 'run-1', scenario: iosScript as never, driver: f.driver, judge: passingJudge, log, limits }),
      events: await log.read() }));
    assert.deepEqual([report.verdict, report.reason], ['inconclusive', 'CLEANUP_FAILED']);
    assert.deepEqual(errors(events), [first, ['cleanup', 'CLEANUP_FAILED', null]]);
    assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'quarantined');
    assert.deepEqual(unsettled(f), [['appium-session-create', 'uncertain']]);
    await assert.rejects(next.driver.prepare(iosApp, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_QUARANTINED');
  });
}

test('a session create cut on an Android phone leaves the device quarantined, and the next run is refused', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', androidScreens, lostCreate), { ...phone.options, timeoutMs: 6_000, sessionCreateTimeoutMs: 1_500 }, phone.nativeReply);
  const next = f.open(world('android', androidScreens));
  await assert.rejects(f.driver.prepare(androidApp, live()), (error: unknown) => error instanceof DeviceReasonError && error.vendorCode === 'ACKNOWLEDGEMENT_LOST');
  await assert.rejects(f.driver.close(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'CLEANUP_FAILED');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'quarantined');
  assert.deepEqual(unsettled(f), [['appium-session-create', 'uncertain']]);
  await assert.rejects(next.driver.prepare(androidApp, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_QUARANTINED');
});
