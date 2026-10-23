import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Admission, type OwnerIdentity } from '../src/device/admission.js';

const device = 'ABCDEF00-0000-4000-8000-000000000001';
const settings = { hidden_api_policy: null, hidden_api_policy_p_apps: '0', hidden_api_policy_pre_p_apps: '2', accessibility_enabled: '0' };
const targets = [
  { id: 'group', kind: 'appium-process-group', leader: { pid: 100, startTime: 'host-100' }, runMarker: '0123456789abcdef0123456789abcdef', pgid: 100, members: [{ pid: 101, startTime: 'host-101' }] },
  { id: 'wda', kind: 'appium-wda', udid: device, bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner', pid: 200 },
  { id: 'uia', kind: 'appium-uiautomator2', serial: 'serial-one', processes: [{ pid: 300, startTime: '12345' }, { pid: 301, startTime: '12346' }] },
  { id: 'forward', kind: 'appium-forward', serial: 'serial-one', local: 'tcp:19123', remote: 'tcp:6790' },
  { id: 'settings', kind: 'appium-settings', serial: 'serial-one', values: settings },
  { id: 'helper', kind: 'appium-native-helper', role: 'console', process: { pid: 400, startTime: 'host-400' } },
] as const;

const androidTargets = targets.filter(target => target.kind !== 'appium-wda');
const state = (admission: Admission, owner: OwnerIdentity) => admission.inspect({ category: owner.category, value: owner.device })?.state;
function fixture(t: TestContext, selected: readonly unknown[] = []) {
  const android = selected.some(target => typeof target === 'object' && target !== null && 'kind' in target && typeof target.kind === 'string' && ['appium-uiautomator2', 'appium-forward', 'appium-settings'].includes(target.kind));
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-fence-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'fast', process: { pid: 900, incarnation: 'owner' }, ownerLiveness: () => 'dead' });
  const result = admission.acquire({ device: android ? 'serial-one' : device, category: android ? 'android-phone' : 'ios-simulator', attempt: { kind: 'legacy', id: 'owner' }, digest: 'one', intent: {} });
  if (result.kind !== 'acquired') assert.fail('Expected acquired owner');
  return { root, admission, claim: result.claim };
}

for (const target of targets) test(`${target.kind} records its exact identity before effects`, t => {
  const { admission, claim } = fixture(t, [target]);
  claim.registerComponent(JSON.parse(JSON.stringify(target)));
  assert.deepEqual(admission.readGeneration(claim.identity).components, [{ id: target.id, kind: target.kind, declaration: target }]);
});

async function fenceModule() { return import('../src/appium/fence/index.js'); }

