import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Admission, type OwnerProcess } from '../src/device/admission.js';
import { adbRunner } from '../src/device/android/adb.js';
import { executorOf } from '../src/device/host-start.js';
import { simctlRunner } from '../src/appium/native/simctl.js';
import { fenceAppium, type FenceRunner } from '../src/appium/fence/index.js';
import { fakeSpawn } from './fixtures/adb-spawn.js';

const adb = '/sdk/platform-tools/adb';
const live = () => new AbortController().signal;
const timeout = () => Object.assign(new Error('spawnSync /bin/ps ETIMEDOUT'), { code: 'ETIMEDOUT', status: null });
const exited = () => Object.assign(new Error('Command failed'), { status: 1 });

test('a failed start lookup still reports the child, with an unknown incarnation that names the reason', async () => {
  assert.deepEqual(executorOf(4242, () => 'Fri Oct 24 09:00:00 2026'), { pid: 4242, incarnation: 'Fri Oct 24 09:00:00 2026' });
  assert.deepEqual(executorOf(4242, () => { throw timeout(); }), { pid: 4242, incarnation: 'unknown-ETIMEDOUT' });
  assert.deepEqual(executorOf(4242, () => { throw exited(); }), { pid: 4242, incarnation: 'unknown-status-1' });
  assert.deepEqual(executorOf(4242, () => ''), { pid: 4242, incarnation: 'unknown-no-start-time' });
  const fake = fakeSpawn(child => Object.assign(child, { pid: 5151 }));
  const started: OwnerProcess[] = [];
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn, incarnation: () => { throw timeout(); } })(['-s', 'one', 'shell', 'settings', 'put', 'global', 'hidden_api_policy', '1'], live(), host => started.push(host));
  fake.child().exit(1, '', 'error\n');
  assert.deepEqual(await pending, { stdout: '', stderr: 'error\n', exitCode: 1 });
  assert.deepEqual(started, [{ pid: 5151, incarnation: 'unknown-ETIMEDOUT' }]);
});

test('a simctl write failure records its child before the result is known', async () => {
  const fake = fakeSpawn(child => Object.assign(child, { pid: 6161 }));
  const started: OwnerProcess[] = [];
  const runner = simctlRunner({ environment: { PATH: '/usr/bin', TYPESAFE_API_KEY: 'secret' }, spawn: fake.spawn, incarnation: pid => `host-${String(pid)}` });
  const pending = runner(['terminate', 'ABCDEF00-0000-4000-8000-000000000001', 'com.facebook.WebDriverAgentRunner.xctrunner'], live(), host => started.push(host));
  assert.deepEqual(started, [{ pid: 6161, incarnation: 'host-6161' }]);
  fake.child().exit(1, '', 'No such process\n');
  assert.deepEqual(await pending, { stdout: '', stderr: 'No such process\n', exitCode: 1 });
  assert.deepEqual(fake.calls[0]!.args, ['simctl', 'terminate', 'ABCDEF00-0000-4000-8000-000000000001', 'com.facebook.WebDriverAgentRunner.xctrunner']);
  assert.equal('TYPESAFE_API_KEY' in fake.calls[0]!.options.env, false);
  const lookupFails = fakeSpawn(child => Object.assign(child, { pid: 6162 }));
  const reported: OwnerProcess[] = [];
  const again = simctlRunner({ environment: {}, spawn: lookupFails.spawn, incarnation: () => { throw timeout(); } })(['boot', 'X'], live(), host => reported.push(host));
  lookupFails.child().exit(0);
  await again;
  assert.deepEqual(reported, [{ pid: 6162, incarnation: 'unknown-ETIMEDOUT' }]);
});

function androidOwner(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-executors-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'fast', process: { pid: 900, incarnation: 'owner' }, ownerLiveness: () => 'dead' });
  const result = admission.acquire({ device: 'serial-one', category: 'android-phone', attempt: { kind: 'legacy', id: 'owner' }, digest: 'one', intent: {} });
  if (result.kind !== 'acquired') assert.fail('Expected acquired owner');
  return { admission, claim: result.claim };
}

test('a ps timeout during a failed write keeps quarantine: the executor with an unknown start never counts as exited', async t => {
  const { admission, claim } = androidOwner(t);
  const values = { hidden_api_policy: null, hidden_api_policy_p_apps: '0', hidden_api_policy_pre_p_apps: '2', accessibility_enabled: '0' };
  claim.registerComponent(JSON.parse(JSON.stringify({ id: 'settings', kind: 'appium-settings', serial: 'serial-one', values })));
  claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const current: Record<string, string | null> = { hidden_api_policy: '1', hidden_api_policy_p_apps: '1', hidden_api_policy_pre_p_apps: '1', accessibility_enabled: '1' };
  let writes = 0;
  const runner: FenceRunner = async (effect, _signal, started) => {
    if (effect.kind === 'settings-read') return structuredClone(current);
    if (effect.kind === 'settings-write') {
      started?.(executorOf(process.pid, () => { throw timeout(); }));
      if (++writes === 1) throw new Error('adb exited 1');
      current[effect.key] = effect.value; return { ok: true };
    }
    throw new Error(`Unexpected ${effect.kind}`);
  };
  const options = { runner, revalidate: async () => {}, clock: { now: () => 0, sleep: async () => {} } };
  const first = admission.claimRecovery(claim.identity, 'first'); if (first.kind === 'refused') assert.fail();
  await assert.rejects(fenceAppium({ admission, claim: first.claim, ...options }), /adb exited 1/);
  first.claim.close();
  assert.equal(admission.componentState({ pid: process.pid, incarnation: 'unknown-ETIMEDOUT' }), 'unknown');
  const second = admission.claimRecovery(claim.identity, 'second'); if (second.kind === 'refused') assert.fail();
  await assert.rejects(fenceAppium({ admission, claim: second.claim, ...options }), /Executor exit is not proven/);
  second.claim.close();
  assert.equal(admission.inspect({ category: 'android-phone', value: 'serial-one' })?.state, 'quarantined');
});
