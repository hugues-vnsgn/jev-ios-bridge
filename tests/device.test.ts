import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { productionAppiumHost } from '../src/appium/composition.js';
import { FrozenStack } from '../src/appium/stack.js';
import { Admission, type AdmissionDependencies } from '../src/device/admission.js';
import { identityProbe } from '../src/device/android/probe.js';
import { createDriverFactory } from '../src/device/factory.js';
import { DeviceCliError, DeviceReasonError } from '../src/device/index.js';
import { CompatibilityMarker } from '../src/device/lease.js';
import { createNativeLogSource } from '../src/device/logs.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeProbeSpawn } from './fixtures/adb-spawn.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { stackRelease } from './fixtures/stack-release.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { IOS_DEVICE, iosTarget } from './fixtures/appium-wire/matrix.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const home = world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) });
const app = { app: { bundleId: 'example.app' } };
const busy = (error: unknown): error is DeviceReasonError => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY';

function seeded(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-ios-seeded-')));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  for (const name of ['store', 'locks']) mkdirSync(join(root, name), { mode: 0o700 });
  const store = join(root, 'store');
  return { store, locks: join(root, 'locks'), marker: join(root, 'locks', `${UDID}.lock`),
    admission: (dependencies: AdmissionDependencies = {}) => Admission.forTesting({ root: store, backend: 'fake', durability: 'fast', ...dependencies }) };
}

function abandoned(store: string) {
  const old = Admission.forTesting({ root: store, backend: 'fake', durability: 'fast', process: { pid: 999999, incarnation: 'dead-owner' } });
  const previous = old.acquire({ category: 'ios-simulator', device: UDID, attempt: { kind: 'legacy', id: 'abandoned-run' }, digest: 'old', intent: {} });
  if (previous.kind !== 'acquired') assert.fail('Expected abandoned owner');
  return { old, claim: previous.claim };
}

for (const recoverable of [true, false]) {
  test(`an unknown lock marker refuses DEVICE_BUSY before ${recoverable ? 'a recoverable' : 'an unrecoverable'} dead owner is recovered, with no session or store change`, async t => {
    const s = seeded(t);
    const { claim } = abandoned(s.store);
    if (recoverable) await claim.bindDriver('fake').dispatch('capture', async () => {});
    else claim.registerComponent({ id: 'unfinished', kind: 'host-process', process: { pid: 888888, incarnation: 'persistent' } });
    const marker = JSON.stringify({ pid: 2147483647, token: 'unknown-legacy-token', deviceId: UDID });
    writeFileSync(s.marker, marker);
    const admission = s.admission({ ownerLiveness: () => 'dead' });
    const before = [admission.readGeneration(claim.identity), admission.inspect(IOS_DEVICE)];
    const f = worldFixture(t, home, { ...iosTarget, admission, lockRoot: s.locks });
    await assert.rejects(f.driver.prepare(app, live()), (error: unknown) => busy(error) && error.message.includes(s.marker));
    assert.deepEqual([f.tools(), f.native.calls.length, f.fence.effects], [[], 0, []]);
    assert.equal(readFileSync(s.marker, 'utf8'), marker);
    assert.deepEqual([admission.readGeneration(claim.identity), admission.inspect(IOS_DEVICE)], before, 'no recovery claim, command or owner change');
    assert.equal(admission.readAttempt({ kind: 'legacy', id: 'run-1' }), undefined);
  });
}

test('an unknown marker held by a live process names that bridge process and the lock file', async t => {
  const s = seeded(t);
  writeFileSync(s.marker, JSON.stringify({ pid: process.pid, token: 'other' }));
  const f = worldFixture(t, home, { ...iosTarget, admission: s.admission(), lockRoot: s.locks });
  await assert.rejects(f.driver.prepare(app, live()), (error: unknown) => busy(error)
    && error.message.includes(`bridge process ${String(process.pid)}`) && error.message.includes(s.marker));
  assert.deepEqual([f.tools(), f.admission.inspect(IOS_DEVICE)], [[], undefined]);
});