class FakeRunner {
  events: (import('../src/appium/fence/schema.js').FenceEffect | { wait: number })[] = [];
  time = 0;
  resistTerm = false;
  ignoreKill = false;
  delay = 0;
  hang = false;
  hosts = [
    { pid: 100, startTime: 'host-100', ppid: 1, pgid: 100, state: 'running', executable: '/node' },
    { pid: 101, startTime: 'host-101', ppid: 100, pgid: 100, state: 'running', executable: '/driver' },
    { pid: 102, startTime: 'host-102', ppid: 101, pgid: 102, state: 'running', executable: '/escaped' },
    { pid: 400, startTime: 'host-400', ppid: 1, pgid: 400, state: 'running', executable: '/log' },
    { pid: 999, startTime: 'foreign', ppid: 1, pgid: 999, state: 'running', executable: '/foreign' },
  ];
  wda = [{ udid: device, bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner', pid: 200 }];
  processes = new Map([[300, '12345'], [301, '12346']]);
  forwards = [{ serial: 'serial-one', local: 'tcp:19123', remote: 'tcp:6790' }, { serial: 'foreign', local: 'tcp:19124', remote: 'tcp:6790' }];
  values: Record<string, string | null> = { hidden_api_policy: '1', hidden_api_policy_p_apps: '1', hidden_api_policy_pre_p_apps: '1', accessibility_enabled: '1' };
  run: import('../src/appium/fence/index.js').FenceRunner = async (effect, signal) => {
    this.events.push(structuredClone(effect));
    this.time += this.delay;
    if (this.hang) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    switch (effect.kind) {
      case 'host-inventory': return structuredClone(this.hosts);
      case 'host-signal-group':
        if (effect.signal === 'SIGKILL' ? !this.ignoreKill : !this.resistTerm) this.hosts = this.hosts.filter(row => row.pgid !== effect.pgid);
        return { ok: true };
      case 'host-signal':
        if (effect.signal === 'SIGKILL' ? !this.ignoreKill : !this.resistTerm) this.hosts = this.hosts.filter(row => row.pid !== effect.process.pid);
        return { ok: true };
      case 'wda-inventory': return structuredClone(this.wda);
      case 'wda-stop': this.wda = this.wda.filter(row => row.pid !== effect.pid); return { ok: true };
      case 'android-process': { const startTime = this.processes.get(effect.pid); return startTime ? { kind: 'running', startTime } : { kind: 'absent' }; }
      case 'android-stop': this.processes.delete(effect.process.pid); return { ok: true };
      case 'forward-inventory': return structuredClone(this.forwards);
      case 'forward-remove': this.forwards = this.forwards.filter(row => row.serial !== effect.serial || row.local !== effect.local); return { ok: true };
      case 'settings-read': return structuredClone(this.values);
      case 'settings-write': this.values[effect.key] = effect.value; return { ok: true };
    }
  };
  clock = { now: () => this.time, sleep: async (ms: number) => { this.events.push({ wait: ms }); this.time += ms; } };
}
async function prepared(t: TestContext, selected: readonly unknown[]) {
  const f = fixture(t, selected);
  for (const target of selected) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: { action: 'unknown' }, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'cleanup');
  if (recovery.kind === 'refused') assert.fail('Expected recovery claim');
  const runner = new FakeRunner();
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, clock: runner.clock });
  return { ...f, recovery: recovery.claim, runner, proof };
}
const proofKinds = ['appium-group-stopped', 'appium-wda-stopped', 'appium-uiautomator2-stopped', 'appium-forward-removed', 'appium-settings-restored', 'appium-helper-stopped'];
for (const [index, target] of targets.entries()) {
  test(`${target.kind} has a bound receipt that releases without changing the uncertain outcome`, async t => {
    const { admission, claim, recovery, proof } = await prepared(t, [target]);
    assert.equal(proof.components.find(row => row.componentId === target.id)?.proof.kind, proofKinds[index]);
    const receipt = recovery.submitFence(proof);
    assert.equal(receipt.proof.requestId, proof.requestId);
    assert.equal(state(admission, claim.identity), 'available');
    assert.deepEqual(admission.readAttempt(claim.identity.attempt)?.terminal?.payload, { action: 'unknown' });
    assert.deepEqual(admission.submitFence(claim.identity, proof), receipt);
  });
  test(`${target.kind} without its receipt remains quarantined`, async t => {
    const { admission, claim, recovery, proof } = await prepared(t, [target]);
    const incomplete = { ...proof, components: proof.components.filter(row => row.componentId !== target.id) };
    assert.throws(() => recovery.submitFence(incomplete), { code: 'COVERAGE_INCOMPLETE' });
    assert.equal(state(admission, claim.identity), 'quarantined');
  });
}

test('TERM waits five seconds then KILL covers recorded and escaped descendants and preserves foreign processes', async t => {
  const f = fixture(t); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[0])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'stop'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner(); runner.resistTerm = true;
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, clock: runner.clock });
  recovery.claim.submitFence(proof);
  assert.deepEqual(runner.events.filter(event => 'signal' in event || 'wait' in event), [
    { kind: 'host-signal-group', pgid: 100, members: [{ pid: 100, startTime: 'host-100' }, { pid: 101, startTime: 'host-101' }], signal: 'SIGTERM' },
    { kind: 'host-signal', process: { pid: 102, startTime: 'host-102' }, signal: 'SIGTERM' },
    { wait: 5000 },
    { kind: 'host-signal-group', pgid: 100, members: [{ pid: 100, startTime: 'host-100' }, { pid: 101, startTime: 'host-101' }], signal: 'SIGKILL' },
    { kind: 'host-signal', process: { pid: 102, startTime: 'host-102' }, signal: 'SIGKILL' },
  ]);
  assert.deepEqual(runner.hosts.map(row => row.pid), [400, 999]);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});

