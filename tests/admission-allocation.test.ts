import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Admission } from '../src/device/admission.js';
import type { AllocationReservationInput } from '../src/device/admission-allocation.js';

const uuid = 'ABCDEF00-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
function input(actionId = 'one'): AllocationReservationInput {
  return { actionId, preparationDigest: digest, preparation: { version: 1, actionId }, appBundleId: 'dev.fixture',
    source: { kind: 'create', deviceTypeId: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0' },
    inspectedContentDigest: digest, artifactBytes: 100, configVersion: 1, configDigest: digest,
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800, maxReservedBytes: 6400, minFreeBytes: 2000, maxArtifactBytes: 200,
      createTimeoutMs: 60000, bootTimeoutMs: 120000, installTimeoutMs: 120000, launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 }, evidenceDirectory: '/isolated/evidence/one' };
}
function fixture(t: TestContext, dependencies: Parameters<typeof Admission.forTesting>[0] extends infer T ? Partial<T> : never = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'allocation-store-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission: Admission.forTesting({ ...dependencies, root, backend: 'fake' }) };
}
test('reservation globally binds identity; duplicates are pure retrieval and capacity refuses without consuming identity', t => {
  const { admission, root } = fixture(t);
  const result = admission.reserveAllocation(input());
  assert.equal(result.kind, 'reserved');
  if (result.kind !== 'reserved') return;
  const bytes = readFileSync(join(root, 'admission.sqlite'));
  const repeated = admission.reserveAllocation(input());
  assert.equal(repeated.kind, 'retrieved');
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), bytes);
  assert.deepEqual(admission.reserveAllocation({ ...input(), preparationDigest: 'b'.repeat(64) }), { kind: 'refused', reason: 'ACTION_ID_CONFLICT' });
  assert.deepEqual(admission.reserveAllocation(input('two')), { kind: 'refused', reason: 'BUDGET_EXHAUSTED' });
  assert.equal(admission.readAllocationForAction('two'), undefined);
  assert.equal(result.reservation.snapshot.capacityHeld, true);
  assert.equal(result.reservation.snapshot.device, null);
});
function staged() { return { stagedPath: '/isolated/staged/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
  metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64' as const, minimumOSVersion: '27.0', build: { id: 'build', origin: 'fixture' } } }; }
function created(id: string, device = uuid) { return { status: 'created' as const, udid: device, provenance: { kind: 'simctl-create' as const,
  allocationId: id, name: `jev-observed-${id}`, deviceTypeId: input().source.deviceTypeId, runtimeId: input().source.runtimeId } }; }
test('creation guard fences all new admissions and receipt binding is write-once; existing owner can finish', async t => {
  const { admission } = fixture(t);
  const old = admission.acquire({ device: 'ABCDEF00-0000-4000-8000-000000000002', attempt: { kind: 'legacy', id: 'old' }, digest: 'old', intent: {} });
  assert.equal(old.kind, 'acquired'); if (old.kind !== 'acquired') return;
  const oldSession = old.claim.bindDriver('fake');
  const result = admission.reserveAllocation(input()); assert.equal(result.kind, 'reserved'); if (result.kind !== 'reserved') return;
  result.reservation.stage(staged());
  let receipt!: (value: ReturnType<typeof created>) => void;
  const pending = result.reservation.create(() => new Promise(resolve => { receipt = resolve; }));
  assert.equal(admission.acquire({ device: uuid, attempt: { kind: 'legacy', id: 'new' }, digest, intent: {} }).kind, 'refused');
  assert.equal(admission.readAllocation(result.reservation.identity.allocationId)?.hostCreationBlocked, true);
  assert.equal(await oldSession.dispatch('capture', async () => 7), 7);
  receipt(created(result.reservation.identity.allocationId));
  assert.equal((await pending).status, 'created');
  assert.equal(admission.readAllocation(result.reservation.identity.allocationId)?.device, uuid);
  assert.equal(admission.readAllocation(result.reservation.identity.allocationId)?.hostCreationBlocked, false);
  let calls = 0; await assert.rejects(result.reservation.create(async () => { calls++; return created(result.reservation.identity.allocationId); }));
  assert.equal(calls, 0);
  assert.equal(result.reservation.admit().kind, 'admitted');
});
async function prepared(admission: Admission, actionId = 'one') {
  const result = admission.reserveAllocation(input(actionId)); assert.equal(result.kind, 'reserved'); if (result.kind !== 'reserved') throw new Error('reserve');
  result.reservation.stage(staged()); await result.reservation.create(async () => created(result.reservation.identity.allocationId));
  const admitted = result.reservation.admit(); assert.equal(admitted.kind, 'admitted'); if (admitted.kind !== 'admitted') throw new Error('admit');
  const session = admitted.claim.bindDriver('fake');
  for (const kind of ['boot', 'install', 'launch', 'readiness']) await session.dispatch(kind, async () => true);
  const parked = admitted.claim.park(['/isolated/evidence/readiness.json']); assert.equal(parked.authority, 'committed');
  return { reservation: result.reservation, claim: admitted.claim, session, id: result.reservation.identity.allocationId };
}
function binding(allocationId: string, actionId = 'one') { return { allocationId, actionId, actionDigest: digest, request: { actionId, allocationId, action: 'tap' }, appBundleId: 'dev.fixture',
  evidence: { bridgeVersion: '1.3.1', directory: '/isolated/evidence/action', request: '/isolated/evidence/action/request.json' } }; }
test('park revokes preparation, consume transfers one fresh attachment, success retains allocation and evidence authority', async t => {
  const { admission } = fixture(t);
  const p = await prepared(admission);
  assert.throws(() => p.session.dispatch('capture', async () => 1), /closed/i);
  const started = admission.consumeAllocation(binding(p.id)); assert.equal(started.kind, 'consumed'); if (started.kind !== 'consumed') return;
  const driver = started.claim.bindDriver('fake'); assert.throws(() => started.claim.bindDriver('fake'));
  started.claim.recordObservation(['/isolated/evidence/action/observation-1.json']);
  let resolve!: () => void; const pending = driver.dispatch('tap', () => new Promise<void>(r => { resolve = r; }));
  assert.equal(admission.readAction('one')?.kind, 'allocation');
  assert.equal(admission.readAllocation(p.id)?.actionEvidence?.actionAttempted, null);
  resolve(); await pending;
  started.claim.recordActionReceipt({ actionAttempted: true, actionAcknowledged: true });
  started.claim.beginFinalization();
  const terminal = started.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { outcome: 'outcome_observed', reason: null }, evidenceRefs: ['/isolated/evidence/action/observation-1.json'] });
  assert.equal(terminal.authority, 'committed');
  assert.equal(admission.readAllocation(p.id)?.state, 'retained');
  assert.equal(admission.readAllocation(p.id)?.outcome, 'action_completed');
  assert.equal(admission.consumeAllocation(binding(p.id)).kind, 'retrieved');
  assert.equal(admission.acquire({ device: uuid, attempt: { kind: 'legacy', id: 'successor' }, digest, intent: {} }).kind, 'refused');
  admission.recordActionExport('one', { status: 'failed' });
  const view = admission.readAction('one'); assert.equal(view?.kind, 'allocation');
  if (view?.kind === 'allocation') { assert.deepEqual(view.attempt?.terminal?.payload, { outcome: 'outcome_observed', reason: null }); assert.equal(view.allocation.actionEvidence?.exportStatus, 'failed'); }
  assert.throws(() => started.claim.recordObservation(['/late.json']));
});
test('cancellation fences reservation and action commands; parked readiness survives reads and expiry only transitions on consume', async t => {
  let now = 1000;
  const { admission } = fixture(t, { now: () => now });
  const first = admission.reserveAllocation(input()); assert.equal(first.kind, 'reserved'); if (first.kind !== 'reserved') return;
  admission.cancelAllocation(first.reservation.identity.allocationId);
  assert.throws(() => first.reservation.stage(staged()));
  assert.equal(first.reservation.fail('CANCELLED').authority, 'committed');
  assert.equal(admission.readAllocation(first.reservation.identity.allocationId)?.capacityHeld, false);
  const p = await prepared(admission, 'second');
  now = 301000;
  assert.equal(admission.readAllocation(p.id)?.state, 'ready');
  assert.deepEqual(admission.consumeAllocation(binding(p.id, 'second')), { kind: 'refused', reason: 'READY_EXPIRED' });
  assert.equal(admission.readAllocation(p.id)?.outcome, 'retired_unused');
  assert.equal(admission.readAllocation(p.id)?.actionDigest, null);
  assert.equal(admission.cancelAllocation(p.id).kind, 'retrieved');
});
test('cancelled dispatched preparation and abandoned creation retain uncertainty and capacity', async t => {
  const { admission } = fixture(t, { ownerLiveness: () => 'dead' });
  const r = admission.reserveAllocation(input()); assert.equal(r.kind, 'reserved'); if (r.kind !== 'reserved') return;
  r.reservation.stage(staged());
  let complete!: (value: ReturnType<typeof created>) => void;
  const creating = r.reservation.create(() => new Promise(resolve => { complete = resolve; }));
  admission.cancelAllocation(r.reservation.identity.allocationId);
  assert.equal(r.reservation.fail('CANCELLED').authority, 'committed');
  complete(created(r.reservation.identity.allocationId));
  assert.equal((await creating).status, 'unknown');
  const record = admission.readAllocation(r.reservation.identity.allocationId)!;
  assert.equal(record.state, 'quarantined'); assert.equal(record.capacityHeld, true); assert.equal(record.hostCreationBlocked, true); assert.equal(record.device, null);
});
function supplied(actionId = 'one', device = uuid): AllocationReservationInput {
  const base = input(actionId);
  return { ...base, source: { kind: 'supplied', inventoryId: `inventory-${actionId}`, udid: device, deviceTypeId: base.source.deviceTypeId, runtimeId: base.source.runtimeId,
    creation: { createdAt: '2026-10-08', origin: 'fixture', evidenceRef: '/isolated/provenance.json' }, attestation: { freshUnused: true, exclusive: true } } };
}
test('all protected UUIDs and duplicate inventory assignments are excluded independently of host admission availability', t => {
  const { admission } = fixture(t);
  for (const device of ['73997430-DB8A-48C8-8146-12320CE6AEFE','2FE383F2-2D0F-4286-8797-D3ACEFCD6220','6A8C5F93-F59A-456B-B157-10642209B734','0E42FDE2-5E09-42D3-9876-9EF0037FCBE7']) {
    assert.deepEqual(admission.reserveAllocation(supplied('protected', device)), { kind: 'refused', reason: 'INVENTORY_INELIGIBLE' });
  }
  const result = admission.reserveAllocation(supplied()); assert.equal(result.kind, 'reserved'); if (result.kind !== 'reserved') return;
  result.reservation.fail('ARTIFACT_INVALID');
  assert.deepEqual(admission.reserveAllocation(supplied('next')), { kind: 'refused', reason: 'INVENTORY_INELIGIBLE' });
  assert.equal(admission.acquire({ device: uuid.toLowerCase(), attempt: { kind: 'legacy', id: 'legacy' }, digest, intent: {} }).kind, 'refused');
});
for (const [field, value, reason] of [ ['maxReservedBytes', 799, 'INVALID_REQUEST'], ['simulatorFreeBytes', 2799, 'STORAGE_UNAVAILABLE'], ['stagingFreeBytes', 2899, 'STORAGE_UNAVAILABLE'], ['artifactBytes', 201, 'ARTIFACT_INVALID'] ] as const) {
  test(`budget prerequisite boundary ${field}=${value} does not reserve identity`, t => {
    const { admission } = fixture(t); const request = input();
    if (field === 'maxReservedBytes') { request.budgets.maxReservedBytes = value; assert.throws(() => admission.reserveAllocation(request)); }
    else { if (field === 'artifactBytes') request.artifactBytes = value; else request.storage[field] = value;
      assert.deepEqual(admission.reserveAllocation(request), { kind: 'refused', reason }); }
    assert.equal(admission.readAllocationForAction('one'), undefined);
  });
}
test('exact free-space boundary accepts and stored configuration/content binding is immutable', t => {
  const { admission } = fixture(t); const request = input(); request.storage = { simulatorFreeBytes: 2800, stagingFreeBytes: 2900 };
  const r = admission.reserveAllocation(request); assert.equal(r.kind, 'reserved'); if (r.kind !== 'reserved') return;
  assert.throws(() => r.reservation.stage({ ...staged(), contentDigest: 'b'.repeat(64) }));
  r.reservation.stage(staged()); assert.throws(() => r.reservation.stage(staged()));
  const changedConfig = input(); changedConfig.budgets.maxRetainedAllocations = 20; changedConfig.configDigest = 'b'.repeat(64);
  const duplicate = admission.reserveAllocation(changedConfig); assert.equal(duplicate.kind, 'retrieved');
  if (duplicate.kind === 'retrieved') assert.equal(duplicate.allocation.budgets.maxRetainedAllocations, 8);
});
for (const receipt of ['unknown','malformed','collision'] as const) test(`creation ${receipt} receipt retains host guard and capacity`, async t => {
  const { admission } = fixture(t); const r = admission.reserveAllocation(input()); if (r.kind !== 'reserved') throw new Error('reserve'); r.reservation.stage(staged());
  const result = await r.reservation.create(async () => receipt === 'unknown' ? { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }
    : created(r.reservation.identity.allocationId, receipt === 'malformed' ? 'garbage' : '73997430-DB8A-48C8-8146-12320CE6AEFE'));
  assert.equal(result.status, 'unknown'); const record = admission.readAllocation(r.reservation.identity.allocationId)!;
  assert.equal(record.hostCreationBlocked, true); assert.equal(record.capacityHeld, true); assert.equal(record.state, 'quarantined');
  assert.equal(admission.reserveAllocation(supplied('next')).kind, 'refused');
  assert.throws(() => r.reservation.admit());
});
test('unknown creation blocks ready consumption but exact action duplicate remains retrieval', async t => {
  const { admission } = fixture(t); const p = await prepared(admission); const next = admission.reserveAllocation(input('unknown')); if (next.kind !== 'reserved') throw new Error('reserve');
  next.reservation.stage(staged()); await next.reservation.create(async () => ({ status: 'unknown', reason: 'CREATE_UNCONFIRMED' }));
  assert.deepEqual(admission.consumeAllocation(binding(p.id)), { kind: 'refused', reason: 'HOST_CREATION_UNRESOLVED', blockingAllocationId: next.reservation.identity.allocationId });
  assert.equal(admission.readAllocation(p.id)?.actionDigest, null);
});
test('owner recovery is explicit, monotonic and preserves parked readiness', async t => {
  const { admission, root } = fixture(t); const r = admission.reserveAllocation(input()); if (r.kind !== 'reserved') throw new Error('reserve');
  const dead = Admission.forTesting({ root, backend: 'fake', initialize: false, ownerLiveness: () => 'dead' });
  assert.equal(dead.quarantineAbandonedAllocation(r.reservation.identity), true);
  assert.equal(dead.readAllocation(r.reservation.identity.allocationId)?.state, 'quarantined');
  assert.throws(() => r.reservation.stage(staged()));
  const p = await prepared(admission, 'parked'); assert.throws(() => dead.quarantineAbandoned(p.claim.identity, 'OWNER_LOST'));
  assert.equal(admission.readAllocation(p.id)?.state, 'ready');
});
test('active allocation retirement is busy; explicit ready cancellation consumes stock without device effects', async t => {
  const { admission } = fixture(t); const r = admission.reserveAllocation(input()); if (r.kind !== 'reserved') throw new Error('reserve');
  assert.deepEqual(admission.retireAllocation(r.reservation.identity.allocationId), { kind: 'refused', reason: 'ALLOCATION_BUSY' });
  r.reservation.fail('ARTIFACT_INVALID');
  const p = await prepared(admission, 'second');
  admission.cancelAllocation(p.id); assert.equal(admission.readAllocation(p.id)?.outcome, 'retired_unused'); assert.equal(admission.readAllocation(p.id)?.cancellationRequested, true);
  assert.equal(admission.consumeAllocation(binding(p.id, 'second')).kind, 'refused');
});

