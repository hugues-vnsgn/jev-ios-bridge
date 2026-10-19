import { fakeSimulatorProbe } from './fixtures/android-device.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AllocationReservationInput } from '../src/device/admission-allocation.js';
import { createPreparationDriver, createObservedDriver } from '../src/device/factory.js';
import { Admission } from '../src/device/admission.js';
import { MobileBuildMcpDriver, deviceWindowOpener, DeviceCliError, type CliRunner, type MobileBuildMcpDriverOptions } from '../src/device/index.js';

const udid = 'ABCDEF00-0000-4000-8000-000000000001';
const context = { app: { bundleId: 'dev.fixture' }, device: { udid }, values: {} };
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-driver-')));
  mkdirSync(join(root, 'store'), { mode: 0o700 });
  return { root, admission: Admission.forTesting({ root: join(root, 'store'), backend: 'fake' }) };
}
function response(args: string[]) {
  const operation = args[1];
  const schema = operation === 'launch-app' ? 'launch-result' : operation === 'stop' ? 'stop-result' : 'capture-result';
  return { stdout: JSON.stringify({ schema: `mobilebuildmcp.output.${schema}`, schemaVersion: '2', didError: false,
    data: { artifacts: { simulatorId: udid }, capture: { type: 'runtime-snapshot', rs: '1', count: 0, targets: [] } } }), stderr: '', exitCode: 0 };
}
function driver(root: string, admission: Admission, runner: CliRunner, extra: Partial<MobileBuildMcpDriverOptions> = {}) {
  return new MobileBuildMcpDriver({ cwd: root, lockRoot: join(root, 'leases'), admission, runner, deviceWindow: async () => {},
    identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined }, ...extra });
}
test('a competing durable observed owner blocks legacy preparation before every device effect', async () => {
  const { root, admission } = fixture(); let calls = 0;
  const claim = admission.acquire({ device: udid, attempt: { kind: 'observed', id: 'one' }, digest: 'one', intent: {} });
  assert.equal(claim.kind, 'acquired');
  const subject = driver(root, admission, async args => { calls++; return response(args); });
  try {
    await assert.rejects(subject.prepare(context, new AbortController().signal), /busy/i);
    assert.equal(calls, 0);
    assert.equal(admission.inspect(udid)?.state, 'active');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const digest = 'a'.repeat(64);
function reservationInput(): AllocationReservationInput {
  return { actionId: 'allocated', preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'create', deviceTypeId: 'device-type', runtimeId: 'runtime' }, inspectedContentDigest: digest,
    artifactBytes: 100, configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/evidence',
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800,
      maxReservedBytes: 6400, minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000,
      installTimeoutMs: 120000, launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } };
}
async function preparation(admission: Admission) {
  const result = admission.reserveAllocation(reservationInput());
  assert.equal(result.kind, 'reserved'); if (result.kind !== 'reserved') throw new Error('reserve');
  const reservation = result.reservation;
  reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'host' } } });
  await reservation.create(async () => ({ status: 'created', udid, provenance: { kind: 'simctl-create',
    allocationId: reservation.identity.allocationId, name: `jev-observed-${reservation.identity.allocationId}`,
    deviceTypeId: 'device-type', runtimeId: 'runtime' } }));
  const admitted = reservation.admit();
  assert.equal(admitted.kind, 'admitted'); if (admitted.kind !== 'admitted') throw new Error('admit');
  return { claim: admitted.claim, id: reservation.identity.allocationId };
}