test('cleanup retries converge after components have already stopped and settings are restored', async t => {
  const { admission, claim, recovery, runner, proof } = await prepared(t, androidTargets);
  const { fenceAppium } = await fenceModule();
  const again = await fenceAppium({ admission, claim: recovery, runner: runner.run, clock: runner.clock });
  const receipt = recovery.submitFence(again);
  assert.equal(receipt.proof.components.filter(row => row.proof.kind !== 'completed-command').length, 5);
  assert.deepEqual(runner.values, settings);
  assert.deepEqual(runner.forwards, [{ serial: 'foreign', local: 'tcp:19124', remote: 'tcp:6790' }]);
  assert.equal(state(admission, claim.identity), 'available');
  assert.equal(proof.kind, 'stop');
});

for (const fault of ['reused-pid', 'unknown-member', 'shared-service', 'surviving-kill', 'wrong-forward', 'wrong-wda', 'unreadable', 'deadline', 'unknown-create']) test(`${fault} retains quarantine`, async t => {
  const selected = fault === 'wrong-wda' ? targets.filter(target => !['appium-uiautomator2', 'appium-forward', 'appium-settings'].includes(target.kind)) : androidTargets;
  const f = fixture(t, selected); for (const target of selected) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  if (fault === 'unknown-create') f.claim.markInventoryUnknown('unknown-creation');
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, fault); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner();
  if (fault === 'reused-pid') runner.hosts[0]!.startTime = 'reused';
  if (fault === 'unknown-member') runner.hosts.push({ pid: 888, startTime: 'unowned', ppid: 1, pgid: 100, state: 'running', executable: '/other' });
  if (fault === 'shared-service') runner.hosts[1]!.executable = '/CoreSimulatorService';
  if (fault === 'surviving-kill') { runner.resistTerm = true; runner.ignoreKill = true; }
  if (fault === 'wrong-forward') runner.forwards[0]!.remote = 'tcp:9999';
  if (fault === 'wrong-wda') runner.wda[0]!.pid = 201;
  if (fault === 'deadline') runner.delay = 23000;
  const { fenceAppium } = await fenceModule();
  await assert.rejects(() => fenceAppium({ admission: f.admission, claim: recovery.claim,
    runner: fault === 'unreadable' ? async () => ({ invalid: true }) : runner.run, clock: runner.clock }));
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
  if (fault === 'unknown-create') assert.deepEqual(runner.events, []);
});

test('a hung runner is bounded by the cleanup budget and cannot release on a late reply', async t => {
  const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'hang'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner(); runner.hang = true;
  const { fenceAppium } = await fenceModule();
  await assert.rejects(() => fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, budgetMs: 10 }), /budget/i);
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});

test('dead-owner sweep acquires only after all Appium receipts and preserves the old outcome', async t => {
  const f = fixture(t, androidTargets); for (const target of androidTargets) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  const runner = new FakeRunner();
  const result = await f.admission.acquireWithAppiumRecovery({ device: f.claim.identity.device, category: f.claim.identity.category, attempt: { kind: 'legacy', id: 'next' }, digest: 'next', intent: {} }, { runner: runner.run, clock: runner.clock });
  assert.equal(result.kind, 'acquired');
  assert.equal(f.admission.readAttempt(f.claim.identity.attempt)?.terminal?.outcome, 'inconclusive');
  assert.deepEqual(runner.values, settings);
  assert.equal(f.admission.readGeneration(f.claim.identity).recoveries[0]?.closure, 'accepted');
});