type WorkerResult = { allocationId?: string; kind: string; reason?: string; effects: number; code?: string };
function worker(t: TestContext) {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/allocation-store-worker.ts', import.meta.url))],
    { stdio: ['ignore','pipe','pipe','ipc'], env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
  let stdout = ''; let stderr = ''; let result: WorkerResult | undefined;
  child.stdout!.on('data', bytes => { stdout += bytes; }); child.stderr!.on('data', bytes => { stderr += bytes; });
  const ready = new Promise<void>(resolve => child.on('message', message => { if ((message as { ready?: boolean }).ready) resolve(); else result = message as WorkerResult; }));
  const exit = new Promise<{ result: WorkerResult | undefined; code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(resolve => child.on('exit', (code, signal) => resolve({ result, code, signal, stdout, stderr })));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000); t.after(() => { clearTimeout(timeout); if (child.exitCode === null) child.kill('SIGKILL'); });
  return { child, ready, exit: exit.finally(() => clearTimeout(timeout)) };
}
async function compete(t: TestContext, requests: Record<string, unknown>[]) {
  const children = requests.map(() => worker(t)); await Promise.all(children.map(c => c.ready));
  children.forEach((child, index) => child.child.send(requests[index]!));
  const results = await Promise.all(children.map(c => c.exit));
  for (const result of results) { assert.equal(result.code, 0, result.stderr); assert.notEqual(result.result?.kind, 'error', JSON.stringify(result)); }
  return results.map(r => r.result!);
}
test('independent processes reserve one global identity and one remaining capacity slot', async t => {
  const { root, admission } = fixture(t);
  const results = await compete(t, [0,1].map(() => ({ root, mode: 'reserve', input: input() })));
  assert.deepEqual(results.map(r => r.kind).sort(), ['reserved','retrieved']);
  assert.equal(admission.readAllocationForAction('one')?.state, 'preparing');
  const more = await compete(t, ['two','three'].map(id => ({ root, mode: 'reserve', input: input(id) })));
  assert.deepEqual(more.map(r => r.reason), ['BUDGET_EXHAUSTED','BUDGET_EXHAUSTED']);
});
test('concurrent byte/capacity boundary admits allocation eight and refuses nine', async t => {
  const { root, admission } = fixture(t);
  for (let i = 1; i <= 7; i++) {
    const request = supplied(`held-${i}`, `ABCDEF00-0000-4000-8000-${String(i).padStart(12,'0')}`);
    const r = admission.reserveAllocation(request); assert.equal(r.kind, 'reserved'); if (r.kind !== 'reserved') return;
    r.reservation.stage(staged()); const a = r.reservation.admit(); assert.equal(a.kind, 'admitted'); if (a.kind !== 'admitted') return;
    r.reservation.fail('BOOT_FAILED');
  }
  const requests = ['eight','nine'].map((id, i) => { const request = supplied(id, `ABCDEF00-0000-4000-8000-00000000000${i + 8}`);
    request.budgets.maxConcurrentPreparations = 8; request.storage = { simulatorFreeBytes: 20000, stagingFreeBytes: 20000 }; return { root, mode: 'reserve', input: request }; });
  const results = await compete(t, requests); assert.deepEqual(results.map(r => r.kind).sort(), ['refused','reserved']);
  assert.equal(results.find(r => r.kind === 'refused')?.reason, 'BUDGET_EXHAUSTED');
});
test('parked preparation exits normally then two new processes yield one action driver attachment', async t => {
  const { root, admission } = fixture(t); const preparer = worker(t); await preparer.ready;
  preparer.child.send({ root, mode: 'park', input: input() }); const exited = await preparer.exit;
  assert.equal(exited.code, 0, exited.stderr); assert.equal(exited.result?.kind, 'parked');
  const p = { id: exited.result!.allocationId! };
  assert.equal(admission.readAllocation(p.id)?.state, 'ready');
  const results = await compete(t, [0,1].map(() => ({ root, mode: 'consume', input: input(), binding: binding(p.id) })));
  assert.deepEqual(results.map(r => r.kind).sort(), ['consumed','retrieved']); assert.equal(results.reduce((sum, r) => sum + r.effects, 0), 1);
  assert.equal(admission.readAllocation(p.id)?.state, 'executing');
});
test('ready cancellation versus start is transactionally ordered across processes', async t => {
  const { root, admission } = fixture(t); const p = await prepared(admission);
  const results = await compete(t, [{ root, mode: 'cancel', input: input(), allocationId: p.id }, { root, mode: 'consume', input: input(), binding: binding(p.id) }]);
  const state = admission.readAllocation(p.id)?.state;
  if (state === 'executing') { assert.equal(results[0]?.reason, 'ALLOCATION_BUSY'); assert.equal(results[1]?.kind, 'consumed'); }
  else { assert.equal(state, 'retained'); assert.equal(results[1]?.reason, 'ALLOCATION_NOT_READY'); assert.equal(results[1]?.effects, 0); }
});
test('TTL boundary versus early start grants at most one owner across processes', async t => {
  const { root, admission } = fixture(t, { now: () => 1000 }); const p = await prepared(admission);
  const results = await compete(t, [300999,301000].map(now => ({ root, mode: 'consume', now, input: input(), binding: binding(p.id) })));
  assert.ok(results.filter(r => r.kind === 'consumed').length <= 1);
  assert.ok(results.reduce((sum, r) => sum + r.effects, 0) <= 1);
  assert.ok(['executing','retained'].includes(admission.readAllocation(p.id)!.state));
});
for (const operation of ['reserveAllocation','startCreation','recordCreation','admitAllocation','parkAllocation','consumeAllocation','finalize','recordActionExport']) {
  for (const point of ['beforeCommit','afterCommit'] as const) test(`real owner death at ${operation}/${point} cannot replay or split terminal authority`, async t => {
    const { root, admission } = fixture(t); const child = worker(t); await child.ready;
    child.child.send({ root, mode: 'journey', input: input(), fault: { operation, point } }); const exited = await child.exit;
    assert.equal(exited.signal, 'SIGKILL', JSON.stringify(exited)); assert.match(exited.stdout, new RegExp(operation));
    const record = admission.readAllocationForAction('one');
    if (operation === 'reserveAllocation' && point === 'beforeCommit') { assert.equal(record, undefined); return; }
    assert.ok(record); assert.equal(admission.reserveAllocation(input()).kind, 'retrieved');
    const view = admission.readAction('one'); assert.equal(view?.kind, 'allocation'); if (view?.kind !== 'allocation') return;
    if ((operation === 'finalize' && point === 'afterCommit') || operation === 'recordActionExport') {
      assert.equal(view.attempt?.state, 'terminal'); assert.equal(record.state, 'retained'); assert.equal(record.actionEvidence?.state, 'terminal');
    } else { assert.notEqual(view.attempt?.state, 'terminal'); assert.notEqual(record.outcome, 'action_completed'); }
    if ((operation === 'startCreation' && point === 'afterCommit') || (operation === 'recordCreation' && point === 'beforeCommit')) {
      assert.equal(record.hostCreationBlocked, true);
      assert.equal(admission.acquire({ device: uuid, attempt: { kind: 'legacy', id: 'late' }, digest, intent: {} }).kind, 'refused');
    }
    if (record.state === 'preparing' || record.state === 'executing') {
      assert.equal(admission.quarantineAbandonedAllocation(record.owner), true);
      assert.equal(admission.readAllocation(record.allocationId)?.state, 'quarantined');
    }
  });
}
test('duplicate known-device admission cannot retire or disturb the live preparation owner', async t => {
  const { admission } = fixture(t); const r = admission.reserveAllocation(supplied()); if (r.kind !== 'reserved') throw new Error('reserve');
  r.reservation.stage(staged()); const first = r.reservation.admit(); if (first.kind !== 'admitted') throw new Error('admit');
  const driver = first.claim.bindDriver('fake'); const before = admission.readAllocation(r.reservation.identity.allocationId);
  assert.throws(() => r.reservation.admit()); assert.deepEqual(admission.readAllocation(r.reservation.identity.allocationId), before);
  assert.equal(await driver.dispatch('boot', async () => true), true);
});
test('observed success cannot contradict persisted dispatch flags or skip captures', async t => {
  const { admission } = fixture(t); const p = await prepared(admission); const r = admission.consumeAllocation(binding(p.id)); if (r.kind !== 'consumed') throw new Error('consume');
  r.claim.recordObservation(['/isolated/observation.json']);
  assert.throws(() => r.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { outcome: 'outcome_observed', reason: null }, evidenceRefs: ['/isolated/observation.json'] }));
  assert.equal(admission.readAllocation(p.id)?.state, 'executing');
});
test('failed preparation terminal write still revokes its attached driver locally', async t => {
  let fail = false;
  const { admission } = fixture(t, { fault: (point, operation) => { if (fail && point === 'beforeCommit' && operation === 'failAllocation') throw new Error('Injected storage failure'); } });
  const r = admission.reserveAllocation(supplied()); if (r.kind !== 'reserved') throw new Error('reserve');
  r.reservation.stage(staged()); const a = r.reservation.admit(); if (a.kind !== 'admitted') throw new Error('admit');
  const driver = a.claim.bindDriver('fake'); fail = true;
  assert.equal(r.reservation.fail('BOOT_FAILED').authority, 'unconfirmed');
  let effects = 0;
  assert.throws(() => driver.dispatch('boot', async () => { effects++; }));
  assert.equal(effects, 0); assert.equal(admission.readAllocation(r.reservation.identity.allocationId)?.state, 'preparing');
});
test('preparation cannot park after its overall deadline even when commands settled', async t => {
  let now = 1000;
  const { admission } = fixture(t, { now: () => now });
  const r = admission.reserveAllocation(supplied()); if (r.kind !== 'reserved') throw new Error('reserve');
  r.reservation.stage(staged()); const a = r.reservation.admit(); if (a.kind !== 'admitted') throw new Error('admit');
  const driver = a.claim.bindDriver('fake');
  for (const kind of ['boot','install','launch','readiness']) await driver.dispatch(kind, async () => true);
  now = 361000;
  assert.throws(() => a.claim.park(['/isolated/readiness.json']));
  assert.equal(admission.readAllocation(r.reservation.identity.allocationId)?.state, 'preparing');
  assert.throws(() => driver.dispatch('readiness', async () => true));
});
test('startup lists active owners without mutating, resuming or recovering parked and cancelled work', async t => {
  const { admission, root } = fixture(t);
  const p = await prepared(admission);
  const r = admission.reserveAllocation(input('pending')); if (r.kind !== 'reserved') throw new Error('reserve');
  admission.cancelAllocation(r.reservation.identity.allocationId);
  const reader = Admission.forTesting({ root, backend: 'fake', initialize: false, ownerLiveness: () => 'dead' });
  const before = readFileSync(join(root, 'admission.sqlite'));
  assert.deepEqual(reader.listActiveAllocations().map(a => a.actionId), ['pending']);
  assert.equal(reader.listActiveAllocations()[0]?.cancellationRequested, true);
  assert.equal(reader.readAllocation(p.id)?.state, 'ready');
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), before);
  reader.quarantineAbandonedAllocation(r.reservation.identity);
  assert.deepEqual(reader.listActiveAllocations(), []);
});
test('restart projects capture counts, nullable dispatch flags, finalization and immutable export independently', async t => {
  const { admission, root } = fixture(t); const p = await prepared(admission);
  const r = admission.consumeAllocation(binding(p.id)); if (r.kind !== 'consumed') throw new Error('consume');
  const reader = Admission.forTesting({ root, backend: 'fake', initialize: false });
  r.claim.recordObservation(['/isolated/before.json','/isolated/before.jpg']);
  r.claim.recordObservation(['/isolated/before.json','/isolated/before.jpg']);
  assert.equal(reader.readAllocation(p.id)?.actionEvidence?.observationCount, 1);
  let resolve!: () => void;
  const session = r.claim.bindDriver('fake'); const pending = session.dispatch('tap', () => new Promise<void>(r => { resolve = r; }));
  assert.equal(reader.readAllocation(p.id)?.actionEvidence?.actionAttempted, null);
  assert.equal(reader.readAllocation(p.id)?.actionEvidence?.actionAcknowledged, null);
  resolve(); await pending;
  r.claim.recordActionReceipt({ actionAttempted: true, actionAcknowledged: true });
  r.claim.recordObservation(['/isolated/after.json']);
  r.claim.beginFinalization();
  assert.equal(reader.readAllocation(p.id)?.actionEvidence?.state, 'finalizing');
  const running = reader.readAction('one'); if (running?.kind !== 'allocation') throw new Error('read');
  assert.equal(running.attempt?.terminal, null); assert.equal(running.allocation.outcome, null);
  assert.throws(() => session.dispatch('capture', async () => true));
  const result = r.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { outcome: 'outcome_observed', reason: null }, evidenceRefs: ['/isolated/after.json'] });
  assert.equal(result.authority, 'committed');
  const committed = reader.readAttempt({ kind: 'observed', id: 'one' })?.terminal;
  reader.recordActionExport('one', { status: 'failed' });
  reader.recordActionExport('one', { status: 'complete', terminal: '/isolated/terminal.json' });
  reader.recordActionExport('one', { status: 'failed' });
  assert.throws(() => reader.recordActionExport('one', { status: 'complete', terminal: '/isolated/changed.json' }));
  assert.deepEqual(reader.readAttempt({ kind: 'observed', id: 'one' })?.terminal, committed);
  assert.equal(reader.readAllocation(p.id)?.actionEvidence?.observationCount, 2);
  assert.equal(reader.readAllocation(p.id)?.actionEvidence?.exportStatus, 'complete');
  assert.equal(reader.readAllocation(p.id)?.actionEvidence?.terminal, '/isolated/terminal.json');
});
test('action cancellation during pending tap retains unknown flags and late settlement cannot promote terminal', async t => {
  const { admission } = fixture(t); const p = await prepared(admission);
  const r = admission.consumeAllocation(binding(p.id)); if (r.kind !== 'consumed') throw new Error('consume');
  const driver = r.claim.bindDriver('fake'); let resolve!: () => void;
  const pending = driver.dispatch('tap', () => new Promise<void>(r => { resolve = r; }));
  admission.cancel({ kind: 'observed', id: 'one' });
  assert.throws(() => driver.dispatch('capture', async () => true));
  r.claim.beginFinalization();
  assert.equal(r.claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: { outcome: 'inconclusive', reason: 'CANCELLED' }, evidenceRefs: [] }).authority, 'committed');
  const before = admission.readAllocation(p.id); resolve(); await pending;
  assert.deepEqual(admission.readAllocation(p.id), before);
  assert.equal(before?.actionEvidence?.actionAttempted, null); assert.equal(before?.actionEvidence?.actionAcknowledged, null);
  assert.equal(before?.cancellationRequested, true); assert.equal(before?.state, 'quarantined');
  assert.throws(() => r.claim.recordActionReceipt({ actionAttempted: true, actionAcknowledged: true }));
});
test('already satisfied commits only a captured no-input result; conflicting action bindings never mutate it', async t => {
  const { admission, root } = fixture(t); const p = await prepared(admission);
  const r = admission.consumeAllocation(binding(p.id)); if (r.kind !== 'consumed') throw new Error('consume');
  r.claim.recordObservation(['/isolated/before.json']); r.claim.beginFinalization();
  assert.equal(r.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { outcome: 'already_satisfied', reason: null }, evidenceRefs: ['/isolated/before.json'] }).authority, 'committed');
  const bytes = readFileSync(join(root, 'admission.sqlite'));
  assert.equal(admission.consumeAllocation(binding(p.id)).kind, 'retrieved');
  assert.deepEqual(admission.consumeAllocation({ ...binding(p.id), request: { different: true } }), { kind: 'refused', reason: 'ACTION_ID_CONFLICT' });
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), bytes);
});
for (const point of ['beforeCommit','afterCommit'] as const) test(`creation receipt ${point} failure revokes the local reservation without replay`, async t => {
  const { admission } = fixture(t, { fault: (at, operation) => { if (at === point && operation === 'recordCreation') throw new Error('Injected receipt storage failure'); } });
  const r = admission.reserveAllocation(input()); if (r.kind !== 'reserved') throw new Error('reserve');
  r.reservation.stage(staged()); let effects = 0;
  await assert.rejects(r.reservation.create(async () => { effects++; return created(r.reservation.identity.allocationId); }));
  assert.throws(() => r.reservation.admit());
  await assert.rejects(r.reservation.create(async () => { effects++; return created(r.reservation.identity.allocationId); }));
  assert.equal(effects, 1);
  assert.equal(admission.reserveAllocation(input()).kind, 'retrieved');
  assert.equal(admission.readAllocation(r.reservation.identity.allocationId)?.hostCreationBlocked, point === 'beforeCommit');
});
test('failed capture evidence persistence revokes action dispatch before storage recovers', async t => {
  let fail = false;
  const { admission } = fixture(t, { fault: (point, operation) => { if (fail && point === 'beforeCommit' && operation === 'recordObservation') throw new Error('Injected evidence failure'); } });
  const p = await prepared(admission); const r = admission.consumeAllocation(binding(p.id)); if (r.kind !== 'consumed') throw new Error('consume');
  const driver = r.claim.bindDriver('fake'); fail = true;
  assert.throws(() => r.claim.recordObservation(['/isolated/before.json'])); fail = false;
  let effects = 0; assert.throws(() => driver.dispatch('tap', async () => { effects++; })); assert.equal(effects, 0);
  assert.equal(r.claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: { outcome: 'inconclusive', reason: 'RESULT_EVIDENCE_UNCONFIRMED' }, evidenceRefs: [] }).authority, 'committed');
});
for (const closure of ['cancel', 'failAllocation', 'finalize', 'parkAllocation'] as const) {
  test(`revoked preparation cannot park after failed ${closure} persistence`, async t => {
    let failing = false;
    const { admission } = fixture(t, { fault: (point, operation) => {
      if (failing && point === 'beforeCommit' && operation === closure) throw new Error('Injected closure write failure');
    } });
    const r = admission.reserveAllocation(supplied()); if (r.kind !== 'reserved') throw new Error('reserve');
    r.reservation.stage(staged()); const a = r.reservation.admit(); if (a.kind !== 'admitted') throw new Error('admit');
    const driver = a.claim.bindDriver('fake');
    for (const kind of ['boot', 'install', 'launch', 'readiness']) await driver.dispatch(kind, async () => true);
    const uncertain = { outcome: 'inconclusive' as const, disposition: 'quarantined' as const,
      payload: { reason: 'PREPARATION_UNCONFIRMED' }, evidenceRefs: [] };
    failing = true;
    if (closure === 'cancel') assert.throws(() => a.claim.cancel(), /Injected closure write failure/);
    if (closure === 'failAllocation') assert.equal(r.reservation.fail('PREPARATION_UNCONFIRMED').authority, 'unconfirmed');
    if (closure === 'finalize') assert.equal(a.claim.finalize(uncertain).authority, 'unconfirmed');
    if (closure === 'parkAllocation') assert.equal(a.claim.park(['/isolated/readiness.json']).authority, 'unconfirmed');
    failing = false;
    assert.equal(admission.readAllocation(r.reservation.identity.allocationId)?.state, 'preparing');
    let laterEffects = 0;
    assert.throws(() => driver.dispatch('capture', async () => { laterEffects++; }));
    let parkCode: string | undefined;
    try { a.claim.park(['/isolated/readiness.json']); }
    catch (error) { parkCode = (error as { code?: string }).code; }
    const consumed = admission.consumeAllocation(binding(r.reservation.identity.allocationId));
    if (consumed.kind === 'consumed') await consumed.claim.bindDriver('fake').dispatch('tap', async () => { laterEffects++; });
    assert.deepEqual({ parkCode, consume: consumed.kind, reason: consumed.kind === 'refused' ? consumed.reason : null, laterEffects },
      { parkCode: 'DISPATCH_CLOSED', consume: 'refused', reason: 'ALLOCATION_NOT_READY', laterEffects: 0 });
    assert.equal(admission.readAllocation(r.reservation.identity.allocationId)?.state, 'preparing');
    assert.equal(a.claim.finalize(uncertain).authority, 'committed');
    assert.equal(admission.readAllocation(r.reservation.identity.allocationId)?.state, 'quarantined');
  });
}