test('an unknown marker written between admission and the lock take still refuses DEVICE_BUSY before any session', async t => {
  const s = seeded(t);
  const marker = JSON.stringify({ pid: 2147483647, token: 'late-unknown-token', deviceId: UDID });
  const admission = s.admission({ fault: (point, operation) => { if (point === 'afterCommit' && operation === 'acquire') writeFileSync(s.marker, marker); } });
  const f = worldFixture(t, home, { ...iosTarget, admission, lockRoot: s.locks });
  await assert.rejects(f.driver.prepare(app, live()), busy);
  assert.deepEqual([f.tools(), f.native.calls.length], [[], 0]);
  assert.equal(readFileSync(s.marker, 'utf8'), marker);
  assert.equal(admission.inspect(IOS_DEVICE)?.state, 'available');
});

test('a dead owner whose commands all settled is recovered before the successor launches, and its marker passes to the successor', async t => {
  const s = seeded(t);
  const { old, claim } = abandoned(s.store);
  await claim.bindDriver('fake').dispatch('capture', async () => {});
  const commands = old.readGeneration(claim.identity).commands;
  await new CompatibilityMarker({ root: s.locks }).take(UDID, claim);
  const admission = s.admission({ ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive' });
  const atLaunch: unknown[] = [];
  const f = worldFixture(t, home, { ...iosTarget, admission, lockRoot: s.locks }, command => {
    if (command.kind === 'ios-console') atLaunch.push([admission.readGeneration(claim.identity).recoveries[0]?.closure, admission.readAttempt(claim.identity.attempt)?.terminal?.outcome]);
    return undefined;
  });
  await f.driver.prepare(app, live());
  assert.deepEqual(atLaunch, [['accepted', 'inconclusive']]);
  assert.deepEqual(admission.readGeneration(claim.identity).commands, commands);
  assert.equal(admission.inspect(IOS_DEVICE)?.owner?.attempt.id, 'run-1');
  assert.equal((JSON.parse(readFileSync(s.marker, 'utf8')) as { token: string }).token, admission.inspect(IOS_DEVICE)?.owner?.token);
  await f.driver.close(live());
  assert.equal(admission.inspect(IOS_DEVICE)?.state, 'available');
});

for (const component of ['an uncertain MobileBuildMCP one-shot', 'a persistent process'] as const) {
  test(`a dead owner that left ${component} keeps the simulator quarantined: DEVICE_QUARANTINED before any session`, async t => {
    const s = seeded(t);
    const { claim } = abandoned(s.store);
    claim.registerComponent(component === 'a persistent process'
      ? { id: 'unfinished', kind: 'host-process', process: { pid: 888888, incarnation: 'persistent' } }
      : { id: 'unfinished', kind: 'one-shot', operation: 'mobilebuildmcp' });
    claim.issue({ requestId: 'unfinished-command', componentId: 'unfinished', operation: 'launch-app', payload: {} });
    const admission = s.admission({ ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive' });
    const f = worldFixture(t, home, { ...iosTarget, admission, lockRoot: s.locks });
    await assert.rejects(f.driver.prepare(app, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_QUARANTINED');
    assert.deepEqual([f.tools(), f.native.calls.length], [[], 0]);
    assert.equal(admission.inspect(IOS_DEVICE)?.state, 'quarantined');
    assert.equal(admission.readAttempt({ kind: 'legacy', id: 'run-1' }), undefined);
    assert.equal(admission.readAttempt(claim.identity.attempt)?.terminal?.outcome, 'inconclusive');
    const generation = admission.readGeneration(claim.identity);
    assert.deepEqual(generation.commands.map(command => command.state), ['uncertain']);
    assert.deepEqual(generation.recoveries.map(recovery => recovery.closure), ['refused']);
  });
}

test('a simulator without the app refuses DEVICE_ERROR / APP_NOT_INSTALLED after one app-container read, before admission, window or session', async t => {
  const fake = fakeProbeSpawn((_file, _args, child) => { child.exit(1); return undefined; });
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn, simulator: fakeSimulatorProbe(UDID).simulatorSet });
  let windows = 0;
  const f = worldFixture(t, home, { ...iosTarget, identityProbe: probe, deviceWindow: async () => { windows++; } });
  await assert.rejects(f.driver.prepare(app, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_ERROR'
    && error.vendorCode === 'APP_NOT_INSTALLED' && error.vendorSource === 'bridge');
  assert.deepEqual([windows, f.tools(), f.native.calls.length, f.admission.inspect(IOS_DEVICE)], [0, [], 0, undefined]);
  assert.deepEqual(fake.calls.map(call => [call.file, call.args]), [
    ['/usr/bin/xcrun', ['simctl', '--set', '/fake/CoreSimulator/Devices', 'get_app_container', UDID, 'example.app', 'app']]]);
});

test('the installed-app read follows identity and precedes admission and every effect, without the key or the caller\'s device set', async t => {
  const s = seeded(t);
  const order: string[] = [];
  const listing = fakeSimulatorProbe(UDID);
  const fake = fakeProbeSpawn(() => { order.push('app'); return '/Applications/Example.app\n'; });
  const probe = identityProbe({ adb: '/fake/adb', environment: { SIMCTL_DEVICE_SET_PATH: '/other-set', TYPESAFE_API_KEY: 'sentinel-key' },
    spawn: fake.spawn, simulator: async signal => { order.push('identity'); return listing.simulatorSet(signal); } });
  const admission = s.admission({ fault: (point, operation) => { if (point === 'afterCommit' && operation === 'acquire') order.push('admission'); } });
  const f = worldFixture(t, home, { ...iosTarget, identityProbe: probe, admission, deviceWindow: async () => { order.push('window'); } },
    command => { order.push(command.kind); return undefined; });
  await f.driver.prepare(app, live());
  assert.deepEqual(order.slice(0, 5), ['identity', 'app', 'admission', 'window', 'ios-console']);
  assert.deepEqual(fake.calls.map(call => [call.file, call.args, call.options.env]), [
    ['/usr/bin/xcrun', ['simctl', '--set', '/fake/CoreSimulator/Devices', 'get_app_container', UDID, 'example.app', 'app'], {}]]);
  await f.driver.close(live());
});

test('a stalled installed-app read is killed and refuses DEVICE_IDENTITY_UNAVAILABLE / PROBE_TIMEOUT before admission or any effect', async t => {
  const fake = fakeProbeSpawn(() => undefined);
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn, deadlineMs: 5, slowDeadlineMs: 5,
    simulator: fakeSimulatorProbe(UDID).simulatorSet });
  const f = worldFixture(t, home, { ...iosTarget, identityProbe: probe });
  await assert.rejects(f.driver.prepare(app, live()), (error: unknown) => error instanceof Error && 'code' in error
    && error.code === 'DEVICE_IDENTITY_UNAVAILABLE' && error.message.includes('PROBE_TIMEOUT'));
  assert.deepEqual([f.tools(), f.native.calls.length, f.admission.inspect(IOS_DEVICE)], [[], 0, undefined]);
  assert.deepEqual(fake.children[0]?.killedBy, ['SIGTERM']);
});

test('a device set variable that is a link reaches resolution as the set it points to', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-device-set-link-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'Devices'));
  symlinkSync(join(root, 'Devices'), join(root, 'link'));
  const store = Admission.forTesting({ root: realpathSync(mkdtempSync(join(root, 'store-'))), backend: 'fake', durability: 'fast' });
  const host = productionAppiumHost({ environment: { SIMCTL_DEVICE_SET_PATH: join(root, 'link'), PATH: '/nonexistent' }, stack: FrozenStack.forTesting(release),
    openAdmission: () => store, readVersions: async () => ({}) });
  assert.deepEqual((await host({ target: { platform: 'ios', device: UDID } })).target, { platform: 'ios', device: UDID, deviceSet: join(root, 'Devices') });
});