test('owned automation inventory is available while each foreign automation kind is DEVICE_BUSY exit 3', async () => {
  const { inspectForeignAutomation } = await fenceModule();
  const owned = targets.map(target => ({ id: target.id, kind: target.kind, declaration: target }));
  const inventory = { wda: [{ udid: device, bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner', pid: 200 }],
    uiautomator2: [{ serial: 'serial-one', pid: 300, startTime: '12345' }], forwards: [{ serial: 'serial-one', local: 'tcp:19123', remote: 'tcp:6790' }] };
  assert.deepEqual(inspectForeignAutomation(owned, inventory), { kind: 'available' });
  for (const key of ['wda', 'uiautomator2', 'forwards'] as const) {
    const modified = structuredClone(inventory);
    if (key === 'wda') modified.wda[0]!.pid = 999;
    if (key === 'uiautomator2') modified.uiautomator2[0]!.startTime = '999';
    if (key === 'forwards') modified.forwards[0]!.remote = 'tcp:9999';
    assert.deepEqual(inspectForeignAutomation(owned, modified), { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 });
  }
});

test('leftover owned forward is absent before the next create and an unrelated forward survives', async t => {
  const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
  const runner = new FakeRunner();
  const { clearOwnedForwards } = await fenceModule();
  const session = f.claim.bindDriver('fake');
  const proofs = await clearOwnedForwards({ admission: f.admission, owner: f.claim.identity, dispatcher: session, runner: runner.run });
  await session.dispatch('next-create', async () => {
    assert.deepEqual(runner.forwards, [{ serial: 'foreign', local: 'tcp:19124', remote: 'tcp:6790' }]);
    return { created: true };
  });
  assert.equal(proofs[0]?.proof.kind, 'appium-forward-removed');
  assert.equal(f.admission.readGeneration(f.claim.identity).commands.at(-1)?.state, 'settled');
});

test('component recording commits every identity before the first effect', async t => {
  const f = fixture(t, [targets[3]]);
  const { recordAppiumComponents } = await fenceModule();
  recordAppiumComponents(f.claim, [targets[3], targets[4]]);
  const session = f.claim.bindDriver('fake');
  await session.dispatch('create', async () => {
    const components = f.admission.readGeneration(f.claim.identity).components;
    assert.deepEqual(components.slice(0, 2).map(component => component.declaration), [targets[3], targets[4]]);
    return { created: true };
  });
  assert.equal(f.admission.readGeneration(f.claim.identity).commands[0]?.state, 'settled');
});

test('restoration waits for automation to stop even when settings and forwards were registered first', async t => {
  const { runner, recovery, proof } = await prepared(t, [targets[4], targets[3], targets[2], targets[0]]);
  recovery.submitFence(proof);
  const operations = runner.events.map(event => 'kind' in event ? event.kind : 'wait');
  assert.ok(operations.indexOf('host-signal-group') < operations.indexOf('android-stop'));
  assert.ok(operations.lastIndexOf('android-stop') < operations.indexOf('settings-write'));
  assert.ok(operations.lastIndexOf('settings-write') < operations.indexOf('forward-remove'));
  assert.deepEqual(runner.values, settings);
});

for (const mutation of ['wrong-kind', 'other-target', 'malformed-result', 'live-result']) test(`receipt refuses ${mutation} evidence`, async t => {
  const { admission, claim, recovery, proof } = await prepared(t, [targets[3]]);
  const changed = structuredClone(proof);
  const target = changed.components.find(row => row.componentId === 'forward')!;
  if (mutation === 'wrong-kind') target.proof = { kind: 'completed-command', commandId: admission.readGeneration(claim.identity).commands[0]!.id };
  else {
    const id = `forged-${mutation}`;
    const effect = mutation === 'other-target' ? { kind: 'settings-read', serial: 'other-serial' } : { kind: 'forward-inventory' };
    const raw = { id, kind: 'appium-fence-command', effect };
    const request = { requestId: id, componentId: id, operation: 'appium-fence', payload: {}, recordResult: true, components: [JSON.parse(JSON.stringify(raw))] };
    if (mutation === 'other-target') {
      await assert.rejects(() => recovery.dispatch(request, async () => settings), { code: 'INVALID_REQUEST' });
      assert.equal(state(admission, claim.identity), 'quarantined');
      return;
    }
    await recovery.dispatch(request, async commandId => {
      target.proof = { kind: 'appium-forward-removed', commandId };
      return mutation === 'malformed-result' ? { ok: true } : mutation === 'live-result' ? [{ serial: 'serial-one', local: 'tcp:19123', remote: 'tcp:6790' }] : settings;
    });
    const commandId = admission.readGeneration(claim.identity).commands.at(-1)!.id;
    changed.components.push({ componentId: id, proof: { kind: 'completed-command', commandId } });
  }
  assert.throws(() => recovery.submitFence(changed), { code: 'COVERAGE_INCOMPLETE' });
  assert.equal(state(admission, claim.identity), 'quarantined');
});

test('a component targeting another device is refused before it can be owned', t => {
  const f = fixture(t);
  assert.throws(() => f.claim.registerComponent(JSON.parse(JSON.stringify({ ...targets[1], udid: 'ABCDEF00-0000-4000-8000-000000000002' }))), { code: 'INVALID_REQUEST' });
  assert.throws(() => f.claim.registerComponent(JSON.parse(JSON.stringify(targets[2]))), { code: 'INVALID_REQUEST' });
  assert.equal(state(f.admission, f.claim.identity), 'active');
});

test('foreign automation checks use the admission inventory for the exact device', async t => {
  const f = fixture(t, [targets[2]]);
  for (const target of [targets[2], targets[3]]) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  const inventory = { wda: [], uiautomator2: [{ serial: 'serial-one', pid: 300, startTime: '12345' }], forwards: [{ serial: 'serial-one', local: 'tcp:19123', remote: 'tcp:6790' }] };
  assert.deepEqual(f.admission.inspectAppiumAutomation({ category: 'android-phone', value: 'serial-one' }, inventory), { kind: 'available' });
  assert.deepEqual(f.admission.inspectAppiumAutomation({ category: 'android-phone', value: 'unowned-device' }, inventory), { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 });
});

test('startup forward cleanup has its own bounded budget even with a caller signal', async t => {
  const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
  const runner = new FakeRunner(); runner.hang = true;
  const { clearOwnedForwards } = await fenceModule();
  const session = f.claim.bindDriver('fake');
  await assert.rejects(() => clearOwnedForwards({ admission: f.admission, owner: f.claim.identity, dispatcher: session, runner: runner.run,
    signal: new AbortController().signal, budgetMs: 10 }), /budget/i);
  assert.equal(f.admission.readGeneration(f.claim.identity).commands[0]?.state, 'uncertain');
});

test('an old recovery readback cannot release a later recovery claim', async t => {
  const { admission, claim, recovery, proof } = await prepared(t, [targets[3]]);
  recovery.close();
  const next = admission.claimRecovery(claim.identity, 'new-recovery'); if (next.kind === 'refused') assert.fail('Expected next recovery');
  assert.throws(() => next.claim.submitFence(proof), { code: 'COVERAGE_INCOMPLETE' });
  assert.equal(state(admission, claim.identity), 'quarantined');
});

test('a pre-create forward readback is never a final stop receipt', async t => {
  const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
  const runner = new FakeRunner();
  const { clearOwnedForwards } = await fenceModule();
  const proofs = await clearOwnedForwards({ admission: f.admission, owner: f.claim.identity, dispatcher: f.claim.bindDriver('fake'), runner: runner.run });
  runner.forwards.push({ serial: 'serial-one', local: 'tcp:19123', remote: 'tcp:6790' });
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'final'); if (recovery.kind === 'refused') assert.fail();
  const view = f.admission.readGeneration(f.claim.identity);
  for (const component of view.components.filter(component => component.kind === 'appium-fence-command')) {
    const command = view.commands.find(command => command.componentId === component.id)!;
    proofs.push({ componentId: component.id, proof: { kind: 'completed-command', commandId: command.id } });
  }
  assert.throws(() => recovery.claim.submitFence({ requestId: 'stale-startup', kind: 'stop', components: proofs, commands: [] }), { code: 'COVERAGE_INCOMPLETE' });
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});

test('launch attestation finds an escaped orphan after its parent has already exited', async t => {
  const f = fixture(t); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[0])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'orphan'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner();
  runner.hosts = runner.hosts.filter(row => row.pid !== 100 && row.pid !== 101 && row.pid !== 102);
  runner.hosts.push(JSON.parse(JSON.stringify({ pid: 103, startTime: 'orphan-103', ppid: 1, pgid: 103, state: 'running', executable: '/escaped',
    runMarker: '0123456789abcdef0123456789abcdef', launchChain: [{ pid: 100, startTime: 'host-100' }, { pid: 101, startTime: 'host-101' }] })));
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, clock: runner.clock });
  recovery.claim.submitFence(proof);
  assert.deepEqual(runner.hosts.map(row => row.pid), [400, 999]);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});
