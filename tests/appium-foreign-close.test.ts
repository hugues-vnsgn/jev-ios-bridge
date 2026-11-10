import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRunEvents } from '../src/log/index.js';
import { adbRunner, type AdbSpawn } from '../src/device/android/adb.js';
import { DeviceReasonError } from '../src/device/index.js';
import { FakeChild } from './fixtures/adb-spawn.js';
import { ANDROID_DEVICE, IOS_DEVICE, SERIAL, androidTarget, bridge, iosTarget } from './fixtures/appium-wire/matrix.js';
import { UDID, WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { androidScreen, iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const busy = (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY';
const writes = new Set(['wda-stop', 'host-signal', 'host-signal-group', 'android-stop', 'forward-remove', 'settings-write']);

test('a foreign WDA runner that appears before close: DEVICE_BUSY, no runner is stopped, and the simulator stays quarantined', async t => {
  const f = worldFixture(t, world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) }), iosTarget);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const foreign = { udid: UDID, bundleId: 'com.other.WebDriverAgentRunner.xctrunner', pid: 999 };
  f.fence.wda.push(foreign);
  await assert.rejects(f.driver.close(live()), busy);
  assert.deepEqual(f.fence.effects.filter(effect => writes.has(effect.kind)), [], 'nothing is stopped, the bridge\'s own runner included');
  assert.deepEqual(f.fence.wda, [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 7001 }, foreign]);
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'quarantined');
});

test('a foreign automation forward that appears before close: DEVICE_BUSY, nothing is removed or stopped, and the phone stays quarantined', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [16, 100, 216, 140] }]) }),
    phone.options, command => command.kind === 'android-foreground' ? 'topResumedActivity=ActivityRecord{abc u0 example.app/.Main t1}\n' : phone.nativeReply(command));
  await f.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live());
  const foreign = { serial: SERIAL, local: 'tcp:18999', remote: 'tcp:6790' };
  f.fence.forwards.push(foreign);
  await assert.rejects(f.driver.close(live()), busy);
  assert.deepEqual(f.fence.effects.filter(effect => writes.has(effect.kind)), []);
  assert.deepEqual(f.fence.forwards.map(row => row.local), ['tcp:18200', 'tcp:18999'], 'both forwards stay');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'quarantined');
});

/** How the UiAutomator2 identity read after session create ends: left hanging until the startup deadline kills it, or killed from outside. */
const identityCuts = [
  { name: 'hangs past the startup deadline', end: (_child: FakeChild) => undefined, limits: { startupMs: 8000, cleanupMs: 10_000 }, killedBy: ['SIGKILL'] },
  { name: 'is killed from outside', end: (child: FakeChild) => { setImmediate(() => child.emit('close', null, 'SIGKILL')); }, limits: {}, killedBy: [] },
];
for (const { name, end, limits, killedBy } of identityCuts) {
  test(`a UiAutomator2 identity read after session create that ${name} records the UiAutomator2 inventory unknown and keeps the phone quarantined`, async t => {
    const phone = androidTarget();
    const home = world('android', { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] }]) });
    const f = worldFixture(t, home, phone.options, phone.nativeReply);
    const identityReads: FakeChild[] = [];
    const spawn: AdbSpawn = (_file, args) => {
      const child = new FakeChild();
      const line = args.at(-1) ?? '';
      if (!identityReads.length && line.includes('pidof') && line.includes('io.appium.uiautomator2') && cut.tools().includes('appium_session_management')) { identityReads.push(child); end(child); }
      else void f.parts.adb!([...args], new AbortController().signal).then(reply => { child.exit(reply.exitCode, reply.stdout, reply.stderr); });
      return child;
    };
    const cut = f.open(home, { adb: adbRunner({ adb: '/fake/adb', environment: {}, spawn }) });
    const next = f.open(home);
    const b = await bridge(t, [cut.driver, next.driver]);
    const script = { version: 1, platform: 'android', app: { package: 'example.app', activity: '.Main' }, device: { serial: SERIAL }, values: {},
      steps: [{ id: 'shown', kind: 'checkpoint', guard: { present: [{ identifier: 'example.app:id/home' }] }, assertions: [{ id: 'x', claim: 'Home is shown.' }] }] };
    const { runId } = await b.service.start(script, limits);
    const done = await b.finished(runId);
    const errors = (await readRunEvents(b.service.baseDir, runId)).filter(event => event.type === 'error').map(event => [event.data.phase, event.data.code]);
    assert.deepEqual(identityReads.map(read => read.killedBy), [killedBy], 'only the identity read after session create is cut');
    assert.deepEqual([done.report.verdict, done.report.reason, errors[1]], ['inconclusive', 'CLEANUP_FAILED', ['cleanup', 'CLEANUP_FAILED']]);
    assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'quarantined');
    const again = await b.service.start(script);
    const refused = await b.finished(again.runId);
    assert.deepEqual([refused.report.verdict, refused.report.reason], ['inconclusive', 'DEVICE_QUARANTINED'], 'the next run meets the quarantine, not the bridge\'s own leftover server read as foreign');
    const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-2' })!.owner;
    assert.equal(f.admission.readGeneration(owner).inventoryUnknownReason, 'UIAUTOMATOR2_IDENTITY_UNAVAILABLE');
  });
}