test('a requested device set that is the probe\'s default set is accepted', async t => {
  const f = worldFixture(t, home, { ...iosTarget, target: { platform: 'ios', device: UDID, deviceSet: '/fake/CoreSimulator/Devices' } });
  await f.driver.prepare(app, live());
  await f.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)?.state, 'available');
});

const script = (device?: { udid: string }) => parseScriptedScenario({ version: 1, app: { bundleId: 'example.app' }, values: {}, ...(device ? { device } : {}),
  steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });

test('two spellings of one simulator UUID name one device: the run sees the canonical UUID, and the other spelling waits for its close', async t => {
  const w = worldHost(t, { identityProbe: fakeSimulatorProbe(UDID), worlds: [home] });
  const factory = createDriverFactory({ host: w.host, projectDir: w.root });
  const first = factory(script({ udid: UDID.toLowerCase() }), { runId: 'lower' });
  const second = factory(script({ udid: UDID }), { runId: 'upper' });
  const third = factory(script({ udid: UDID }), { runId: 'after' });
  try {
    await first.prepare(app, live());
    assert.equal((await first.observe(live())).deviceId, UDID);
    await assert.rejects(second.prepare(app, live()), busy);
    assert.deepEqual(w.opened.map(opened => [opened.target.device, opened.tools().length > 0]), [[UDID, true], [UDID, false]]);
    assert.ok(w.opened.every(opened => !JSON.stringify(opened.calls()).includes(UDID.toLowerCase())), 'the provider only ever sees the canonical UUID');
    await first.close(live());
    await third.prepare(app, live());
  } finally { for (const driver of [first, second, third]) await driver.close(live()); }
  assert.equal(w.admission.inspect(IOS_DEVICE)?.state, 'available');
});

