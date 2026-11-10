import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fenceEffectSchema } from '../src/appium/fence/schema.js';
import * as session from '../src/appium/session.js';
import { Admission } from '../src/device/admission.js';
import { DeviceReasonError } from '../src/device/index.js';
import { driverStack, UDID } from './fixtures/appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, androidTarget, iosTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, world, worldFixture, type WorldRule } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(30_000);
const iosScreens = { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) };
const androidScreens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [0, 0, 320, 80] }]) };
const iosApp = { app: { bundleId: 'example.app' } };
const androidApp = { app: { package: 'example.app', activity: '.Main' } };
const lostCreate: WorldRule[] = [{ tool: 'appium_session_management', match: { action: 'create' }, fault: { kind: 'lost' } }];
const cutCreate = (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_ERROR' && error.vendorCode === 'ACKNOWLEDGEMENT_LOST';

function assertCovered(f: ReturnType<typeof worldFixture>, device = IOS_DEVICE) {
  const attempt = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!;
  assert.deepEqual([attempt.terminal?.outcome, attempt.terminal?.disposition], ['inconclusive', 'quarantined']);
  assert.equal(f.admission.inspect(device)!.state, 'available');
  const generation = f.admission.readGeneration(attempt.owner);
  assert.deepEqual(generation.recoveries.map(recovery => recovery.closure), ['accepted']);
  assert.deepEqual(generation.commands.filter(command => command.state !== 'settled').map(command => [command.operation, command.state]),
    [['appium-session-create', 'uncertain']], 'the cut create is fenced, never reported settled');
}

test('the bridge waits for a session create past Appium\'s own agent launch bounds on both platforms', t => {
  const stack = driverStack(t);
  const ios = session.createSessionProfile(stack, { platform: 'ios', device: UDID, path: 'run', presentation: 'visible' }).capabilities;
  const android = session.createSessionProfile(stack, { platform: 'android', device: 'PHONE123', path: 'run', serverInstallation: { kind: 'install' } }).capabilities;
  const wait = (session as Record<string, unknown>).SESSION_CREATE_TIMEOUT_MS;
  assert.equal(typeof wait, 'number');
  assert.ok(Number(wait) > Number(ios['appium:wdaLaunchTimeout']), 'past the WDA launch timeout');
  // UiAutomator2 8.7.0 installs both server APKs at once, then launches the server: up to two 30 s tries 3 s apart.
  assert.ok(Number(wait) > Number(android['appium:uiautomator2ServerInstallTimeout']) + 2 * 30_000 + 3_000, 'past the server install and launch');
});

test('a session create Appium answers after the per-command deadline is still heard, and close releases the device', async t => {
  const slow: WorldRule[] = [{ tool: 'appium_session_management', match: { action: 'create' }, fault: { kind: 'late', ms: 7_000 } }];
  const f = worldFixture(t, world('ios', iosScreens, slow), { ...iosTarget, timeoutMs: 5_000 });
  await f.driver.prepare(iosApp, live());
  await f.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
  const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!.owner;
  assert.deepEqual(f.admission.readGeneration(owner).commands.filter(command => command.state !== 'settled'), []);
});

test('a session create cut by its deadline on a simulator: close stops the stack and the WDA runner it started, covers the create, and the next run starts', async t => {
  const f = worldFixture(t, world('ios', iosScreens, lostCreate), { ...iosTarget, timeoutMs: 6_000, sessionCreateTimeoutMs: 6_000 });
  await assert.rejects(f.driver.prepare(iosApp, live()), cutCreate);
  await f.driver.close(live());
  assertCovered(f);
  assert.deepEqual(f.fence.effects.filter(effect => effect.kind === 'wda-stop').map(effect => 'pid' in effect && effect.pid), [7001], 'the runner the cut create started is stopped by identity');
  assert.deepEqual(f.fence.wda, []);
  const next = f.open(world('ios', iosScreens));
  await next.driver.prepare(iosApp, live());
  await next.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
});

test('a session create cut by its deadline on an Android phone: close stops the stack and both UiAutomator2 processes, removes the forward, and the next run starts', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', androidScreens, lostCreate), { ...phone.options, timeoutMs: 6_000, sessionCreateTimeoutMs: 6_000 }, phone.nativeReply);
  await assert.rejects(f.driver.prepare(androidApp, live()), cutCreate);
  await f.driver.close(live());
  assertCovered(f, ANDROID_DEVICE);
  assert.equal(f.fence.processes.size, 0, 'both UiAutomator2 processes are stopped');
  assert.deepEqual(f.fence.forwards, [], 'the owned forward is removed');
  const next = f.open(world('android', androidScreens));
  await next.driver.prepare(androidApp, live());
  await next.driver.close(live());
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

/** The state BUG-L4i-1 left in the real store: the close's own fence failed, so the cut create stayed uncovered, and the
 *  bridge process that owned it exited. `later` is the next bridge process's view of the same store. */
async function quarantinedByCutCreate(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-cut-create-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = (process: { pid: number; incarnation: string }) => Admission.forTesting({ root, backend: 'fake', durability: 'fast', process,
    ownerLiveness: owner => owner.pid === 7711 ? 'dead' : 'alive' });
  const f = worldFixture(t, world('ios', iosScreens, lostCreate), { ...iosTarget, timeoutMs: 6_000, sessionCreateTimeoutMs: 6_000, admission: store({ pid: 7711, incarnation: 'old-bridge' }) });
  f.fence.failOnce = effect => effect.kind === 'host-inventory';
  await assert.rejects(f.driver.prepare(iosApp, live()), cutCreate);
  await f.driver.close(live()).catch(() => undefined);
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'quarantined');
  await f.fence.run(fenceEffectSchema.parse({ kind: 'wda-inventory', udid: UDID }), live());
  return { ...f, later: store({ pid: 7712, incarnation: 'new-bridge' }) };
}

test('a simulator already quarantined by a cut session create is recovered by the next ordinary run once no WDA runner is left', async t => {
  const f = await quarantinedByCutCreate(t);
  f.fence.wda = [];
  const next = f.open(world('ios', iosScreens), { admission: f.later });
  await next.driver.prepare(iosApp, live());
  await next.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
  const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!.owner;
  const recoveries = f.admission.readGeneration(owner).recoveries;
  assert.deepEqual([recoveries.length, recoveries.at(-1)?.closure], [2, 'accepted'], 'the close\'s failed fence, then the next run\'s sweep');
});

test('a simulator quarantined by a cut session create stays quarantined while a WDA runner nobody recorded is listed, and the sweep never stops it', async t => {
  const f = await quarantinedByCutCreate(t);
  const next = f.open(world('ios', iosScreens), { admission: f.later });
  await assert.rejects(next.driver.prepare(iosApp, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_QUARANTINED');
  assert.deepEqual(f.fence.wda.map(row => row.pid), [7001]);
  assert.equal(f.fence.effects.some(effect => effect.kind === 'wda-stop'), false);
});
