import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Admission } from '../src/device/admission.js';
import * as admissionApi from '../src/device/admission.js';
import type { AllocationReservationInput, AllocationRecord } from '../src/device/admission-allocation.js';

import { messageSchema, requireResult, type Work, type WorkerResult } from './fixtures/allocation-worker-protocol.js';

const uuid = 'ABCDEF00-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
test('allocation identities normalize UUIDs independently of device categories', () => {
  assert.equal(admissionApi.canonicalAllocationId('abcdef00-0000-4000-8000-000000000001'), 'ABCDEF00-0000-4000-8000-000000000001');
  for (const invalid of ['/private/avds/Pixel.avd', 'PHONE123', 'ios-simulator:ABCDEF00-0000-4000-8000-000000000001', '']) {
    assert.throws(() => admissionApi.canonicalAllocationId(invalid), { code: 'INVALID_REQUEST', message: 'Expected an allocation UUID' });
  }
});

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

function worker(t: TestContext) {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/allocation-store-worker.ts', import.meta.url))],
    { stdio: ['ignore','pipe','pipe','ipc'], env: { PATH: process.env.PATH, HOME: process.env.HOME!, TMPDIR: process.env.TMPDIR!, NODE_NO_WARNINGS: '1' } });
  let stdout = ''; let stderr = ''; let result: WorkerResult | undefined;
  const errors: string[] = [];
  child.stdout!.on('data', bytes => { stdout += bytes; }); child.stderr!.on('data', bytes => { stderr += bytes; });
  let readySeen = false;
  const ready = new Promise<void>((resolve, reject) => {
    child.on('message', raw => {
      const parsed = messageSchema.safeParse(raw);
      if (!parsed.success) { errors.push(parsed.error.message); return; }
      if ('ready' in parsed.data) { if (readySeen) errors.push('Duplicate ready'); readySeen = true; resolve(); }
      else { if (!readySeen || result) errors.push('Out of order or duplicate receipt'); result = parsed.data; }
    });
    child.on('exit', () => { if (!readySeen) reject(new Error('Worker exited before ready: ' + stderr)); });
    child.on('error', reject);
  });
  const exit = new Promise<{ result: WorkerResult | undefined; code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; errors: string[]; pid: number }>(resolve => child.on('close', (code, signal) => resolve({ result, code, signal, stdout, stderr, errors, pid: child.pid! })));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000); t.after(() => { clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  return { child, ready, exit: exit.finally(() => clearTimeout(timeout)) };
}
type WorkReceipt = { request: Work; result: WorkerResult };
function terminal({ exited, request, policy = 'strict' }: { exited: Awaited<ReturnType<typeof worker>['exit']>; request: Work; policy?: 'strict' | 'contention' }) {
  assert.equal(exited.code, 0, exited.stderr); assert.equal(exited.signal, null); assert.deepEqual(exited.errors, []);
  const result = requireResult({ value: exited.result, policy }); assert.equal(result.mode, request.mode); assert.equal(result.actor, exited.pid);
  return result;
}
async function run({ t, request }: { t: TestContext; request: Work }) {
  const child = worker(t); await child.ready; child.child.send(request); return terminal({ exited: await child.exit, request });
}
async function compete({ t, requests, policy = 'strict' }: { t: TestContext; requests: Work[]; policy?: 'strict' | 'contention' }): Promise<WorkReceipt[]> {
  const actors = requests.map(request => ({ request, worker: worker(t) })); await Promise.all(actors.map(a => a.worker.ready));
  for (const { request, worker: child } of actors) child.child.send(request);
  return Promise.all(actors.map(async ({ request, worker: child }) => ({ request, result: terminal({ exited: await child.exit, request, policy }) })));
}
function reason(result: WorkerResult | undefined) { return result?.kind === 'refused' ? result.reason : undefined; }
async function waitFile(path: string) {
  const deadline = Date.now() + 5000;
  while (!existsSync(path)) { assert.ok(Date.now() < deadline, 'Missing barrier ' + path); await new Promise(resolve => setTimeout(resolve, 5)); }
}
test('controlled long lock reconciles typed uncertainty without replay', async t => {
  const { root, admission } = fixture(t);
  const entered = join(root, 'entered'); const release = join(root, 'release');
  t.after(() => { if (existsSync(root)) writeFileSync(release, 'release'); });
  const holderWork: Work = { root, mode: 'reserve', input: input('holder'), control: { kind: 'hold', operation: 'reserveAllocation', point: 'beforeCommit', entered, release } };
  const waiterWork: Work = { root, mode: 'reserve', input: input('waiter') };
  const holder = worker(t); await holder.ready; holder.child.send(holderWork); await waitFile(entered);
  const waiter = worker(t); await waiter.ready; waiter.child.send(waiterWork);
  const blocked = await waiter.exit;
  writeFileSync(release, 'release'); const held = await holder.exit;
  assert.throws(() => terminal({ exited: blocked, request: waiterWork }), /state-unavailable/);
  const observations = [{ request: holderWork, result: terminal({ exited: held, request: holderWork }) }, { request: waiterWork, result: terminal({ exited: blocked, request: waiterWork, policy: 'contention' }) }];
  reservationRace({ admission, observations });
  assert.equal(observations[1]!.result.kind, 'state-unavailable');
  assert.equal(admission.readAllocationForAction('holder')?.capacityHeld, true);
});
function publicRecords({ admission, inputs }: { admission: Admission; inputs: AllocationReservationInput[] }) {
  const records = new Map<string, AllocationRecord>();
  for (const request of inputs) {
    const view = admission.readAction(request.actionId); const record = admission.readAllocationForAction(request.actionId);
    if (!view) { assert.equal(record, undefined); continue; }
    assert.equal(view.kind, 'allocation'); if (view.kind !== 'allocation') throw new Error('Unexpected imported action');
    assert.deepEqual(record, view.allocation); records.set(request.actionId, view.allocation);
    for (const key of ['actionId','preparationDigest','preparation','appBundleId','source','inspectedContentDigest','artifactBytes','configVersion','configDigest','budgets','evidenceDirectory'] as const) assert.deepEqual(record![key], request[key], key);
    assert.equal(record!.capacityHeld, true); assert.equal(record!.reservationBytes, request.budgets.reservationBytesPerAllocation);
    assert.equal(record!.owner.allocationId, record!.allocationId); assert.ok(record!.owner.token); assert.equal(record!.hostCreationBlocked, false);
  }
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: records.size, reservedBytes: [...records.values()].reduce((sum, r) => sum + r.reservationBytes, 0) });
  assert.equal(new Set([...records.values()].map(r => r.allocationId)).size, records.size);
  return records;
}
function reservationRace({ admission, observations, baseline = [] }: { admission: Admission; observations: WorkReceipt[]; baseline?: AllocationRecord[] }) {
  const requests = observations.map(row => row.request);
  const records = publicRecords({ admission, inputs: [...baseline.map(r => ({ ...r, storage: { simulatorFreeBytes: 20000, stagingFreeBytes: 20000 } })), ...requests.map(r => r.input)] });
  for (const old of baseline) assert.deepEqual(records.get(old.actionId), old);
  const newIds = new Set(requests.map(r => r.input.actionId));
  const added = [...newIds].map(id => records.get(id)).filter(r => r !== undefined);
  assert.ok(added.length <= 1);
  for (const record of added) {
    const view = admission.readAction(record.actionId); assert.ok(view?.kind === 'allocation');
    assert.equal(record.state, 'preparing'); assert.equal(record.phase, 'reserved'); assert.equal(record.outcome, null); assert.equal(record.reason, null);
    assert.equal(record.owner.generation, 1); assert.ok(observations.some(({ request, result }) => request.input.actionId === record.actionId && result.actor === record.owner.process.pid && ['reserved','state-unavailable'].includes(result.kind)));
    assert.equal(record.actionDigest, null); assert.equal(record.actionRequest, null); assert.equal(record.actionEvidence, null);
    assert.equal(record.device, record.source.kind === 'supplied' ? record.source.udid : null);
    assert.equal(view.attempt, null); assert.equal(view.admission, null);
  }
  for (const { request, result } of observations) {
    assert.equal(result.effects, 0); assert.deepEqual(result.effectOwners, []); assert.deepEqual(result.authorizations, []); assert.deepEqual(result.callbackEntries, []);
    const record = records.get(request.input.actionId);
    if (result.kind === 'reserved' || result.kind === 'retrieved') assert.equal(record?.allocationId, result.allocationId);
    else if (result.kind === 'refused') {
      assert.equal(result.reason, 'BUDGET_EXHAUSTED');
      assert.ok(records.size === 8 || [...records.values()].filter(r => r.state === 'preparing').length >= request.input.budgets.maxConcurrentPreparations);
    } else assert.equal(result.kind, 'state-unavailable');
  }
  return records;
}
function preparedRace({ admission, before, observations }: { admission: Admission; before: AllocationRecord; observations: WorkReceipt[] }) {
  const requests = observations.map(row => row.request); const results = observations.map(row => row.result);
  for (const work of requests) if (work.mode === 'consume') assert.ok(work.now !== undefined, 'Consume clock is explicit');
  const records = publicRecords({ admission, inputs: requests.map(r => r.input) }); const record = records.get(before.actionId); assert.ok(record);
  for (const key of ['allocationId','device','staged','creationReceipt','createdAt','readyAt','expiresAt','readinessEvidence','evidenceRefs','intendedName'] as const) assert.deepEqual(record[key], before[key], key);
  const view = admission.readAction(before.actionId); assert.ok(view?.kind === 'allocation');
  const effects = results.reduce((sum, r) => sum + r.effects, 0); assert.ok(effects <= 1);
  assert.ok(results.reduce((sum, result) => sum + result.callbackEntries.length, 0) <= 1, 'At most one callback entry');
  for (const result of results) {
    for (const entry of result.callbackEntries) { assert.equal(entry.authorizationSeenAtEntry, true, 'Unauthorized callback entry survives settlement errors'); assert.deepEqual(entry.owner, view.attempt?.owner); }
    if (result.kind === 'consumed') assert.equal(result.callbackEntries.length, 1);
    else if (result.kind !== 'state-unavailable') assert.equal(result.callbackEntries.length, 0);
    assert.equal(result.effects, result.effectOwners.length);
    if (result.kind === 'consumed') assert.equal(result.effects, 1);
    else if (result.kind !== 'state-unavailable') assert.equal(result.effects, 0);
    for (const owner of result.effectOwners) { assert.ok(result.authorizations.some(a => JSON.stringify(a) === JSON.stringify(owner))); assert.deepEqual(owner, view.attempt?.owner); }
    for (const owner of result.authorizations) assert.deepEqual(owner, view.attempt?.owner);
    if ('allocationId' in result) assert.equal(result.allocationId, before.allocationId);
    if (result.kind === 'refused') {
      if (result.mode === 'cancel') { assert.equal(result.reason, 'ALLOCATION_BUSY'); assert.equal(record.state, 'executing'); }
      else { assert.equal(result.mode, 'consume'); assert.equal(record.state, 'retained'); assert.ok(['ALLOCATION_NOT_READY','READY_EXPIRED'].includes(result.reason)); if (result.reason === 'READY_EXPIRED') assert.equal(record.reason, 'READY_EXPIRED'); }
    }
    if (result.kind === 'retrieved') assert.equal(record.state, result.mode === 'consume' ? 'executing' : 'retained');
    assert.notEqual(result.kind, 'unexpected-error');
  }
  if (record.state === 'executing') {
    const work = requests.find(r => r.mode === 'consume'); assert.ok(work?.mode === 'consume');
    assert.equal(record.phase, 'action'); assert.equal(record.outcome, null); assert.equal(record.reason, null); assert.equal(record.cancellationRequested, false);
    assert.equal(record.owner.generation, before.owner.generation + 1);
    assert.equal(record.actionDigest, work.binding.actionDigest); assert.deepEqual(record.actionRequest, work.binding.request);
    assert.deepEqual(record.actionEvidence, { ...work.binding.evidence, observations: [], observationCount: 0, actionAttempted: false, actionAcknowledged: false, state: 'running', terminal: null, exportStatus: 'pending' });
    assert.ok(view.attempt); assert.equal(view.attempt.state, 'active'); assert.equal(view.attempt.terminal, null); assert.equal(view.attempt.cancellationRequested, false);
    assert.equal(view.attempt.owner.device, record.device); assert.deepEqual(view.attempt.owner.attempt, view.attempt.identity);
    assert.ok(results.some(r => r.actor === view.attempt!.owner.process.pid && r.mode === 'consume'));
    assert.deepEqual(view.attempt.identity, { kind: 'observed', id: before.actionId }); assert.equal(view.attempt.device, before.device);
    assert.equal(view.attempt.digest, work.binding.actionDigest); assert.deepEqual(view.attempt.intent, work.binding.request);
    assert.deepEqual(record.owner, { allocationId: record.allocationId, token: view.attempt.owner.token, generation: view.attempt.owner.generation, process: view.attempt.owner.process });
    assert.equal(view.admission?.state, 'active'); assert.equal(view.admission.generation, record.owner.generation); assert.deepEqual(view.admission.owner, view.attempt.owner);
  } else {
    assert.equal(effects, 0); assert.equal(view.attempt, null); assert.deepEqual(record.owner, before.owner);
    assert.equal(record.actionDigest, null); assert.equal(record.actionRequest, null); assert.equal(record.actionEvidence, null);
    assert.equal(view.admission?.owner, null); assert.equal(view.admission.generation, before.owner.generation);
    if (record.state === 'ready') { assert.ok(results.some(r => r.kind === 'state-unavailable')); assert.deepEqual(record, before); assert.equal(view.admission.state, 'active'); }
    else { assert.equal(record.state, 'retained'); assert.equal(record.phase, 'terminal'); assert.equal(record.outcome, 'retired_unused'); assert.equal(view.admission.state, 'available');
      if (record.reason === 'RETAINED_UNUSED') {
        const operation = record.cancellationRequested ? 'cancel' : 'retire';
        assert.ok(requests.some(work => work.mode === operation && work.allocationId === before.allocationId), 'Retirement must be requested');
      } else {
        assert.equal(record.reason, 'READY_EXPIRED'); assert.equal(record.cancellationRequested, false);
        const expiresAt = before.expiresAt;
        assert.ok(expiresAt !== null && requests.some(work => work.mode === 'consume' && work.binding.allocationId === before.allocationId && work.now !== undefined && work.now >= expiresAt), 'Expiry requires an eligible consume clock');
      } }
  }
  return record;
}
function healthy(results: WorkerResult[]) { return results.every(r => r.kind !== 'state-unavailable'); }
test('independent processes reserve one global identity and one remaining capacity slot', async t => {
  const { root, admission } = fixture(t);
  const requests: Work[] = [0,1].map(() => ({ root, mode: 'reserve', input: input() }));
  const observations = await compete({ t, requests, policy: 'contention' }); const results = observations.map(row => row.result); reservationRace({ admission, observations });
  if (healthy(results)) assert.deepEqual(results.map(r => r.kind).sort(), ['reserved','retrieved']);
  const seeded = fixture(t); assert.equal((await run({ t, request: { root: seeded.root, mode: 'reserve', input: input() } })).kind, 'reserved');
  const seededBefore = seeded.admission.readAllocationForAction('one')!;
  const moreRequests: Work[] = ['two','three'].map(id => ({ root: seeded.root, mode: 'reserve', input: input(id) }));
  const moreObservations = await compete({ t, requests: moreRequests, policy: 'contention' }); const more = moreObservations.map(row => row.result); reservationRace({ admission: seeded.admission, observations: moreObservations, baseline: [seededBefore] });
  if (healthy(more)) assert.deepEqual(more.map(reason), ['BUDGET_EXHAUSTED','BUDGET_EXHAUSTED']);
});
function heldSeven(admission: Admission) {
  const records: AllocationRecord[] = [];
  for (let i = 1; i <= 7; i++) {
    const r = admission.reserveAllocation(supplied(`held-${i}`, `ABCDEF00-0000-4000-8000-${String(i).padStart(12,'0')}`)); assert.equal(r.kind, 'reserved'); if (r.kind !== 'reserved') throw new Error('reserve');
    r.reservation.stage(staged()); const a = r.reservation.admit(); assert.equal(a.kind, 'admitted'); if (a.kind !== 'admitted') throw new Error('admit');
    r.reservation.fail('BOOT_FAILED'); records.push(admission.readAllocation(r.reservation.identity.allocationId)!);
  }
  return records;
}
function lastSlot(root: string): [Work, Work] {
  const requestFor = ({ id, suffix }: { id: string; suffix: number }): Work => {
  const request = supplied(id, `ABCDEF00-0000-4000-8000-00000000000${suffix}`); request.budgets.maxConcurrentPreparations = 8; request.storage = { simulatorFreeBytes: 20000, stagingFreeBytes: 20000 };
  return { root, mode: 'reserve', input: request };
  };
  return [requestFor({ id: 'eight', suffix: 8 }), requestFor({ id: 'nine', suffix: 9 })];
}
test('concurrent byte/capacity boundary admits allocation eight and refuses nine', async t => {
  const { root, admission } = fixture(t); const baseline = heldSeven(admission); const requests = lastSlot(root);
  const observations = await compete({ t, requests, policy: 'contention' }); const results = observations.map(row => row.result); const records = reservationRace({ admission, observations, baseline });
  assert.ok(records.size === 7 || records.size === 8);
  if (healthy(results)) { assert.equal(records.size, 8); assert.deepEqual(results.map(r => r.kind).sort(), ['refused','reserved']); assert.equal(reason(results.find(r => r.kind === 'refused')), 'BUDGET_EXHAUSTED'); }
});
test('parked preparation exits normally then two new processes yield one action driver attachment', async t => {
  const { root, admission } = fixture(t); const parked = await run({ t, request: { root, mode: 'park', input: input() } }); assert.equal(parked.kind, 'parked'); if (parked.kind !== 'parked') throw new Error('park');
  const before = admission.readAllocation(parked.allocationId)!;
  const requests: Work[] = [0,1].map(() => ({ root, mode: 'consume', now: before.readyAt!, input: input(), binding: binding(parked.allocationId) }));
  const observations = await compete({ t, requests, policy: 'contention' }); const results = observations.map(row => row.result); preparedRace({ admission, before, observations });
  if (healthy(results)) { assert.deepEqual(results.map(r => r.kind).sort(), ['consumed','retrieved']); assert.equal(results.reduce((sum, r) => sum + r.effects, 0), 1); }
});
test('ready cancellation versus start is transactionally ordered across processes', async t => {
  const { root, admission } = fixture(t); const p = await prepared(admission); const before = admission.readAllocation(p.id)!;
  const requests: Work[] = [{ root, mode: 'cancel', input: input(), allocationId: p.id }, { root, mode: 'consume', now: before.readyAt!, input: input(), binding: binding(p.id) }];
  const observations = await compete({ t, requests, policy: 'contention' }); const results = observations.map(row => row.result); const record = preparedRace({ admission, before, observations });
  if (healthy(results)) {
    if (record.state === 'executing') { assert.equal(reason(results[0]), 'ALLOCATION_BUSY'); assert.equal(results[1]?.kind, 'consumed'); }
    else { assert.equal(record.state, 'retained'); assert.equal(reason(results[1]), 'ALLOCATION_NOT_READY'); assert.equal(results[1]?.effects, 0); }
  }
});
test('TTL boundary versus early start grants at most one owner across processes', async t => {
  const { root, admission } = fixture(t, { now: () => 1000 }); const p = await prepared(admission); const before = admission.readAllocation(p.id)!;
  const requests: Work[] = [300999,301000].map(now => ({ root, mode: 'consume', now, input: input(), binding: binding(p.id) }));
  const observations = await compete({ t, requests, policy: 'contention' }); const results = observations.map(row => row.result); const record = preparedRace({ admission, before, observations });
  assert.ok(results.filter(r => r.kind === 'consumed').length <= 1);
  if (healthy(results)) assert.ok(['executing','retained'].includes(record.state));
});
test('ordered independent processes retain useful identity and exact eight-of-nine capacity proofs', async t => {
  const first = fixture(t); const request: Work = { root: first.root, mode: 'reserve', input: input() };
  assert.equal((await run({ t, request })).kind, 'reserved'); assert.equal((await run({ t, request })).kind, 'retrieved');
  for (const id of ['two','three']) assert.equal(reason(await run({ t, request: { ...request, input: input(id) } })), 'BUDGET_EXHAUSTED');
  const { root, admission } = fixture(t); const baseline = heldSeven(admission); const requests = lastSlot(root); const [eighth, ninth] = requests;
  const observations = [{ request: eighth, result: await run({ t, request: eighth }) }, { request: ninth, result: await run({ t, request: ninth }) }]; const results = observations.map(row => row.result);
  assert.deepEqual(results.map(r => r.kind), ['reserved','refused']); assert.equal(reason(results[1]), 'BUDGET_EXHAUSTED'); reservationRace({ admission, observations, baseline });
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: 8, reservedBytes: 6400 });
});
for (const order of ['consume-cancel','cancel-consume','early-boundary','boundary-early','consume-duplicate'] as const) test(`ordered independent processes preserve ${order} business outcomes`, async t => {
  const { root, admission } = fixture(t, { now: () => 1000 }); const p = await prepared(admission); const before = admission.readAllocation(p.id)!;
  const consume: Work = { root, mode: 'consume', now: 300999, input: input(), binding: binding(p.id) };
  const cancel: Work = { root, mode: 'cancel', input: input(), allocationId: p.id };
  const boundary: Work = { ...consume, now: 301000 };
  const cases = {
    'consume-cancel': { requests: [consume,cancel], kinds: ['consumed','refused'], reasons: [undefined,'ALLOCATION_BUSY'], reason: null, cancelled: false, effects: 1 },
    'cancel-consume': { requests: [cancel,consume], kinds: ['retrieved','refused'], reasons: [undefined,'ALLOCATION_NOT_READY'], reason: 'RETAINED_UNUSED', cancelled: true, effects: 0 },
    'early-boundary': { requests: [consume,boundary], kinds: ['consumed','retrieved'], reasons: [undefined,undefined], reason: null, cancelled: false, effects: 1 },
    'boundary-early': { requests: [boundary,consume], kinds: ['refused','refused'], reasons: ['READY_EXPIRED','ALLOCATION_NOT_READY'], reason: 'READY_EXPIRED', cancelled: false, effects: 0 },
    'consume-duplicate': { requests: [consume,consume], kinds: ['consumed','retrieved'], reasons: [undefined,undefined], reason: null, cancelled: false, effects: 1 },
  } satisfies Record<typeof order, { requests: [Work, Work]; kinds: [WorkerResult['kind'], WorkerResult['kind']]; reasons: [string | undefined, string | undefined]; reason: AllocationRecord['reason']; cancelled: boolean; effects: number }>;
  const selected = cases[order]; const [firstRequest, secondRequest] = selected.requests;
  const observations = [{ request: firstRequest, result: await run({ t, request: firstRequest }) }, { request: secondRequest, result: await run({ t, request: secondRequest }) }];
  const results = observations.map(row => row.result); const final = preparedRace({ admission, before, observations });
  assert.deepEqual(results.map(r => r.kind), selected.kinds); assert.deepEqual(results.map(reason), selected.reasons);
  assert.equal(final.reason, selected.reason); assert.equal(final.cancellationRequested, selected.cancelled); assert.equal(results.reduce((sum, r) => sum + r.effects, 0), selected.effects);
});
test('postcommit reservation uncertainty discovers held authority by action identity', async t => {
  const { root, admission } = fixture(t);
  const request: Work = { root, mode: 'reserve', input: input(), control: { kind: 'unavailable', operation: 'reserveAllocation', point: 'afterCommit' } };
  const child = worker(t); await child.ready; child.child.send(request);
  const result = terminal({ exited: await child.exit, request, policy: 'contention' }); assert.equal(result.kind, 'state-unavailable');
  const records = reservationRace({ admission, observations: [{ request, result }] }); assert.equal(records.size, 1);
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: 1, reservedBytes: 800 });
});
for (const operation of ['consumeAllocation','settle'] as const) test(`postcommit ${operation} uncertainty preserves committed owner without replay`, async t => {
  const { root, admission } = fixture(t); const p = await prepared(admission); const before = admission.readAllocation(p.id)!;
  const request: Work = { root, mode: 'consume', now: before.readyAt!, input: input(), binding: binding(p.id), control: { kind: 'unavailable', operation, point: 'afterCommit' } };
  const child = worker(t); await child.ready; child.child.send(request); const result = terminal({ exited: await child.exit, request, policy: 'contention' });
  assert.equal(result.kind, 'state-unavailable'); assert.equal(result.effects, operation === 'settle' ? 1 : 0);
  assert.equal(preparedRace({ admission, before, observations: [{ request, result }] }).state, 'executing');
});
test('released transaction permits strict independent-process work', async t => {
  const { root, admission } = fixture(t); const entered = join(root, 'held'); const release = join(root, 'released');
  const holderInput = input('holder'); holderInput.budgets.maxConcurrentPreparations = 2;
  const waiterInput = input('waiter'); waiterInput.budgets.maxConcurrentPreparations = 2;
  const holderRequest: Work = { root, mode: 'reserve', input: holderInput, control: { kind: 'hold', operation: 'reserveAllocation', point: 'beforeCommit', entered, release } };
  const holder = worker(t); await holder.ready; holder.child.send(holderRequest); await waitFile(entered);
  const gated = join(root, 'gated'); const proceed = join(root, 'proceed');
  const waiterRequest: Work = { root, mode: 'reserve', input: waiterInput, gate: { entered: gated, release: proceed } };
  const waiter = worker(t); await waiter.ready; waiter.child.send(waiterRequest); await waitFile(gated);
  writeFileSync(release, 'release'); const held = terminal({ exited: await holder.exit, request: holderRequest });
  const baseline = admission.readAllocationForAction('holder')!;
  writeFileSync(proceed, 'proceed'); const waited = terminal({ exited: await waiter.exit, request: waiterRequest });
  assert.equal(held.kind, 'reserved'); assert.equal(waited.kind, 'reserved'); reservationRace({ admission, observations: [{ request: waiterRequest, result: waited }], baseline: [baseline] });
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: 2, reservedBytes: 1600 });
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
test('allocation capacity includes held records across all states and excludes released capacity without mutating reads', async t => {
  const { admission, root } = fixture(t);
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: 0, reservedBytes: 0 });
  for (const [index, state] of ['retained', 'quarantined', 'ready', 'executing', 'released', 'preparing'].entries()) {
    const r = admission.reserveAllocation(supplied(state, `ABCDEF00-0000-4000-8000-${String(index + 1).padStart(12, '0')}`));
    if (r.kind !== 'reserved') throw new Error('reserve');
    if (state === 'released') { r.reservation.fail('ARTIFACT_INVALID'); continue; }
    if (state === 'preparing') continue;
    r.reservation.stage(staged()); const a = r.reservation.admit(); if (a.kind !== 'admitted') throw new Error('admit');
    if (state === 'quarantined') { r.reservation.fail('PREPARATION_UNCONFIRMED'); continue; }
    const driver = a.claim.bindDriver('fake');
    for (const kind of ['boot', 'install', 'launch', 'readiness']) await driver.dispatch(kind, async () => true);
    a.claim.park(['/isolated/readiness.json']);
    if (state === 'ready') continue;
    const action = admission.consumeAllocation(binding(r.reservation.identity.allocationId, state));
    if (action.kind !== 'consumed') throw new Error('consume');
    if (state === 'executing') continue;
    action.claim.recordObservation(['/isolated/before.json']);
    action.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { outcome: 'already_satisfied', reason: null }, evidenceRefs: ['/isolated/before.json'] });
  }
  const bytes = readFileSync(join(root, 'admission.sqlite'));
  const reopened = Admission.forTesting({ root, backend: 'fake', initialize: false });
  assert.deepEqual(reopened.readAllocationCapacity(), { heldAllocations: 5, reservedBytes: 4000 });
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: 5, reservedBytes: 4000 });
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), bytes);
});
test('allocation capacity sums persisted reservations after configuration changes', t => {
  const { admission } = fixture(t);
  const first = admission.reserveAllocation(supplied('first')); if (first.kind !== 'reserved') throw new Error('reserve');
  first.reservation.stage(staged()); first.reservation.admit(); first.reservation.fail('BOOT_FAILED');
  const next = supplied('second', 'ABCDEF00-0000-4000-8000-000000000002');
  next.budgets.reservationBytesPerAllocation = 1200; next.configDigest = 'b'.repeat(64);
  assert.equal(admission.reserveAllocation(next).kind, 'reserved');
  const changed = supplied('first'); changed.configDigest = 'c'.repeat(64); changed.budgets.reservationBytesPerAllocation = 1;
  assert.equal(admission.reserveAllocation(changed).kind, 'retrieved');
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: 2, reservedBytes: 2000 });
});