test('a booted alias from the defaults is refused as a device alias before any host part, store or session is built', async t => {
  const w = worldHost(t, { identityProbe: fakeSimulatorProbe(UDID), worlds: [home] });
  const driver = createDriverFactory({ host: w.host, projectDir: w.root, defaultUdid: 'booted' })(script(), { runId: 'alias' });
  await assert.rejects(driver.prepare(app, live()), (error: unknown) => error instanceof DeviceCliError && error.code === 'INVALID_DEVICE'
    && /dedicated simulator UUID/.test(error.message));
  await driver.close(live());
  assert.deepEqual([w.opened.length, w.admission.inspect(IOS_DEVICE)], [0, undefined]);
});

test('the app console tail is the last 4 KiB of the log, and a file that cannot be read is unavailable', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jev-ios-console-tail-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await createNativeLogSource({ path: join(root, 'console.log'), values: {} });
  source.write('stdout', `BEGIN-ONLY\n${'before-tail\n'.repeat(600)}END-OF-APP-LOG`);
  await source.finish();
  const tail = await source.readTail();
  assert.ok(tail.endsWith('END-OF-APP-LOG'));
  assert.ok(Buffer.byteLength(tail) <= 4_096);
  assert.ok(!tail.includes('BEGIN-ONLY'));
  const missing = await createNativeLogSource({ path: join(root, 'missing.log'), values: {} });
  await missing.finish();
  await rm(missing.path);
  assert.equal(await missing.readTail(), '[unavailable: ENOENT]');
});

test('the CLI prints CATEGORY_NOT_ENABLED for a physical iPhone UDID from the environment or the vendor file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-ios-phone-cli-'));
  try {
    await writeFile(join(root, 'scenario.json'), JSON.stringify({ version: 1, app: { bundleId: 'com.example.app' }, values: {},
      steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] }, assertions: [{ id: 'shown', claim: 'Visible' }] }] }));
    const { JEV_DEVICE_UDID: _unset, ...environment } = process.env;
    for (const [udid, vendorFile] of [['00008110-001A2C3E4F5A6B7C', undefined], [undefined, 'simulatorId: 0123456789abcdef0123456789abcdef01234567\n']]) {
      if (vendorFile) {
        await mkdir(join(root, '.mobilebuildmcp'));
        await writeFile(join(root, '.mobilebuildmcp/config.yaml'), vendorFile);
      }
      // A dummy key gets past the credentials check; the refusal comes before any service is built.
      const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), resolve('src/cli.ts'), 'run', 'scenario.json'], { cwd: root, encoding: 'utf8',
        env: { ...environment, TYPESAFE_API_KEY: 'fixture-only', JEV_PROJECT_DIR: root, JEV_RUNS_DIR: join(root, 'runs'), ...(udid ? { JEV_DEVICE_UDID: udid } : {}) } });
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.stderr, /^CATEGORY_NOT_ENABLED: Physical iPhone identity is not enabled$/m, udid ?? 'vendor file');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
