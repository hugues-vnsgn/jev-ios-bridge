import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Admission, type AdmissionDependencies, type OwnerIdentity } from '../src/device/admission.js';

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
function fixture(t: TestContext, selected: readonly unknown[] = [], dependencies: Pick<AdmissionDependencies, 'componentLiveness'> = {}) {
  const android = selected.some(target => typeof target === 'object' && target !== null && 'kind' in target && typeof target.kind === 'string' && ['appium-uiautomator2', 'appium-forward', 'appium-settings'].includes(target.kind));
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-fence-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'fast', process: { pid: 900, incarnation: 'owner' }, ownerLiveness: () => 'dead', ...dependencies });
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
  lag = 0;
  dying = new Map<number, number>();
  delay = 0;
  hang = false;
  revalidations: (string | undefined)[] = [];
  transportChanged = false;
  transport: string | undefined = undefined;
  failing: import('../src/appium/fence/schema.js').FenceEffect['kind'] | undefined = undefined;
  executors = 7000;
  revalidate = async (serial?: string) => {
    this.revalidations.push(serial);
    if (this.transportChanged) throw new Error('Android transport changed');
    if (this.transport !== undefined && serial !== this.transport) throw new Error('Recorded transport differs');
  };
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
  run: import('../src/appium/fence/index.js').FenceRunner = async (effect, signal, observe) => {
    this.events.push(structuredClone(effect));
    this.time += this.delay;
    if (this.hang) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    if (['wda-stop', 'android-stop', 'forward-remove', 'settings-write'].includes(effect.kind)) { this.executors++; observe?.({ pid: this.executors, incarnation: `adb-${this.executors}` }); }
    const failed = this.failing === effect.kind;
    const settled = <T>(value: T) => { if (failed) throw new Error('adb exited 1'); return value; };
    const exit = (pids: number[]) => {
      if (this.lag) for (const pid of pids) this.dying.set(pid, this.lag);
      else { this.hosts = this.hosts.filter(row => !pids.includes(row.pid)); for (const pid of pids) this.processes.delete(pid); }
    };
    const tick = () => {
      for (const [pid, left] of this.dying) {
        if (left > 1) { this.dying.set(pid, left - 1); continue; }
        this.dying.delete(pid); this.hosts = this.hosts.filter(row => row.pid !== pid); this.processes.delete(pid);
      }
    };
    switch (effect.kind) {
      case 'host-inventory': tick(); return structuredClone(this.hosts);
      case 'host-signal-group':
        if (effect.signal === 'SIGKILL' ? !this.ignoreKill : !this.resistTerm) exit(this.hosts.filter(row => row.pgid === effect.pgid).map(row => row.pid));
        return { ok: true };
      case 'host-signal':
        if (effect.signal === 'SIGKILL' ? !this.ignoreKill : !this.resistTerm) exit([effect.process.pid]);
        return { ok: true };
      case 'wda-inventory': return structuredClone(this.wda);
      case 'wda-stop': this.wda = this.wda.filter(row => row.pid !== effect.pid); return settled({ ok: true });
      case 'android-process': { tick(); const startTime = this.processes.get(effect.pid); return startTime ? { kind: 'running', startTime } : { kind: 'absent' }; }
      case 'android-stop': exit([effect.process.pid]); return settled({ ok: true });
      case 'forward-inventory': return structuredClone(this.forwards);
      case 'forward-remove': this.forwards = this.forwards.filter(row => row.serial !== effect.serial || row.local !== effect.local); return settled({ ok: true });
      case 'settings-read': return structuredClone(this.values);
      case 'settings-write': this.values[effect.key] = effect.value; return settled({ ok: true });
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
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
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
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
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

test('a process that exits shortly after its stop is polled within the budget before the final readback', async t => {
  const selected = [targets[0], targets[2]];
  const f = fixture(t, selected); for (const target of selected) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'late-exit'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner(); runner.resistTerm = true; runner.lag = 2;
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  recovery.claim.submitFence(proof);
  const operations = runner.events.map(event => 'kind' in event ? event.kind : `wait ${event.wait}`);
  assert.deepEqual(operations.slice(operations.indexOf('host-signal-group', operations.indexOf('host-signal-group') + 1)), [
    'host-signal-group', 'host-signal', 'host-inventory', 'wait 500', 'host-inventory',
    'android-process', 'android-stop', 'android-process', 'wait 500', 'android-process',
    'android-process', 'android-stop', 'android-process', 'wait 500', 'android-process',
  ]);
  assert.deepEqual(runner.hosts.map(row => row.pid), [400, 999]);
  assert.deepEqual([...runner.processes], []);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});

test('a changed Android transport keeps quarantine, writes nothing and leaves no uncertain command', async t => {
  const f = fixture(t, androidTargets); for (const target of androidTargets) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const runner = new FakeRunner(); runner.transportChanged = true;
  const request = { device: f.claim.identity.device, category: f.claim.identity.category, attempt: { kind: 'legacy', id: 'next' }, digest: 'next', intent: {} } as const;
  assert.deepEqual(await f.admission.acquireWithAppiumRecovery(request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.deepEqual(runner.events.filter(event => 'kind' in event && ['android-stop', 'settings-write', 'forward-remove'].includes(event.kind)), []);
  assert.deepEqual(runner.values, { hidden_api_policy: '1', hidden_api_policy_p_apps: '1', hidden_api_policy_pre_p_apps: '1', accessibility_enabled: '1' });
  assert.deepEqual([...runner.processes], [[300, '12345'], [301, '12346']]);
  assert.deepEqual(f.admission.readGeneration(f.claim.identity).commands.filter(command => command.state !== 'settled'), []);
  runner.transportChanged = false;
  assert.equal((await f.admission.acquireWithAppiumRecovery(request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock })).kind, 'acquired');
});

test('the transport is revalidated before each effect that names the Android serial', async t => {
  const { runner } = await prepared(t, [targets[4]]);
  assert.deepEqual(runner.events.map(event => 'kind' in event ? event.kind : 'wait'), ['settings-read', 'settings-write', 'settings-write', 'settings-write', 'settings-write', 'settings-read']);
  assert.deepEqual(runner.revalidations, Array<string>(6).fill('serial-one'));
});

test('a recorded serial now held by another AVD keeps quarantine and writes nothing to that device', async t => {
  const f = fixture(t, androidTargets); for (const target of androidTargets) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const runner = new FakeRunner(); runner.transport = 'serial-two';
  const request = { device: f.claim.identity.device, category: f.claim.identity.category, attempt: { kind: 'legacy', id: 'next' }, digest: 'next', intent: {} } as const;
  assert.deepEqual(await f.admission.acquireWithAppiumRecovery(request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.deepEqual(runner.revalidations, ['serial-one']);
  assert.deepEqual(runner.events.filter(event => 'kind' in event && 'serial' in event), []);
  assert.deepEqual(runner.values, { hidden_api_policy: '1', hidden_api_policy_p_apps: '1', hidden_api_policy_pre_p_apps: '1', accessibility_enabled: '1' });
  assert.deepEqual([...runner.processes], [[300, '12345'], [301, '12346']]);
  assert.deepEqual(runner.forwards.map(row => row.local), ['tcp:19123', 'tcp:19124']);
  assert.deepEqual(f.admission.readGeneration(f.claim.identity).commands.filter(command => command.state !== 'settled'), []);
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
  runner.transport = 'serial-one';
  assert.equal((await f.admission.acquireWithAppiumRecovery(request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock })).kind, 'acquired');
});

test('cleanup retries converge after components have already stopped and settings are restored', async t => {
  const { admission, claim, recovery, runner, proof } = await prepared(t, androidTargets);
  const { fenceAppium } = await fenceModule();
  const again = await fenceAppium({ admission, claim: recovery, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  const receipt = recovery.submitFence(again);
  assert.equal(receipt.proof.components.filter(row => row.proof.kind !== 'completed-command').length, 5);
  assert.deepEqual(runner.values, settings);
  assert.deepEqual(runner.forwards, [{ serial: 'foreign', local: 'tcp:19124', remote: 'tcp:6790' }]);
  assert.equal(state(admission, claim.identity), 'available');
  assert.equal(proof.kind, 'stop');
});

test('a reused PID counts as gone while the process now holding it survives', async t => {
  const f = fixture(t); for (const target of [targets[0], targets[5]]) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'reused'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner();
  runner.hosts[0]!.startTime = 'reused-100'; runner.hosts[3]!.startTime = 'reused-400';
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  recovery.claim.submitFence(proof);
  assert.deepEqual(runner.events.filter(event => 'signal' in event || 'wait' in event), [
    { kind: 'host-signal', process: { pid: 101, startTime: 'host-101' }, signal: 'SIGTERM' },
    { kind: 'host-signal', process: { pid: 102, startTime: 'host-102' }, signal: 'SIGTERM' },
    { wait: 5000 },
  ]);
  assert.deepEqual(runner.hosts.map(row => [row.pid, row.startTime]), [[100, 'reused-100'], [400, 'reused-400'], [999, 'foreign']]);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});

test('a reused Android PID counts as gone without a stop', async t => {
  const f = fixture(t, [targets[2]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[2])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'reused-android'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner(); runner.processes.set(300, '77777');
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  recovery.claim.submitFence(proof);
  assert.deepEqual(runner.events.filter(event => 'kind' in event && event.kind === 'android-stop').map(event => 'process' in event && event.process.pid), [301]);
  assert.deepEqual([...runner.processes], [[300, '77777']]);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});

test('a recorded start time with a one-digit day matches the host sampler', async t => {
  const f = fixture(t);
  const group = { id: 'group', kind: 'appium-process-group', leader: { pid: 100, startTime: 'Fri Oct  3 10:00:00 2026' }, runMarker: '0123456789abcdef0123456789abcdef', pgid: 100, members: [] };
  f.claim.registerComponent(JSON.parse(JSON.stringify(group)));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'one-digit-day'); if (recovery.kind === 'refused') assert.fail();
  const signals: unknown[] = [];
  let alive = true;
  const { hostFenceIo } = await import('../src/appium/fence/host.js');
  const { createFenceRunner } = await import('../src/appium/fence/runner.js');
  const io = hostFenceIo({ controllerPid: 900, run: async args => ({ exitCode: 0, stderr: '', stdout: args[0] === '-p' ? '900\n'
    : `${alive ? '100 1 100 S Fri Oct  3 10:00:00 2026 /node\n' : ''}999 1 999 S Fri Oct  3 09:00:00 2026 /foreign\n` }),
    kill: (pid, signal) => { signals.push({ pid, signal }); alive = false; } });
  const unexpected = async () => { throw new Error('Unexpected device command'); };
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: createFenceRunner({ host: io, adb: unexpected, simctl: unexpected }), revalidate: async () => {}, clock: { now: () => 0, sleep: async () => {} } });
  recovery.claim.submitFence(proof);
  assert.deepEqual(signals, [{ pid: -100, signal: 'SIGTERM' }]);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});

for (const fault of ['unknown-member', 'shared-service', 'surviving-kill', 'wrong-wda', 'unreadable', 'deadline', 'unknown-create']) test(`${fault} retains quarantine`, async t => {
  const selected = fault === 'wrong-wda' ? targets.filter(target => !['appium-uiautomator2', 'appium-forward', 'appium-settings'].includes(target.kind)) : androidTargets;
  const f = fixture(t, selected); for (const target of selected) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  if (fault === 'unknown-create') f.claim.markInventoryUnknown('unknown-creation');
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, fault); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner();
  if (fault === 'unknown-member') runner.hosts.push({ pid: 888, startTime: 'unowned', ppid: 1, pgid: 100, state: 'running', executable: '/other' });
  if (fault === 'shared-service') runner.hosts[1]!.executable = '/CoreSimulatorService';
  if (fault === 'surviving-kill') { runner.resistTerm = true; runner.ignoreKill = true; }
  if (fault === 'wrong-wda') runner.wda[0]!.pid = 201;
  if (fault === 'deadline') runner.delay = 23000;
  const { fenceAppium } = await fenceModule();
  await assert.rejects(() => fenceAppium({ admission: f.admission, claim: recovery.claim,
    runner: fault === 'unreadable' ? async () => ({ invalid: true }) : runner.run, revalidate: runner.revalidate, clock: runner.clock }));
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
  if (fault === 'unknown-create') assert.deepEqual(runner.events, []);
});

function quarantinedAndroidForward(t: TestContext, dependencies: Pick<AdmissionDependencies, 'componentLiveness'> = {}, target: unknown = targets[3]) {
  const f = fixture(t, [target], dependencies); f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const request = { device: f.claim.identity.device, category: f.claim.identity.category, attempt: { kind: 'legacy', id: 'next' }, digest: 'next', intent: {} } as const;
  return { ...f, request };
}

test('a sweep that fails on its deadline is covered by the next sweep and the device releases', async t => {
  const f = quarantinedAndroidForward(t);
  const runner = new FakeRunner(); runner.delay = 46000;
  const first = await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  assert.deepEqual(first, { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.deepEqual(f.admission.readGeneration(f.claim.identity).commands.map(command => [command.operation, command.state]), [['appium-fence', 'uncertain']]);
  runner.delay = 0;
  const { fenceAppium } = await fenceModule();
  let proof: Awaited<ReturnType<typeof fenceAppium>> | undefined;
  const second = await f.admission.acquireWithRecovery(f.request, async claim => proof = await fenceAppium({ admission: f.admission, claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }));
  assert.equal(second.kind, 'acquired');
  const view = f.admission.readGeneration(f.claim.identity);
  assert.deepEqual(view.recoveries.map(recovery => recovery.closure), ['refused', 'accepted']);
  const failed = view.commands.find(command => command.state === 'uncertain')!;
  assert.deepEqual(proof?.commands, [failed.id]);
  const covering = proof?.components.find(component => component.componentId === failed.componentId)?.proof;
  assert.equal(covering?.kind, 'superseded-read');
  assert.equal(view.commands.find(command => command.id === (covering as { commandId: string }).commandId)?.state, 'settled');
});

for (const forgery of ['unsettled-answer', 'write-command']) test(`a superseded read refuses a ${forgery} forgery`, async t => {
  const f = quarantinedAndroidForward(t);
  const runner = new FakeRunner(); runner.delay = forgery === 'write-command' ? 23000 : 46000;
  await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  runner.delay = 0;
  const recovery = f.admission.claimRecovery(f.claim.identity, forgery); if (recovery.kind === 'refused') assert.fail();
  const { fenceAppium } = await fenceModule();
  const forged = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }).catch(() => undefined);
  const view = f.admission.readGeneration(f.claim.identity);
  const failed = view.commands.find(command => command.state === 'uncertain')!;
  const answer = view.commands.filter(command => command.recoveryClaimId === recovery.claim.identity.id && command.state === 'settled').at(-1)!;
  const components = (forged?.components ?? []).filter(component => component.componentId !== failed.componentId);
  components.push({ componentId: failed.componentId!, proof: { kind: 'superseded-read', commandId: forgery === 'unsettled-answer' ? failed.id : answer.id } });
  if (forgery === 'write-command') for (const component of view.components) if (!components.some(item => item.componentId === component.id)) {
    const settled = view.commands.find(command => command.componentId === component.id && command.state === 'settled');
    components.push({ componentId: component.id, proof: settled ? { kind: 'completed-command', commandId: settled.id } : { kind: 'appium-forward-removed', commandId: answer.id } });
  }
  assert.throws(() => recovery.claim.submitFence({ requestId: forgery, kind: 'stop', components, commands: [failed.id] }), { code: 'COVERAGE_INCOMPLETE' });
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});

test('an uncertain forward removal keeps the device quarantined only while its executor exit is unproven', async t => {
  let executor: 'alive' | 'unknown' | 'exited' = 'alive';
  const f = quarantinedAndroidForward(t, { componentLiveness: () => executor });
  const runner = new FakeRunner(); runner.delay = 23000;
  assert.deepEqual(await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.deepEqual(runner.events.map(event => 'kind' in event ? event.kind : 'wait'), ['forward-inventory', 'forward-remove']);
  runner.delay = 0;
  for (executor of ['alive', 'unknown'] as const) {
    assert.deepEqual(await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
    assert.equal(state(f.admission, f.claim.identity), 'quarantined');
  }
  executor = 'exited';
  assert.equal((await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock })).kind, 'acquired');
});

async function failedWriteCovered(t: TestContext, target: unknown, failing: FakeRunner['failing']) {
  const f = quarantinedAndroidForward(t, { componentLiveness: () => 'exited' }, target);
  const runner = new FakeRunner(); runner.failing = failing;
  assert.deepEqual(await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  const failed = f.admission.readGeneration(f.claim.identity).commands.filter(command => command.state === 'uncertain');
  assert.equal(failed.length, 1);
  runner.failing = undefined;
  const { fenceAppium } = await fenceModule();
  let proof: Awaited<ReturnType<typeof fenceAppium>> | undefined;
  const second = await f.admission.acquireWithRecovery(f.request, async claim => proof = await fenceAppium({ admission: f.admission, claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }));
  assert.equal(second.kind, 'acquired');
  const view = f.admission.readGeneration(f.claim.identity);
  const covering = proof?.components.find(component => component.componentId === failed[0]!.componentId)?.proof;
  assert.equal(covering?.kind, 'fenced-write');
  const answer = view.commands.find(command => command.id === (covering as { commandId: string }).commandId)!;
  assert.equal(answer.state, 'settled');
  assert.equal(answer.recoveryClaimId, view.recoveries.at(-1)!.id);
  return { f, runner, view, answer };
}

test('a failed forward removal is covered when its executor exited and a readback shows the pair absent', async t => {
  const { f, runner, view, answer } = await failedWriteCovered(t, targets[3], 'forward-remove');
  assert.deepEqual(runner.forwards, [{ serial: 'foreign', local: 'tcp:19124', remote: 'tcp:6790' }]);
  assert.deepEqual((view.components.find(component => component.id === answer.componentId)!.declaration as { effect: unknown }).effect, { kind: 'forward-inventory' });
  assert.deepEqual(view.recoveries.map(recovery => recovery.closure), ['refused', 'accepted']);
  assert.equal(f.admission.readAttempt(f.claim.identity.attempt)?.terminal?.outcome, 'inconclusive');
});

test('a failed settings write is covered when the readback equals the recorded values and its executor exited', async t => {
  const { f, runner, view, answer } = await failedWriteCovered(t, targets[4], 'settings-write');
  assert.deepEqual(runner.values, settings);
  assert.deepEqual((view.components.find(component => component.id === answer.componentId)!.declaration as { effect: unknown }).effect, { kind: 'settings-read', serial: 'serial-one' });
  assert.deepEqual(view.recoveries.map(recovery => recovery.closure), ['refused', 'accepted']);
});

test('a fenced write refuses a readback from an earlier claim or a read of another kind', async t => {
  const f = quarantinedAndroidForward(t, { componentLiveness: () => 'exited' });
  const runner = new FakeRunner(); runner.failing = 'forward-remove';
  await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  runner.failing = undefined;
  const earlier = f.admission.readGeneration(f.claim.identity);
  const failed = earlier.commands.find(command => command.state === 'uncertain')!;
  const stale = earlier.commands.find(command => command.state === 'settled')!;
  const recovery = f.admission.claimRecovery(f.claim.identity, 'forged-write'); if (recovery.kind === 'refused') assert.fail();
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  const others = proof.components.filter(component => component.componentId !== failed.componentId);
  const settingsRead = { id: 'forged-read', kind: 'appium-fence-command', effect: { kind: 'settings-read', serial: 'serial-one' } };
  await recovery.claim.dispatch({ requestId: 'forged-read', componentId: 'forged-read', operation: 'appium-fence', payload: {}, recordResult: true, components: [JSON.parse(JSON.stringify(settingsRead))] }, async () => settings);
  const otherKind = f.admission.readGeneration(f.claim.identity).commands.at(-1)!;
  for (const commandId of [stale.id, otherKind.id]) {
    const forged = { ...proof, components: [...others, { componentId: failed.componentId!, proof: { kind: 'fenced-write' as const, commandId } }, { componentId: 'forged-read', proof: { kind: 'completed-command' as const, commandId: otherKind.id } }] };
    assert.throws(() => recovery.claim.submitFence(forged), { code: 'COVERAGE_INCOMPLETE' });
  }
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});

test('a failed write whose readback shows the old state is not covered', async t => {
  const f = quarantinedAndroidForward(t, { componentLiveness: () => 'exited' }, targets[4]);
  const runner = new FakeRunner(); runner.failing = 'settings-write';
  assert.deepEqual(await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  runner.values.hidden_api_policy = '1';
  runner.failing = 'settings-write';
  assert.deepEqual(await f.admission.acquireWithAppiumRecovery(f.request, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});

test('host inventory polling backs off and stops after twelve reads', async t => {
  const f = fixture(t); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[0])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'poll-cap'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner(); runner.resistTerm = true; runner.ignoreKill = true;
  const { fenceAppium } = await fenceModule();
  await assert.rejects(() => fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), /poll cap/);
  const operations = runner.events.map(event => 'kind' in event ? event.kind : `wait ${event.wait}`);
  const afterKill = operations.slice(operations.lastIndexOf('host-signal') + 1);
  assert.deepEqual(afterKill.filter(operation => operation.startsWith('wait')), ['wait 500', 'wait 1000', 'wait 2000', 'wait 4000', 'wait 4000', 'wait 4000', 'wait 4000', 'wait 4000', 'wait 4000', 'wait 4000', 'wait 4000']);
  assert.equal(afterKill.filter(operation => operation === 'host-inventory').length, 12);
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});

test('recorded host inventories hold only the rows that concern the target', async t => {
  for (const [target, expected] of [[targets[0], [100, 101, 102]], [targets[5], [400]]] as const) {
    const { admission, claim, recovery, proof } = await prepared(t, [target]);
    recovery.submitFence(proof);
    const view = admission.readGeneration(claim.identity);
    const inventories = view.components.filter(component => (component.declaration as { effect?: { kind: string } }).effect?.kind === 'host-inventory')
      .map(component => (view.componentObservations.find(observation => observation.componentId === component.id)!.payload as { result: { pid: number }[] }).result.map(row => row.pid));
    assert.deepEqual(inventories[0], expected);
    assert.ok(inventories.every(pids => pids.every(pid => (expected as readonly number[]).includes(pid))), `stored ${JSON.stringify(inventories)}`);
    assert.equal(state(admission, claim.identity), 'available');
  }
});

test('a hung runner is bounded by the cleanup budget and cannot release on a late reply', async t => {
  const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'hang'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner(); runner.hang = true;
  const { fenceAppium } = await fenceModule();
  await assert.rejects(() => fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, budgetMs: 10 }), /budget/i);
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});

test('dead-owner sweep acquires only after all Appium receipts and preserves the old outcome', async t => {
  const f = fixture(t, androidTargets); for (const target of androidTargets) f.claim.registerComponent(JSON.parse(JSON.stringify(target)));
  const runner = new FakeRunner();
  const result = await f.admission.acquireWithAppiumRecovery({ device: f.claim.identity.device, category: f.claim.identity.category, attempt: { kind: 'legacy', id: 'next' }, digest: 'next', intent: {} }, { runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
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
  const scope = (key: 'wda' | 'uiautomator2' | 'forwards') => key === 'wda' ? { udid: device } : { serial: 'serial-one' };
  assert.deepEqual(inspectForeignAutomation(owned, inventory, { udid: device }), { kind: 'available' });
  assert.deepEqual(inspectForeignAutomation(owned, inventory, { serial: 'serial-one' }), { kind: 'available' });
  for (const key of ['wda', 'uiautomator2', 'forwards'] as const) {
    const modified = structuredClone(inventory);
    if (key === 'wda') modified.wda[0]!.pid = 999;
    if (key === 'uiautomator2') modified.uiautomator2[0]!.startTime = '999';
    if (key === 'forwards') modified.forwards[0]!.local = 'tcp:8200';
    assert.deepEqual(inspectForeignAutomation(owned, modified, scope(key)), { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 });
  }
});

test('automation on another device or a non-automation forward is never foreign', async () => {
  const { inspectForeignAutomation } = await fenceModule();
  const elsewhere = { wda: [{ udid: 'ABCDEF00-0000-4000-8000-000000000002', bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner', pid: 777 }],
    uiautomator2: [{ serial: 'serial-two', pid: 300, startTime: '999' }],
    forwards: [{ serial: 'serial-two', local: 'tcp:8200', remote: 'tcp:6790' }, { serial: 'serial-one', local: 'tcp:8081', remote: 'tcp:8081' }] };
  assert.deepEqual(inspectForeignAutomation([], elsewhere, { udid: device }), { kind: 'available' });
  assert.deepEqual(inspectForeignAutomation([], elsewhere, { serial: 'serial-one' }), { kind: 'available' });
  assert.deepEqual(inspectForeignAutomation([], elsewhere, { serial: 'serial-two' }), { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 });
  assert.deepEqual(inspectForeignAutomation([], { ...elsewhere, forwards: [{ serial: 'serial-one', local: 'tcp:8201', remote: 'tcp:7810' }] }, { serial: 'serial-one' }), { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 });
});

test('a forward row with the owned local port but another serial or remote proves the owned pair is gone', async t => {
  for (const other of [{ serial: 'other', local: 'tcp:19123', remote: 'tcp:6790' }, { serial: 'serial-one', local: 'tcp:19123', remote: 'tcp:9999' }]) {
    const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
    f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
    const recovery = f.admission.claimRecovery(f.claim.identity, 'pair'); if (recovery.kind === 'refused') assert.fail();
    const runner = new FakeRunner(); runner.forwards = [other];
    const { fenceAppium } = await fenceModule();
    const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
    recovery.claim.submitFence(proof);
    assert.deepEqual(runner.events.map(event => 'kind' in event ? event.kind : 'wait'), ['forward-inventory']);
    assert.deepEqual(runner.forwards, [other]);
    assert.equal(state(f.admission, f.claim.identity), 'available');
  }
});

test('leftover owned forward is absent before the next create and an unrelated forward survives', async t => {
  const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
  const runner = new FakeRunner();
  const { clearOwnedForwards } = await fenceModule();
  const session = f.claim.bindDriver('fake');
  const proofs = await clearOwnedForwards({ admission: f.admission, claim: f.claim, dispatcher: session, runner: runner.run, revalidate: runner.revalidate });
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
  assert.deepEqual(f.admission.inspectAppiumAutomation({ category: 'android-phone', value: 'unowned-device' }, inventory), { kind: 'available' });
  const busy = { ...inventory, uiautomator2: [{ serial: 'unowned-device', pid: 300, startTime: '12345' }] };
  assert.deepEqual(f.admission.inspectAppiumAutomation({ category: 'android-phone', value: 'unowned-device' }, busy), { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 });
  assert.deepEqual(f.admission.inspectAppiumAutomation({ category: 'android-phone', value: 'serial-one' }, busy), { kind: 'available' });
  assert.deepEqual(f.admission.inspectAppiumAutomation({ category: 'android-emulator', value: '/avd/one.avd' }, busy, { serial: 'unowned-device' }), { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 });
  assert.throws(() => f.admission.inspectAppiumAutomation({ category: 'android-emulator', value: '/avd/one.avd' }, busy), { code: 'INVALID_REQUEST' });
});

test('startup forward cleanup has its own bounded budget even with a caller signal', async t => {
  const f = fixture(t, [targets[3]]); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[3])));
  const runner = new FakeRunner(); runner.hang = true;
  const { clearOwnedForwards } = await fenceModule();
  const session = f.claim.bindDriver('fake');
  await assert.rejects(() => clearOwnedForwards({ admission: f.admission, claim: f.claim, dispatcher: session, runner: runner.run, revalidate: runner.revalidate,
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
  const proofs = await clearOwnedForwards({ admission: f.admission, claim: f.claim, dispatcher: f.claim.bindDriver('fake'), runner: runner.run, revalidate: runner.revalidate });
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
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  recovery.claim.submitFence(proof);
  assert.deepEqual(runner.hosts.map(row => row.pid), [400, 999]);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});

test('an inherited marker never grants ownership of a shared adb server', async t => {
  const f = fixture(t); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[0])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'shared'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner();
  runner.hosts.push(JSON.parse(JSON.stringify({ pid: 500, startTime: 'shared-adb', ppid: 1, pgid: 500, state: 'running', executable: '/usr/bin/adb', sharedService: true,
    runMarker: '0123456789abcdef0123456789abcdef', launchChain: [{ pid: 100, startTime: 'host-100' }] })));
  const { fenceAppium } = await fenceModule();
  const proof = await fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock });
  recovery.claim.submitFence(proof);
  assert.deepEqual(runner.hosts.map(row => row.pid), [400, 999, 500]);
  assert.equal(state(f.admission, f.claim.identity), 'available');
});

test('a descendant with inconsistent launch attestation remains quarantined', async t => {
  const f = fixture(t); f.claim.registerComponent(JSON.parse(JSON.stringify(targets[0])));
  f.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const recovery = f.admission.claimRecovery(f.claim.identity, 'unattested'); if (recovery.kind === 'refused') assert.fail();
  const runner = new FakeRunner();
  runner.hosts.push(JSON.parse(JSON.stringify({ pid: 103, startTime: 'orphan-103', ppid: 1, pgid: 103, state: 'running', executable: '/escaped',
    launchChain: [{ pid: 100, startTime: 'host-100' }] })));
  const { fenceAppium } = await fenceModule();
  await assert.rejects(() => fenceAppium({ admission: f.admission, claim: recovery.claim, runner: runner.run, revalidate: runner.revalidate, clock: runner.clock }), /attestation/i);
  assert.equal(state(f.admission, f.claim.identity), 'quarantined');
});