// Fault injection only: corrupt a temporary store, then observe refusal through Admission.
function corruptCapacity(root: string, change: (record: Record<string, unknown>) => void, validChecksum = true) {
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  try {
    const row = db.prepare('SELECT id, record FROM allocations ORDER BY rowid LIMIT 1').get()!;
    const record = JSON.parse(row.record as string) as Record<string, unknown>; change(record);
    const json = JSON.stringify(record);
    db.prepare('UPDATE allocations SET record=?, checksum=? WHERE id=?').run(json,
      validChecksum ? createHash('sha256').update(json).digest('hex') : '0'.repeat(64), row.id!);
  } finally { db.close(); }
}
for (const [field, value] of [
  ['capacityHeld', 'false'], ['capacityHeld', null], ['reservationBytes', -1], ['reservationBytes', 0],
  ['reservationBytes', 1.5], ['reservationBytes', '800'], ['reservationBytes', Number.MAX_SAFE_INTEGER + 1],
] as const) test(`allocation capacity rejects corrupt ${field} ${JSON.stringify(value)}`, t => {
  const { admission, root } = fixture(t);
  assert.equal(admission.reserveAllocation(input()).kind, 'reserved');
  corruptCapacity(root, record => { record[field] = value; });
  assert.throws(() => admission.readAllocationCapacity(), { code: 'STATE_UNAVAILABLE' });
});
test('allocation capacity rejects a corrupt checksum rather than returning an empty or partial count', t => {
  const { admission, root } = fixture(t);
  assert.equal(admission.reserveAllocation(input()).kind, 'reserved');
  corruptCapacity(root, record => { record.capacityHeld = false; }, false);
  assert.throws(() => admission.readAllocationCapacity(), { code: 'STATE_UNAVAILABLE' });
});
test('allocation capacity accepts the exact safe integer limit and refuses aggregate overflow', t => {
  const { admission, root } = fixture(t);
  const first = input('first'); first.budgets.maxConcurrentPreparations = 2;
  assert.equal(admission.reserveAllocation(first).kind, 'reserved');
  const second = input('second'); second.budgets.maxConcurrentPreparations = 2;
  assert.equal(admission.reserveAllocation(second).kind, 'reserved');
  corruptCapacity(root, record => { record.reservationBytes = Number.MAX_SAFE_INTEGER - 800; });
  assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: 2, reservedBytes: Number.MAX_SAFE_INTEGER });
  corruptCapacity(root, record => { record.reservationBytes = Number.MAX_SAFE_INTEGER; });
  assert.throws(() => admission.readAllocationCapacity(), { code: 'STATE_UNAVAILABLE' });
});