test('preparation inventory exposes selected availability without booting or presenting', async () => {
  const { root, admission } = fixture(); const calls: string[] = [];
  const runner: CliRunner = async args => {
    calls.push(args[1]!);
    return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
      data: { simulators: [{ simulatorId: udid.toLowerCase(), state: 'Shutdown', isAvailable: true }] } }), stderr: '', exitCode: 0 };
  };
  const { claim } = await preparation(admission);
  const subject = createPreparationDriver({ cwd: root, lockRoot: join(root, 'leases'), admission, runner,
    identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined } });
  try {
    await subject.attachPreparation(claim, context, new AbortController().signal);
    assert.deepEqual(await subject.inventoryStatus(new AbortController().signal), { state: 'Shutdown', isAvailable: true });
    assert.deepEqual(calls, ['list']);
    await subject.close(new AbortController().signal);
    assert.deepEqual(calls, ['list']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('malformed inventory error receipt cannot settle or authorize a later boot', async () => {
  const { root, admission } = fixture(); const calls: string[] = [];
  const runner: CliRunner = async args => {
    calls.push(args[1]!);
    return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2', didError: true,
      error: { code: 'INVENTORY_ERROR', message: 'Unavailable' },
      data: { simulators: [{ simulatorId: udid, state: 'Shutdown' }] } }), stderr: '', exitCode: 1 };
  };
  const { claim } = await preparation(admission);
  const subject = createPreparationDriver({ cwd: root, lockRoot: join(root, 'leases'), admission, runner,
    identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined } });
  try {
    await subject.attachPreparation(claim, context, new AbortController().signal);
    await assert.rejects(subject.inventoryStatus(new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && !error.terminalAcknowledged);
    await assert.rejects(subject.boot(new AbortController().signal));
    await assert.rejects(subject.close(new AbortController().signal));
    assert.deepEqual(calls, ['list']);
    assert.ok(readFileSync(join(root, 'leases', `${udid}.lock`)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [name, entries, expected] of [
  ['unavailable selected identity', [{ simulatorId: udid, state: 'Shutdown', isAvailable: false }], { state: 'Shutdown', isAvailable: false }],
  ['missing selected identity', [{ simulatorId: 'ABCDEF00-0000-4000-8000-000000000002', state: 'Booted', isAvailable: true }], undefined],
  ['empty inventory', [], undefined],
] as const) {
  test(`preparation inventory reports ${name} without a device mutation`, async () => {
    const { root, admission } = fixture(); const calls: string[] = [];
    const runner: CliRunner = async args => {
      calls.push(args[1]!);
      return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
        data: { simulators: entries } }), stderr: '', exitCode: 0 };
    };
    const { claim } = await preparation(admission);
    const subject = createPreparationDriver({ cwd: root, lockRoot: join(root, 'leases'), admission, runner,
      identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined } });
    try {
      await subject.attachPreparation(claim, context, new AbortController().signal);
      assert.deepEqual(await subject.inventoryStatus(new AbortController().signal), expected);
      await subject.close(new AbortController().signal);
      assert.deepEqual(calls, ['list']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

for (const [name, entries] of [
  ['missing availability', [{ simulatorId: udid, state: 'Shutdown' }]],
  ['string availability', [{ simulatorId: udid, state: 'Shutdown', isAvailable: 'true' }]],
  ['numeric availability', [{ simulatorId: udid, state: 'Shutdown', isAvailable: 1 }]],
  ['null availability', [{ simulatorId: udid, state: 'Shutdown', isAvailable: null }]],
  ['duplicate selected identity', [{ simulatorId: udid, state: 'Shutdown', isAvailable: true },
    { simulatorId: udid.toLowerCase(), state: 'Shutdown', isAvailable: false }]],
] as const) {
  test(`malformed inventory (${name}) retains uncertainty with no later boot`, async () => {
    const { root, admission } = fixture(); const calls: string[] = [];
    const runner: CliRunner = async args => {
      calls.push(args[1]!);
      return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
        data: { simulators: entries } }), stderr: '', exitCode: 0 };
    };
    const { claim } = await preparation(admission);
    const subject = createPreparationDriver({ cwd: root, lockRoot: join(root, 'leases'), admission, runner,
      identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined } });
    try {
      await subject.attachPreparation(claim, context, new AbortController().signal);
      await assert.rejects(subject.inventoryStatus(new AbortController().signal),
        (error: unknown) => error instanceof DeviceCliError && !error.terminalAcknowledged);
      await assert.rejects(subject.boot(new AbortController().signal));
      await assert.rejects(subject.close(new AbortController().signal));
      assert.deepEqual(calls, ['list']);
      assert.ok(readFileSync(join(root, 'leases', `${udid}.lock`)));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('durable preparation cancellation prevents inventory dispatch', async () => {
  const { root, admission } = fixture(); let calls = 0;
  const runner: CliRunner = async args => { calls++; return response(args); };
  const { claim } = await preparation(admission);
  const subject = createPreparationDriver({ cwd: root, lockRoot: join(root, 'leases'), admission, runner,
    identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined } });
  try {
    await subject.attachPreparation(claim, context, new AbortController().signal);
    claim.cancel();
    await assert.rejects(subject.inventoryStatus(new AbortController().signal));
    await assert.rejects(subject.boot(new AbortController().signal));
    assert.equal(calls, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('lost inventory reply fences boot and retains the lease after a late valid reply', async () => {
  const { root, admission } = fixture(); const calls: string[] = [];
  let release!: (value: ReturnType<typeof response>) => void;
  const pending = new Promise<ReturnType<typeof response>>(resolve => { release = resolve; });
  const runner: CliRunner = async args => { calls.push(args[1]!); return pending; };
  const { claim } = await preparation(admission);
  const subject = createPreparationDriver({ cwd: root, lockRoot: join(root, 'leases'), admission, runner,
    identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined } });
  try {
    await subject.attachPreparation(claim, context, new AbortController().signal);
    await assert.rejects(subject.inventoryStatus(new AbortController().signal, 5));
    await assert.rejects(subject.boot(new AbortController().signal));
    await assert.rejects(subject.close(new AbortController().signal));
    const path = join(root, 'leases', `${udid}.lock`); const held = readFileSync(path, 'utf8');
    release({ stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
      data: { simulators: [{ simulatorId: udid, state: 'Shutdown', isAvailable: true }] } }), stderr: '', exitCode: 0 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await assert.rejects(subject.boot(new AbortController().signal));
    assert.equal(readFileSync(path, 'utf8'), held);
    assert.deepEqual(calls, ['list']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
// Real store capability and fake system effects are the seams; no driver internals are mocked.
test('preparation parks settled ownership and a consumed action attaches without relaunch or window', async () => {
  const { root, admission } = fixture(); const calls: string[] = [];
  const runner: CliRunner = async args => {
    calls.push(args[1]!);
    if (args[1] === 'list') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
      data: { simulators: [{ simulatorId: udid, state: 'Booted' }] } }), stderr: '', exitCode: 0 };
    const value = response(args);
    if (['boot', 'install'].includes(args[1]!)) value.stdout = JSON.stringify({ schema: `mobilebuildmcp.output.${args[1] === 'boot' ? 'simulator-action-result' : 'install-result'}`,
      schemaVersion: '2', data: { artifacts: { simulatorId: udid } } });
    return value;
  };
  const p = await preparation(admission);
  const options: MobileBuildMcpDriverOptions = { cwd: root, lockRoot: join(root, 'leases'), admission, runner,
    deviceWindow: async () => {}, identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window: undefined } };
  const preparer = createPreparationDriver(options);
  try {
    const preparationSignal = new AbortController().signal;
    await preparer.attachPreparation(p.claim, context, preparationSignal);
    assert.equal(getEventListeners(preparationSignal, 'abort').length, 1);
    assert.deepEqual(calls, []);
    await preparer.boot(new AbortController().signal);
    assert.equal(await preparer.bootState(new AbortController().signal), 'Booted');
    await preparer.install('/isolated/Fixture.app', new AbortController().signal);
    await preparer.launch(new AbortController().signal);
    await preparer.readiness(new AbortController().signal);
    const parked = await preparer.park(['/isolated/evidence/readiness.json'], [], new AbortController().signal);
    assert.equal(parked.authority, 'committed');
    assert.equal(getEventListeners(preparationSignal, 'abort').length, 0);
    const consumed = admission.consumeAllocation({ allocationId: p.id, actionId: 'allocated', actionDigest: digest,
      request: {}, appBundleId: 'dev.fixture', evidence: { bridgeVersion: 'fixture', directory: '/isolated/action', request: '/isolated/action/request.json' } });
    assert.equal(consumed.kind, 'consumed'); if (consumed.kind !== 'consumed') throw new Error('consume');
    const action = createObservedDriver(options); const before = [...calls];
    const actionSignal = new AbortController().signal;
    await action.attachObserved(consumed.claim, context, actionSignal);
    assert.equal(getEventListeners(actionSignal, 'abort').length, 1);
    assert.deepEqual(calls, before);
    await assert.rejects(preparer.boot(new AbortController().signal));
    await action.observe(new AbortController().signal);
    assert.deepEqual(calls.slice(before.length), ['snapshot-ui']);
    await action.close(new AbortController().signal);
    assert.equal(getEventListeners(actionSignal, 'abort').length, 0);
    assert.deepEqual(calls.slice(before.length), ['snapshot-ui']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy cancellation aborts the caller wait and late transport settlement cannot dispatch cleanup', async () => {
  const { root, admission } = fixture(); const calls: string[] = [];
  let began!: () => void; let release!: (value: ReturnType<typeof response>) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const pending = new Promise<ReturnType<typeof response>>(resolve => { release = resolve; });
  const subject = driver(root, admission, async args => { calls.push(args[1]!); if (args[1] === 'snapshot-ui') { began(); return pending; } return response(args); });
  try {
    await subject.prepare(context, new AbortController().signal);
    const cancel = new AbortController(); const capture = subject.observe(cancel.signal);
    const outcome = capture.then(() => 'resolved', () => 'rejected');
    await started; cancel.abort();
    assert.equal(await Promise.race([outcome, new Promise<string>(resolve => setTimeout(() => resolve('still pending'), 100))]), 'rejected');
    await assert.rejects(subject.close(AbortSignal.timeout(100)), /unknown/);
    const before = [...calls]; release(response(['ui-automation', 'snapshot-ui']));
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(subject.observe(new AbortController().signal));
    await assert.rejects(subject.close(new AbortController().signal), /unknown/);
    assert.deepEqual(calls, before);
    assert.equal(admission.inspect(udid)?.state, 'quarantined');
  } finally { release(response(['ui-automation', 'snapshot-ui'])); rmSync(root, { recursive: true, force: true }); }
});

test('test authority rejects the real runner or real presentation before backend access', () => {
  const { root, admission } = fixture();
  try {
    assert.throws(() => new MobileBuildMcpDriver({ cwd: root, admission }), /fake runner/);
    const fake: CliRunner = async () => assert.fail('No backend construction effect');
    assert.throws(() => new MobileBuildMcpDriver({ cwd: root, admission, runner: fake }), /fake runner/);
    const realWindow = deviceWindowOpener(false, {})!;
    assert.throws(() => new MobileBuildMcpDriver({ cwd: root, admission, runner: fake, deviceWindow: realWindow }), /fake runner/);
    assert.throws(() => new MobileBuildMcpDriver({ cwd: root, admission, runner: fake, deviceWindow: realWindow,
      identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner: fake, window: realWindow } }), /injected runner and window opener/);
    assert.throws(() => new MobileBuildMcpDriver({ cwd: root, admission, identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner: fake } as never }), /window opener/);
    assert.throws(() => new MobileBuildMcpDriver({ cwd: root, identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner: fake, window: undefined } }), /isolated admission/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy admission excludes competing observed and preparation owners until confirmed close', async () => {
  const { root, admission } = fixture(); const subject = driver(root, admission, async args => response(args));
  try {
    await subject.prepare(context, new AbortController().signal);
    for (const kind of ['observed', 'preparation'] as const) {
      assert.deepEqual(admission.acquire({ device: udid.toLowerCase(), attempt: { kind, id: kind }, digest: kind, intent: {} }),
        { kind: 'refused', reason: 'DEVICE_BUSY' });
    }
    await subject.close(new AbortController().signal);
    assert.equal(admission.inspect(udid)?.state, 'available');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unknown creation blocks legacy attachment before launch, selected listing and presentation', async () => {
  const { root, admission } = fixture(); const reserved = admission.reserveAllocation(reservationInput());
  assert.equal(reserved.kind, 'reserved'); if (reserved.kind !== 'reserved') throw new Error('reserve');
  reserved.reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'host' } } });
  await reserved.reservation.create(async () => ({ status: 'unknown', reason: 'CREATE_UNCONFIRMED' }));
  const runner: CliRunner = async () => assert.fail('Host guard prevents every backend');
  const window = async () => assert.fail('Host guard prevents window');
  const subject = driver(root, admission, runner, { identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window }, deviceWindow: window });
  try { await assert.rejects(subject.prepare(context, new AbortController().signal), /HOST_CREATION_UNRESOLVED/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

for (const phase of ['list', 'window', 'launch-app', 'snapshot-ui', 'stop'] as const) {
  test(`cancellation during ${phase} revokes all following selected-device effects`, async () => {
    const { root, admission } = fixture(); const calls: string[] = [];
    let began!: () => void; let late!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    const pending = new Promise<void>(resolve => { late = resolve; });
    const effect = async (operation: string) => { calls.push(operation); if (phase === operation) { began(); await pending; } };
    const runner: CliRunner = async args => {
      await effect(args[1]!);
      if (args[1] === 'list') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
        data: { simulators: [{ simulatorId: udid, state: 'Booted' }] } }), stderr: '', exitCode: 0 };
      return response(args);
    };
    const window = async () => effect('window');
    const subject = driver(root, admission, runner, { identityProbe: fakeSimulatorProbe(udid), fakeBackend: { runner, window }, deviceWindow: window });
    try {
      const cancel = new AbortController();
      if (phase === 'snapshot-ui' || phase === 'stop') await subject.prepare(context, new AbortController().signal);
      const operation = phase === 'snapshot-ui' ? subject.observe(cancel.signal) : phase === 'stop' ? subject.close(cancel.signal) : subject.prepare(context, cancel.signal);
      const rejected = assert.rejects(operation); await started; cancel.abort(); await rejected;
      const before = [...calls]; late(); await new Promise(resolve => setImmediate(resolve));
      await assert.rejects(subject.close(new AbortController().signal), /unknown/);
      assert.deepEqual(calls, before);
      assert.equal(admission.inspect(udid)?.state, 'quarantined');
    } finally { late(); rmSync(root, { recursive: true, force: true }); }
  });
}

async function consumed(admission: Admission) {
  const p = await preparation(admission); const session = p.claim.bindDriver('fake');
  for (const kind of ['boot', 'install', 'launch', 'readiness']) await session.dispatch(kind, async () => true);
  assert.equal(p.claim.park(['/isolated/readiness.json']).authority, 'committed');
  const result = admission.consumeAllocation({ allocationId: p.id, actionId: 'allocated', actionDigest: digest,
    request: {}, appBundleId: 'dev.fixture', evidence: { bridgeVersion: 'fixture', directory: '/isolated/action', request: '/isolated/action/request.json' } });
  assert.equal(result.kind, 'consumed'); if (result.kind !== 'consumed') throw new Error('consume'); return result;
}
const touchSnapshot = () => ({ deviceId: udid, capturedAt: Date.now(), expiresAt: Date.now() + 60000, sequence: 1, truncated: false,
  elements: [{ ref: 'one', role: 'button' as const, actions: ['tap', 'touch'] }] });
test('consumed observed ownership authorizes one touch even when the caller submits twice', async () => {
  const { root, admission } = fixture(); const c = await consumed(admission); const calls: string[] = [];
  const runner: CliRunner = async args => {
    calls.push(args[1]!); return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.ui-action-result', schemaVersion: '2',
      data: { action: { type: 'touch' }, artifacts: { simulatorId: udid } } }), stderr: '', exitCode: 0 };
  };
  const subject = driver(root, admission, runner);
  try {
    await subject.attachObserved(c.claim, context, new AbortController().signal);
    await subject.tapOnce('one', touchSnapshot(), context, new AbortController().signal);
    await assert.rejects(subject.tapOnce('one', touchSnapshot(), context, new AbortController().signal), /Tap already authorized/);
    assert.deepEqual(calls, ['touch']);
    await subject.close(new AbortController().signal);
    assert.equal(admission.inspect(udid)?.state, 'active', 'Runtime still owns terminal publication');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('observed late touch cannot authorize polling, fallback, cleanup or a second touch', async () => {
  const { root, admission } = fixture(); const c = await consumed(admission); const calls: string[] = [];
  let began!: () => void; let late!: (value: ReturnType<typeof response>) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const pending = new Promise<ReturnType<typeof response>>(resolve => { late = resolve; });
  const subject = driver(root, admission, async args => { calls.push(args[1]!); began(); return pending; });
  try {
    await subject.attachObserved(c.claim, context, new AbortController().signal);
    const cancel = new AbortController(); const tap = subject.tapOnce('one', touchSnapshot(), context, cancel.signal);
    const rejected = assert.rejects(tap); await started; cancel.abort(); await rejected;
    c.claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: { reason: 'CANCELLED' }, evidenceRefs: [] });
    late({ stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.ui-action-result', schemaVersion: '2', data: { action: { type: 'touch' }, artifacts: { simulatorId: udid } } }), stderr: '', exitCode: 0 });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(subject.observe(new AbortController().signal));
    await assert.rejects(subject.tapOnce('one', touchSnapshot(), context, new AbortController().signal));
    await assert.rejects(subject.close(new AbortController().signal), /unknown/);
    assert.deepEqual(calls, ['touch']); assert.equal(admission.inspect(udid)?.state, 'quarantined');
    assert.equal(admission.readAllocation(c.allocation.allocationId)?.actionEvidence?.state, 'terminal');
  } finally { late(response(['ui-automation', 'touch'])); rmSync(root, { recursive: true, force: true }); }
});

for (const phase of ['boot', 'install', 'launch-app', 'readiness'] as const) {
  test(`cancelled preparation ${phase} cannot proceed or park after a late receipt`, async () => {
    const { root, admission } = fixture(); const p = await preparation(admission); const calls: string[] = [];
    let began!: () => void; let late!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    const pending = new Promise<void>(resolve => { late = resolve; });
    const runner: CliRunner = async args => {
      calls.push(args[1]!);
      if (args[1] === phase || (phase === 'readiness' && args[1] === 'list')) { began(); await pending; }
      if (args[1] === 'list') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
        data: { simulators: [{ simulatorId: udid, state: 'Booted' }] } }), stderr: '', exitCode: 0 };
      if (args[1] === 'boot' || args[1] === 'install') return { stdout: JSON.stringify({ schema: `mobilebuildmcp.output.${args[1] === 'boot' ? 'simulator-action-result' : 'install-result'}`,
        schemaVersion: '2', data: { artifacts: { simulatorId: udid } } }), stderr: '', exitCode: 0 };
      return response(args);
    };
    const subject = driver(root, admission, runner);
    try {
      await subject.attachPreparation(p.claim, context, new AbortController().signal);
      if (phase !== 'boot') await subject.boot(new AbortController().signal);
      if (phase === 'launch-app' || phase === 'readiness') await subject.install('/isolated/Fixture.app', new AbortController().signal);
      if (phase === 'readiness') await subject.launch(new AbortController().signal);
      const cancel = new AbortController();
      const operation = phase === 'boot' ? subject.boot(cancel.signal) : phase === 'install' ? subject.install('/isolated/Fixture.app', cancel.signal)
        : phase === 'launch-app' ? subject.launch(cancel.signal) : subject.readiness(cancel.signal);
      const rejected = assert.rejects(operation); await started; cancel.abort(); await rejected;
      const before = [...calls]; late(); await new Promise(resolve => setImmediate(resolve));
      await assert.rejects(subject.install('/isolated/Fixture.app', new AbortController().signal));
      await assert.rejects(subject.park(['/isolated/readiness.json'], [], new AbortController().signal));
      p.claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: { reason: 'CANCELLED' }, evidenceRefs: [] });
      assert.deepEqual(calls, before); assert.equal(admission.inspect(udid)?.state, 'quarantined');
      assert.equal(admission.readAllocation(p.id)?.state, 'quarantined');
    } finally { late(); rmSync(root, { recursive: true, force: true }); }
  });
}

test('malformed snapshot content cannot authorize a stop or make legacy admission available', async () => {
  const { root, admission } = fixture(); const calls: string[] = [];
  const subject = driver(root, admission, async args => {
    calls.push(args[1]!);
    if (args[1] === 'snapshot-ui') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.capture-result', schemaVersion: '2',
      data: { artifacts: { simulatorId: udid }, capture: { bogus: true } } }), stderr: '', exitCode: 0 };
    return response(args);
  });
  try {
    await subject.prepare(context, new AbortController().signal);
    await assert.rejects(subject.observe(new AbortController().signal), /runtime snapshot/);
    await assert.rejects(subject.close(new AbortController().signal), /unknown/);
    assert.deepEqual(calls, ['launch-app', 'snapshot-ui']);
    assert.equal(admission.inspect(udid)?.state, 'quarantined');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('initialized but missing authority refuses legacy effects without alternate-root fallback', async () => {
  const { root, admission } = fixture(); rmSync(join(root, 'store', 'admission.sqlite'));
  const subject = driver(root, admission, async () => assert.fail('Missing authority cannot dispatch'));
  try { await assert.rejects(subject.prepare(context, new AbortController().signal), /unavailable|missing/i); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('a separate process consumes parked driver readiness without preparation or presentation', async () => {
  const { root, admission } = fixture(); const p = await preparation(admission);
  const runner: CliRunner = async args => {
    if (args[1] === 'list') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2',
      data: { simulators: [{ simulatorId: udid, state: 'Booted' }] } }), stderr: '', exitCode: 0 };
    if (args[1] === 'boot' || args[1] === 'install') return { stdout: JSON.stringify({ schema: `mobilebuildmcp.output.${args[1] === 'boot' ? 'simulator-action-result' : 'install-result'}`,
      schemaVersion: '2', data: { artifacts: { simulatorId: udid } } }), stderr: '', exitCode: 0 };
    return response(args);
  };
  const subject = driver(root, admission, runner);
  try {
    await subject.attachPreparation(p.claim, context, new AbortController().signal);
    await subject.boot(new AbortController().signal); await subject.install('/isolated/Fixture.app', new AbortController().signal);
    await subject.launch(new AbortController().signal); await subject.readiness(new AbortController().signal);
    assert.equal((await subject.park(['/isolated/readiness.json'], [], new AbortController().signal)).authority, 'committed');
    const source = `
import { Admission } from './src/device/admission.ts';
      import { MobileBuildMcpDriver } from './src/device/index.ts';
      const [root, id, device] = process.argv.slice(1);
      const admission = Admission.forTesting({root: root + '/store', backend:'fake', initialize:false});
      const consumed = admission.consumeAllocation({allocationId:id, actionId:'allocated', actionDigest:'a'.repeat(64), request:{}, appBundleId:'dev.fixture',
        evidence:{bridgeVersion:'fixture', directory:'/isolated/action', request:'/isolated/action/request.json'}});
      if(consumed.kind !== 'consumed') throw new Error('consume failed');
      const calls=[];
      const runner=async args=>{calls.push(args[1]);return {stdout:JSON.stringify({schema:'mobilebuildmcp.output.capture-result',schemaVersion:'2',
        data:{artifacts:{simulatorId:device},capture:{type:'runtime-snapshot',rs:'1',count:0,targets:[]}}}),stderr:'',exitCode:0};};
      const window=async()=>{throw new Error('Parked action must not open a window');};
      const driver=new MobileBuildMcpDriver({cwd:root,lockRoot:root+'/leases',admission,runner,deviceWindow:window,fakeBackend:{runner,window}});
      await driver.attachObserved(consumed.claim,{app:{bundleId:'dev.fixture'}},new AbortController().signal);
      const capture=await driver.observe(new AbortController().signal);
      consumed.claim.recordObservation(['/isolated/observation.json']);
      driver.revokeIssuance(); await driver.close(AbortSignal.timeout(5000));
      consumed.claim.beginFinalization();
      const terminal=consumed.claim.finalize({outcome:'observed',disposition:'available',payload:{outcome:'already_satisfied',reason:null},evidenceRefs:['/isolated/observation.json']});
      console.log(JSON.stringify({calls,device:capture.deviceId,authority:terminal.authority}));
    `;
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', source, root, p.id, udid],
      { cwd: process.cwd(), env: { PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { calls: ['snapshot-ui'], device: udid, authority: 'committed' });
    assert.equal(admission.readAllocation(p.id)?.state, 'retained');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const ownership of ['preparation', 'observed'] as const) {
  test(`uncertain ${ownership} close removes attach listeners while retaining the pending operation and lease`, async () => {
    const { root, admission } = fixture();
    const claim = ownership === 'preparation' ? (await preparation(admission)).claim : (await consumed(admission)).claim;
    const attach = new AbortController(); const cancel = new AbortController(); const calls: string[] = [];
    let began!: () => void; let late!: () => void; let settled = false;
    const started = new Promise<void>(resolve => { began = resolve; });
    const pending = new Promise<void>(resolve => { late = resolve; });
    const runner: CliRunner = async args => {
      calls.push(args[1]!); began(); await pending; settled = true;
      if (args[1] === 'boot') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-action-result', schemaVersion: '2',
        data: { artifacts: { simulatorId: udid } } }), stderr: '', exitCode: 0 };
      return response(args);
    };
    const subject = driver(root, admission, runner);
    try {
      if (ownership === 'preparation') await subject.attachPreparation(claim as Awaited<ReturnType<typeof preparation>>['claim'], context, attach.signal);
      else await subject.attachObserved(claim as Awaited<ReturnType<typeof consumed>>['claim'], context, attach.signal);
      assert.equal(getEventListeners(attach.signal, 'abort').length, 1);
      const lease = join(root, 'leases', `${udid}.lock`); const held = readFileSync(lease, 'utf8');
      const operation = ownership === 'preparation' ? subject.boot(cancel.signal) : subject.observe(cancel.signal);
      const rejected = assert.rejects(operation); await started; cancel.abort(); await rejected;
      await assert.rejects(subject.close(new AbortController().signal), /unknown/);
      assert.equal(getEventListeners(attach.signal, 'abort').length, 0, 'Closed driver must stop watching its attach signal');
      assert.equal(settled, false, 'Listener cleanup cannot certify an abort-ignoring operation');
      assert.equal(readFileSync(lease, 'utf8'), held);
      attach.abort(); late(); await new Promise(resolve => setImmediate(resolve));
      await assert.rejects(subject.close(new AbortController().signal), /unknown/);
      assert.equal(readFileSync(lease, 'utf8'), held, 'Late settlement cannot release quarantined local ownership');
      assert.deepEqual(calls, [ownership === 'preparation' ? 'boot' : 'snapshot-ui']);
    } finally { late(); await new Promise(resolve => setImmediate(resolve)); rmSync(root, { recursive: true, force: true }); }
  });
}
