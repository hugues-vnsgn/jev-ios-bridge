import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { migrateAdmissionForTesting } from '../src/device/admission-migration.js';
import { ObservedActionJournal } from '../src/experimental/observed-journal.js';
import { runObservedExperiment } from '../src/experimental/observed-run.js';
import { Admission, type AdmissionDependencies } from '../src/device/admission.js';
import { ObservedActionService, observedDriverFactory } from '../src/observed/service.js';
import { createObservedDriver } from '../src/device/factory.js';
import type { AllocationReservationInput } from '../src/device/admission-allocation.js';
import { FileObservedEvidence, type ObservedEvidenceStore } from '../src/observed/evidence.js';
import type { CliRunner } from '../src/device/index.js';
import { renderObservedAction, observedActionExitCode, observedActionSummary } from '../src/observed/report.js';
import { parseObservedAction, observedActionDigest } from '../src/observed/schema.js';
import type { ObservedServiceOptions, ObservedAllocator } from '../src/observed/service.js';

const device = 'ABCDEF00-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
async function ready(admission: Admission, actionId = 'one') {
  const input: AllocationReservationInput = { actionId, preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'supplied', inventoryId: actionId, udid: device, deviceTypeId: 'device', runtimeId: 'runtime',
      creation: { createdAt: 'fixture', origin: 'fixture', evidenceRef: '/isolated/creation' }, attestation: { freshUnused: true, exclusive: true } },
    inspectedContentDigest: digest, artifactBytes: 100, configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/preparation',
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800, maxReservedBytes: 6400,
      minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000, installTimeoutMs: 120000,
      launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } };
  const reserved = admission.reserveAllocation(input); assert.equal(reserved.kind, 'reserved');
  if (reserved.kind !== 'reserved') throw new Error('Fixture reservation refused');
  reserved.reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'fixture' } } });
  const admitted = reserved.reservation.admit(); if (admitted.kind !== 'admitted') throw new Error('Fixture admission refused');
  const session = admitted.claim.bindDriver('fake');
  for (const operation of ['boot', 'install', 'launch', 'readiness']) await session.dispatch(operation, async () => true);
  assert.equal(admitted.claim.park(['/isolated/readiness']).authority, 'committed');
  return reserved.reservation.identity.allocationId;
}
function request(allocationId: string, actionId = 'one') {
  return { version: 1, actionId, allocationId, app: { bundleId: 'dev.fixture' }, action: { kind: 'tap', selector: { identifier: 'go' } },
    before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 };
}
function reply(done: boolean, touch = false) {
  return { stdout: JSON.stringify({ schema: touch ? 'mobilebuildmcp.output.ui-action-result' : 'mobilebuildmcp.output.capture-result',
    schemaVersion: '2', data: { artifacts: { simulatorId: device }, action: { type: 'tap' },
      capture: { type: 'runtime-snapshot', protocol: 'rs/1', capturedAtMs: Date.now(), expiresAtMs: Date.now() + 60000,
        count: 1, elements: [{ ref: 'button', role: 'button', identifier: done ? 'done' : 'go', label: done ? 'Done' : 'Go',
          frame: { x: 0, y: 0, width: 100, height: 30 }, actions: ['tap', 'touch'], state: { visible: true, enabled: true } }] } } }), stderr: '', exitCode: 0 };
}
function fixture(t: TestContext, runner: CliRunner, overrides: Partial<ObservedServiceOptions> = {}, dependencies: AdmissionDependencies = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-service-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'store'), { mode: 0o700 });
  const admission = Admission.forTesting({ root: join(root, 'store'), backend: 'fake', ...dependencies });
  const service = new ObservedActionService({ admission, runsDir: join(root, 'evidence'), bridgeVersion: 'fixture', backend: 'fake', enabled: true,
    createDriver: () => createObservedDriver({ cwd: root, admission, lockRoot: join(root, 'leases'), capture: 'full', reuseActionCapture: false,
      runner, deviceWindow: async () => assert.fail('No presentation'), fakeBackend: { runner, window: undefined } }), ...overrides });
  return { root, admission, service };
}

test('a missing allocation refuses before attaching a driver', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-service-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'store'), { mode: 0o700 });
  const admission = Admission.forTesting({ root: join(root, 'store'), backend: 'fake' });
  let attaches = 0;
  const service = new ObservedActionService({ admission, runsDir: join(root, 'evidence'), bridgeVersion: 'fixture',
    createDriver: () => ({ async attachObserved() { attaches++; }, async observe() { throw new Error('unused'); },
      async tapOnce() { assert.fail('No input'); }, revokeIssuance() {}, async close() {} }), backend: 'fake', enabled: true });
  await assert.rejects(service.start({ version: 1, actionId: 'one', allocationId: 'ABCDEF00-0000-4000-8000-000000000001',
    app: { bundleId: 'dev.fixture' }, action: { kind: 'tap', selector: { identifier: 'go' } },
    before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 100 }),
    { code: 'ALLOCATION_NOT_FOUND' });
  assert.equal(attaches, 0);
  await service.close();
});

test('begin-finalization failure still revokes and closes the attached driver locally', async t => {
  let closes = 0; let revokes = 0; let driver!: ReturnType<typeof createObservedDriver>;
  const { root, admission, service } = fixture(t, async () => reply(true), {
    createDriver: () => ({ attachObserved: (...args) => driver.attachObserved(...args), observe: (...args) => driver.observe(...args),
      tapOnce: (...args) => driver.tapOnce(...args), revokeIssuance() { revokes++; driver.revokeIssuance(); },
      async close(signal) { closes++; await driver.close(signal); } }),
  }, { fault: (point, operation) => { if (point === 'beforeCommit' && operation === 'beginActionFinalization') throw new Error('Injected fault'); } });
  const runner: CliRunner = async () => reply(true);
  driver = createObservedDriver({ cwd: root, admission, lockRoot: join(root, 'leases'), runner,
    deviceWindow: async () => assert.fail('No window'), fakeBackend: { runner, window: undefined } });
  await service.start(request(await ready(admission)));
  const result = await service.inspect('one', { waitMs: 5000 });
  assert.equal(result.state, 'unresolved'); assert.equal(result.outcome, null); assert.equal(result.reason, 'FINALIZATION_UNCONFIRMED');
  assert.equal(revokes, 1); assert.equal(closes, 1);
  const provisional = join(result.evidence.directory, 'provisional-result.json');
  assert.throws(() => readFileSync(provisional), { code: 'ENOENT' });
  await service.close();
});
for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`finalization ${point} never treats provisional success as authority`, async t => {
    const { admission, service } = fixture(t, async () => reply(true), {}, {
      fault: (seen, operation) => { if (seen === point && operation === 'finalize') throw new Error('Injected COMMIT uncertainty'); },
    });
    await service.start(request(await ready(admission)));
    const snapshot = await service.inspect('one', { waitMs: 5000 });
    const provisional = JSON.parse(readFileSync(join(snapshot.evidence.directory, 'provisional-result.json'), 'utf8'));
    assert.equal(provisional.authoritative, false); assert.equal(provisional.result.status, 'already_satisfied');
    if (point === 'beforeCommit') {
      assert.equal(snapshot.state, 'unresolved'); assert.equal(snapshot.authority, 'unconfirmed'); assert.equal(snapshot.outcome, null);
      assert.equal(snapshot.reason, 'FINALIZATION_UNCONFIRMED'); assert.equal(snapshot.admission, 'active');
      assert.equal(snapshot.evidence.terminal, null);
    } else {
      assert.equal(snapshot.authority, 'committed'); assert.equal(snapshot.outcome, 'already_satisfied');
      assert.equal(snapshot.evidence.exportStatus, 'complete');
    }
    await service.close();
  });
}

test('one input and fresh post-input observation, including concurrent identical starts', async t => {
  const calls: string[][] = []; let snapshots = 0;
  const { admission, service } = fixture(t, async args => {
    calls.push(args); if (args[1] === 'touch') return reply(false, true);
    return reply(++snapshots > 1);
  });
  const raw = request(await ready(admission));
  const [first, second] = await Promise.all([service.start(raw), service.start(raw)]);
  assert.deepEqual([first.disposition, second.disposition], ['started', 'retrieved']);
  const terminal = await service.inspect('one', { waitMs: 5000 });
  assert.equal(terminal.outcome, 'outcome_observed', JSON.stringify({terminal,calls})); assert.equal(terminal.actionAttempted, true);
  assert.equal(terminal.actionAcknowledged, true); assert.equal(terminal.observations, 2);
  assert.deepEqual(calls.map(args => args[1]), ['snapshot-ui', 'touch', 'snapshot-ui']);
  assert.deepEqual(JSON.parse(calls[1]![3]!), { simulatorId: device, elementRef: 'button', down: true, up: true, delay: 0.05 });
  await service.close();
});
test('settled precondition failure refuses without an input and retains the prepared device', async t => {
  const calls: string[] = [];
  const { admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(false); });
  const raw = request(await ready(admission)); raw.before.present[0]!.identifier = 'other';
  await service.start(raw); const terminal = await service.inspect('one', { waitMs: 5000 });
  assert.equal(terminal.outcome, 'refused'); assert.equal(terminal.reason, 'PRECONDITION_NOT_MET');
  assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
  assert.equal(terminal.admission, 'available'); assert.equal(terminal.allocationState, 'retained');
  assert.deepEqual(calls, ['snapshot-ui']); await service.close();
});
test('lost input reply keeps durable null receipts, quarantines, and never replays after reconstruction', async t => {
  const calls: string[] = [];
  const { root, admission, service } = fixture(t, async args => {
    calls.push(args[1]!); if (args[1] === 'touch') throw new Error('secret vendor lost receipt'); return reply(false);
  });
  const raw = request(await ready(admission)); await service.start(raw);
  const terminal = await service.inspect('one', { waitMs: 5000 });
  assert.equal(terminal.outcome, 'inconclusive'); assert.equal(terminal.reason, 'UI_ACTION_UNCONFIRMED', JSON.stringify({terminal,calls}));
  assert.equal(terminal.actionAttempted, null); assert.equal(terminal.actionAcknowledged, null);
  assert.equal(terminal.admission, 'quarantined'); assert.equal(terminal.allocationState, 'quarantined');
  const reopened = new ObservedActionService({ admission, runsDir: '/different/cwd', bridgeVersion: 'new', backend: 'fake', enabled: true,
    createDriver: () => assert.fail('No backend after restart') });
  const bytes = readFileSync(join(root, 'store', 'admission.sqlite'));
  assert.equal((await reopened.start(raw)).outcome, 'inconclusive');
  assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), bytes);
  assert.deepEqual(calls, ['snapshot-ui', 'touch']); await service.close(); await reopened.close();
});
test('dead-owner inspection and wait never mutate authority; recovery is explicit', async t => {
  const { root, admission, service } = fixture(t, async () => assert.fail('No execution'));
  const parsed = parseObservedAction(request(await ready(admission)));
  const directory = join(root, 'missing-evidence');
  const consumed = admission.consumeAllocation({ allocationId: parsed.allocationId, actionId: parsed.actionId,
    actionDigest: observedActionDigest(parsed), request: JSON.parse(JSON.stringify(parsed)), appBundleId: parsed.app.bundleId,
    evidence: { bridgeVersion: 'fixture', directory, request: join(directory, 'request.json') } });
  assert.equal(consumed.kind, 'consumed');
  const reader = new ObservedActionService({ admission, runsDir: '/different', bridgeVersion: 'new', backend: 'fake', enabled: true,
    ownerLiveness: () => 'dead', createDriver: () => assert.fail('No recovery dispatch') });
  const bytes = readFileSync(join(root, 'store', 'admission.sqlite'));
  for (const read of [() => reader.inspect('one'), () => reader.inspect('one', { waitMs: 100 }), () => reader.start(parsed)]) {
    const result = await read(); assert.equal(result.state, 'unresolved'); assert.equal(result.outcome, null);
    assert.equal(result.reason, 'OWNER_UNAVAILABLE'); assert.equal(result.admission, 'active');
  }
  assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), bytes);
  // The store independently checks actual liveness and refuses our diagnostic-only dead-owner hint.
  reader.recoverAbandoned(); assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), bytes);
  await service.close(); await reader.close();
});

test('already satisfied commits from the store without input and repeats retrieve without backend calls', async t => {
  const calls: string[] = [];
  const { root, admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(true); });
  const raw = request(await ready(admission));
  const started = await service.start(raw);
  assert.equal(started.disposition, 'started');
  const terminal = await service.inspect('one', { waitMs: 5000 });
  assert.equal(terminal.authority, 'committed'); assert.equal(terminal.outcome, 'already_satisfied');
  assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
  assert.equal(terminal.allocationState, 'retained'); assert.equal(terminal.observations, 1);
  assert.deepEqual(calls, ['snapshot-ui']);
  const exported = JSON.parse(readFileSync(terminal.evidence.terminal!, 'utf8'));
  assert.equal(exported.outcome, 'already_satisfied'); assert.equal(exported.authority, 'committed');
  const bytes = readFileSync(join(root, 'store', 'admission.sqlite'));
  assert.equal((await service.start({ ...raw, allocationId: raw.allocationId.toLowerCase() })).disposition, 'retrieved');
  await service.inspect('one');
  assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), bytes);
  await assert.rejects(service.start({ ...raw, timeoutMs: 5001 }), { code: 'ACTION_ID_CONFLICT' });
  assert.deepEqual(calls, ['snapshot-ui']);
  await service.close();
});

for (const stage of ['prepare', 'observation', 'provisional', 'terminal'] as const) {
  test(`evidence ${stage} failure preserves the corresponding durable authority boundary`, async t => {
    const files = new FileObservedEvidence();
    const evidence: ObservedEvidenceStore = {
      prepare: (directory, request) => stage === 'prepare' ? Promise.reject(new Error('secret filesystem error')) : files.prepare(directory, request),
      observation: (directory, snapshot, index) => stage === 'observation' ? Promise.reject(new Error('secret filesystem error')) : files.observation(directory, snapshot, index),
      provisional: (directory, result) => stage === 'provisional' ? Promise.reject(new Error('secret filesystem error')) : files.provisional(directory, result),
      terminal: (directory, snapshot) => stage === 'terminal' ? Promise.reject(new Error('secret filesystem error')) : files.terminal(directory, snapshot),
    };
    const calls: string[] = [];
    const { admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(true); }, { evidence });
    await service.start(request(await ready(admission))); const terminal = await service.inspect('one', { waitMs: 5000 });
    assert.equal(terminal.authority, 'committed');
    assert.equal(terminal.outcome, stage === 'terminal' ? 'already_satisfied' : 'inconclusive');
    assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
    assert.equal(terminal.admission, stage === 'terminal' ? 'available' : 'quarantined');
    assert.equal(terminal.evidence.exportStatus, stage === 'prepare' || stage === 'terminal' ? 'failed' : 'complete');
    if (stage !== 'terminal') assert.equal(terminal.reason, 'RESULT_EVIDENCE_UNCONFIRMED');
    assert.equal(JSON.stringify(terminal).includes('secret'), false);
    assert.deepEqual(calls, stage === 'prepare' ? [] : ['snapshot-ui']);
    const historical = admission.readAction('one'); assert.equal(historical?.kind, 'allocation');
    assert.deepEqual((await service.inspect('one')).outcome, terminal.outcome);
    await service.close();
  });
}
test('receipt persistence failure never converts a settled input into success', async t => {
  let capture = 0; const calls: string[] = [];
  const { admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(++capture > 1, args[1] === 'touch'); }, {},
    { fault: (point, operation) => { if (point === 'beforeCommit' && operation === 'recordActionReceipt') throw new Error('Injected fault'); } });
  await service.start(request(await ready(admission))); const result = await service.inspect('one', { waitMs: 5000 });
  assert.equal(result.outcome, 'inconclusive'); assert.equal(result.actionAttempted, null); assert.equal(result.actionAcknowledged, null);
  assert.equal(result.reason, 'UI_ACTION_UNCONFIRMED'); assert.deepEqual(calls, ['snapshot-ui', 'touch']);
  await service.close();
});
function deferred<T>(t: TestContext, name: string) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done, reject) => {
    const timer = setTimeout(() => reject(new Error(`${t.name}: timed out waiting for ${name}`)), 10000);
    t.after(() => clearTimeout(timer));
    resolve = value => { clearTimeout(timer); done(value); };
  });
  void promise.catch(() => {});
  return { promise, resolve };
}

function actionDeadline(t: TestContext) {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 500, 'The action deadline is separate from finalization');
    return deadline.signal;
  }, { times: 1 });
  return deadline;
}
for (const kind of ['cancel', 'external-cancel', 'deadline'] as const) {
  test(`${kind} while input is pending keeps quarantine and the identical lease after a late receipt`, async t => {
    const entered = deferred<void>(t, 'backend entry'); const pending = deferred<ReturnType<typeof reply>>(t, 'backend reply release'); const calls: string[] = [];
    const { root, admission, service } = fixture(t, async args => {
      calls.push(args[1]!); if (args[1] === 'touch') { entered.resolve(); return pending.promise; } return reply(false);
    });
    const raw = request(await ready(admission)); raw.timeoutMs = kind === 'deadline' ? 2500 : 5000;
    await service.start(raw); await entered.promise;
    const active = await service.inspect('one'); assert.equal(active.actionAttempted, null); assert.equal(active.actionAcknowledged, null);
    const abort = new AbortController(); const waiting = service.inspect('one', { waitMs: 1000, signal: abort.signal }); abort.abort();
    await assert.rejects(waiting, { code: 'WAIT_CANCELLED' }); assert.equal((await service.inspect('one')).cancellationRequested, false);
    if (kind === 'cancel') await service.cancel('one');
    if (kind === 'external-cancel') Admission.forTesting({ root: join(root, 'store'), backend: 'fake', initialize: false }).cancel({ kind: 'observed', id: 'one' });
    const terminal = await service.inspect('one', { waitMs: 6000 });
    assert.equal(terminal.authority, 'committed'); assert.equal(terminal.outcome, 'inconclusive');
    assert.equal(terminal.reason, kind === 'deadline' ? 'DEADLINE_EXCEEDED' : 'CANCELLED');
    assert.equal(terminal.actionAttempted, null); assert.equal(terminal.actionAcknowledged, null); assert.equal(terminal.admission, 'quarantined');
    const lock = join(root, 'leases', `${device}.lock`); const lease = readFileSync(lock, 'utf8');
    const before = admission.readAction('one'); pending.resolve(reply(true, true)); await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(readFileSync(lock, 'utf8'), lease); assert.deepEqual(admission.readAction('one'), before);
    assert.equal((await service.start(raw)).outcome, 'inconclusive'); assert.deepEqual(calls, ['snapshot-ui', 'touch']);
    await service.close();
  });
}
test('cancellation during an abort-ignoring observation never submits input or persists the late capture', async t => {
  const entered = deferred<void>(t, 'backend entry'); const pending = deferred<ReturnType<typeof reply>>(t, 'backend reply release'); const calls: string[] = [];
  const { admission, service } = fixture(t, async args => { calls.push(args[1]!); entered.resolve(); return pending.promise; });
  const raw = request(await ready(admission)); raw.timeoutMs = 5000; await service.start(raw); await entered.promise;
  const terminal = await service.cancel('one'); assert.equal(terminal.outcome, 'inconclusive'); assert.equal(terminal.reason, 'CANCELLED');
  assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false); assert.equal(terminal.observations, 0);
  const before = admission.readAction('one'); pending.resolve(reply(false)); await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(admission.readAction('one'), before); assert.deepEqual(calls, ['snapshot-ui']); await service.close();
});
test('disabled and shutting-down starts refuse without consuming, while existing reads and cancellation remain usable', async t => {
  const { admission, service } = fixture(t, async () => reply(true), { enabled: false });
  const allocationId = await ready(admission); const raw = request(allocationId);
  await assert.rejects(service.start(raw), { code: 'OBSERVED_DISABLED' }); assert.equal(admission.readAllocation(allocationId)?.state, 'ready');
  await assert.rejects(service.inspect('one'), { code: 'ACTION_NOT_STARTED' });
  await service.close(); await assert.rejects(service.start(raw), { code: 'SHUTTING_DOWN' });
  await assert.rejects(service.inspect('missing'), { code: 'ACTION_NOT_FOUND' });
});

test('full canonical payload comparison rejects a corrupted binding even if its digest field matches', async t => {
  const { root, admission, service } = fixture(t, async () => assert.fail('No backend'));
  const raw = request(await ready(admission)); const parsed = parseObservedAction(raw); const directory = join(root, 'bound');
  const altered = { ...parsed, timeoutMs: 5001 };
  const consumed = admission.consumeAllocation({ allocationId: parsed.allocationId, actionId: 'one', actionDigest: observedActionDigest(parsed),
    request: JSON.parse(JSON.stringify(altered)), appBundleId: parsed.app.bundleId,
    evidence: { bridgeVersion: 'fixture', directory, request: join(directory, 'request.json') } });
  assert.equal(consumed.kind, 'consumed');
  await assert.rejects(service.start(raw), { code: 'ACTION_ID_CONFLICT' }); await service.close();
});

test('cancellation write failure still closes local issuance before returning an honest store error', async t => {
  const entered = deferred<void>(t, 'backend entry'); const pending = deferred<ReturnType<typeof reply>>(t, 'backend reply release'); const calls: string[] = [];
  let failing = false;
  const { admission, service } = fixture(t, async args => { calls.push(args[1]!); entered.resolve(); return pending.promise; }, {},
    { fault: (point, operation) => { if (failing && point === 'beforeCommit' && operation === 'cancel') throw new Error('Injected cancel failure'); } });
  const raw = request(await ready(admission)); raw.timeoutMs = 5000; await service.start(raw); await entered.promise; failing = true;
  await assert.rejects(service.cancel('one'), { code: 'STORE_UNAVAILABLE' });
  pending.resolve(reply(false)); await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(calls, ['snapshot-ui']);
  const result = await service.inspect('one', { waitMs: 5000 }); assert.equal(result.outcome, 'inconclusive');
  assert.equal(result.reason, 'CANCELLED'); assert.equal(result.actionAttempted, false); await service.close();
});

test('allocator delegation preserves its renderer and full binding, with disabled preparation fenced centrally', async t => {
  const calls: string[] = []; const projected = { kind: 'owned-by-allocator', privateProjection: 'unchanged' };
  let admission!: Admission;
  const allocator: ObservedAllocator<typeof projected> = {
    async prepare(raw) { calls.push('prepare'); assert.deepEqual(raw, { request: 'raw' }); return projected; },
    async get(id, options) { calls.push('get'); assert.equal(id, 'identity'); assert.equal(options?.waitMs, 2); return projected; },
    async cancel(id) { calls.push('cancel'); assert.equal(id, 'identity'); return projected; },
    async retire(id) { calls.push('retire'); assert.equal(id, 'identity'); return projected; },
    consume(binding) { calls.push('consume'); assert.equal(binding.appBundleId, 'dev.fixture');
      assert.equal(binding.evidence.request, join(binding.evidence.directory, 'request.json'));
      assert.equal((binding.request as { before: { absent: unknown[] } }).before.absent.length, 0);
      return admission.consumeAllocation(binding); },
    async close() { calls.push('close'); },
  };
  const f = fixture(t, async () => reply(true), { allocator }); admission = f.admission;
  assert.equal(await f.service.prepareAllocation({ request: 'raw' }), projected);
  assert.equal(await f.service.getAllocation('identity', { waitMs: 2 }), projected);
  assert.equal(await f.service.cancelAllocation('identity'), projected); assert.equal(await f.service.retireAllocation('identity'), projected);
  const raw = request(await ready(admission)); await f.service.start(raw); await f.service.inspect('one', { waitMs: 5000 }); await f.service.start(raw);
  const disabled = new ObservedActionService({ admission, allocator, runsDir: '/ignored', bridgeVersion: 'fixture', backend: 'fake',
    createDriver: () => assert.fail('No disabled execution') });
  await assert.rejects(disabled.prepareAllocation({ request: 'raw' }), { code: 'OBSERVED_DISABLED' });
  assert.equal((await disabled.inspect('one')).outcome, 'already_satisfied');
  assert.equal((await disabled.cancel('one')).outcome, 'already_satisfied');
  assert.equal(await disabled.retireAllocation('identity'), projected);
  await f.service.close(); await f.service.close();
  assert.deepEqual(calls, ['prepare', 'get', 'cancel', 'retire', 'consume', 'retire', 'close']);
});

for (const scenario of ['ambiguous-after', 'ambiguous-target', 'target-disabled', 'missing-touch', 'invalid-expiry', 'absent-condition'] as const) {
  test(`${scenario} refuses with settled capture and no input`, async t => {
    const calls: string[] = [];
    const { admission, service } = fixture(t, async args => {
      calls.push(args[1]!); const value = reply(false); const envelope = JSON.parse(value.stdout); const capture = envelope.data.capture;
      if (scenario === 'ambiguous-after') { capture.elements[0].identifier = 'done'; capture.elements.push({ ...capture.elements[0], ref: 'other' }); capture.count = 2; }
      if (scenario === 'ambiguous-target') { capture.elements.push({ ...capture.elements[0], ref: 'other' }, { ...capture.elements[0], identifier: 'Go-only', ref: 'precondition' }); capture.count = 3; }
      if (scenario === 'target-disabled') capture.elements[0].state.enabled = false;
      if (scenario === 'missing-touch') capture.elements[0].actions = ['tap'];
      if (scenario === 'invalid-expiry') capture.expiresAtMs = 1;
      value.stdout = JSON.stringify(envelope); return value;
    });
    const raw = request(await ready(admission));
    // A separate unique precondition allows a duplicated target identifier to reach target selection.
    if (scenario === 'ambiguous-target') {
      raw.before.present = [{ identifier: 'Go-only' }];
      raw.action.selector = { identifier: 'go' };
    }
    if (scenario === 'absent-condition') Object.assign(raw.before, { absent: [{ identifier: 'go' }] });
    await service.start(raw); const result = await service.inspect('one', { waitMs: 5000 });
    assert.equal(result.outcome, 'refused'); assert.equal(result.actionAttempted, false); assert.equal(result.actionAcknowledged, false);
    const reason = scenario === 'ambiguous-after' ? 'AMBIGUOUS_CONDITION' : scenario === 'target-disabled' ? 'TARGET_UNAVAILABLE'
      : scenario === 'missing-touch' ? 'UNSUPPORTED_ACTION' : scenario === 'invalid-expiry' ? 'INVALID_OBSERVATION' : scenario === 'ambiguous-target' ? 'TARGET_NOT_UNIQUE' : 'PRECONDITION_NOT_MET';
    assert.equal(result.reason, reason); assert.deepEqual(calls, ['snapshot-ui']); await service.close();
  });
}

test('external cancellation during provisional persistence commits inconclusive instead of publishing the computed success', async t => {
  let admission!: Admission; const files = new FileObservedEvidence();
  const evidence: ObservedEvidenceStore = { prepare: (...args) => files.prepare(...args), observation: (...args) => files.observation(...args),
    async provisional(directory, result) { await files.provisional(directory, result); admission.cancel({ kind: 'observed', id: 'one' }); },
    terminal: (...args) => files.terminal(...args) };
  const f = fixture(t, async () => reply(true), { evidence }); admission = f.admission;
  await f.service.start(request(await ready(admission))); const result = await f.service.inspect('one', { waitMs: 5000 });
  assert.equal(result.authority, 'committed'); assert.equal(result.outcome, 'inconclusive'); assert.equal(result.reason, 'CANCELLED');
  assert.equal(result.admission, 'quarantined'); assert.equal(result.actionAttempted, false); await f.service.close();
});

for (const uncertain of [false, true]) {
  test(`imported ${uncertain ? 'uncertain' : 'completed'} records resolve read-only without allocating or attaching`, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-imported-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const journalRoot = join(root, 'historical'); const directory = join(journalRoot, createHash('sha256').update(device).digest('hex'));
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const input = { deviceId: device, actionId: 'old', intent: { historical: 'tap' } };
    const intent = join(directory, `${createHash('sha256').update('old').digest('hex')}.intent.json`);
    const result = join(directory, `${createHash('sha256').update('old').digest('hex')}.result.json`);
    writeFileSync(intent, JSON.stringify({ ...input, status: 'in-flight' }), { mode: 0o600 });
    writeFileSync(result, JSON.stringify({ ...input, status: 'completed', result: { status: 'outcome_observed',
      actionAttempted: true, actionAcknowledged: true, observations: 2 } }), { mode: 0o600 });
    if (uncertain) writeFileSync(join(directory, 'claim.json'), JSON.stringify({ ...input, token: 'historical-owner' }), { mode: 0o600 });
    const store = join(root, 'store');
    migrateAdmissionForTesting({ version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
      additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [] },
      { root: store, backend: 'fake', defaultRoots: { journal: journalRoot, leases: join(root, 'historical-leases') } });
    const admission = Admission.forTesting({ root: store, backend: 'fake', initialize: false });
    const service = new ObservedActionService({ admission, runsDir: '/new/evidence', bridgeVersion: 'new', backend: 'fake',
      createDriver: () => assert.fail('Imported identity cannot attach') });
    const journal = new ObservedActionJournal(service);
    const bytes = readFileSync(join(store, 'admission.sqlite')); const sources = [readFileSync(intent), readFileSync(result)];
    const snapshot = await service.inspect('old'); assert.equal(snapshot.authority, 'committed');
    assert.equal(snapshot.outcome, uncertain ? 'inconclusive' : 'outcome_observed');
    assert.equal(snapshot.actionAttempted, uncertain ? null : true); assert.equal(snapshot.actionAcknowledged, uncertain ? null : true);
    assert.equal(snapshot.evidence.request, intent); assert.equal(snapshot.evidence.terminal, null);
    assert.deepEqual(await journal.read(device.toLowerCase(), 'old'), snapshot);
    assert.equal(await journal.read('ABCDEF00-0000-4000-8000-000000000002', 'old'), undefined);
    assert.equal(await journal.read(device, 'missing'), undefined);
    await assert.rejects(journal.read('invalid', 'old'), { code: 'INVALID_REQUEST' });
    await assert.rejects(journal.deviceStatus(device), { code: 'MIGRATION_REQUIRED' });
    assert.deepEqual(await service.cancel('old'), snapshot);
    const historical = { experimental: 'observed-tap-v1', actionId: 'old', deviceId: device, app: { bundleId: 'dev.fixture' },
      selector: { identifier: 'go' }, before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 100 };
    assert.deepEqual(await runObservedExperiment(historical, '/arbitrary/unused', { cwd: '/changed', service }), snapshot);
    const corrupt = structuredClone(admission.readAction('old')!);
    if (corrupt.kind === 'imported') Object.assign(corrupt.action, { outcome: 'invented' });
    assert.throws(() => renderObservedAction(corrupt), { code: 'STORE_UNAVAILABLE' });
    await service.close();
    assert.deepEqual(readFileSync(join(store, 'admission.sqlite')), bytes);
    assert.deepEqual([readFileSync(intent), readFileSync(result)], sources);
  });
}
test('historical ready-allocation adapter uses the same resolver and refuses another device or identity', async t => {
  const calls: string[] = [];
  const { root, admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(true); });
  await ready(admission);
  const raw = { experimental: 'observed-tap-v1', actionId: 'one', deviceId: device.toLowerCase(), app: { bundleId: 'dev.fixture' },
    selector: { identifier: 'go' }, before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 };
  await assert.rejects(runObservedExperiment({ ...raw, deviceId: 'ABCDEF00-0000-4000-8000-000000000002' }, '/unused', { cwd: root, service }),
    { code: 'MIGRATION_REQUIRED' });
  await assert.rejects(runObservedExperiment({ ...raw, actionId: 'other' }, '/unused', { cwd: root, service }), { code: 'MIGRATION_REQUIRED' });
  assert.deepEqual(calls, []);
  const result = await runObservedExperiment(raw, '/unused', { cwd: root, service });
  assert.equal(result.outcome, 'already_satisfied'); assert.deepEqual(result, await service.inspect('one')); assert.deepEqual(calls, ['snapshot-ui']);
  assert.equal((await runObservedExperiment(raw, '/unused', { cwd: root, service })).disposition, 'retrieved');
  assert.deepEqual(calls, ['snapshot-ui']); await service.close();
});

test('a settled acknowledged input with no observed outcome expires inconclusive without a second tap', async t => {
  const calls: string[] = [];
  const { admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(false, args[1] === 'touch'); });
  const raw = request(await ready(admission)); raw.timeoutMs = 2500; await service.start(raw);
  const result = await service.inspect('one', { waitMs: 5000 });
  assert.equal(result.outcome, 'inconclusive'); assert.equal(result.reason, 'DEADLINE_EXCEEDED');
  assert.equal(result.actionAttempted, true); assert.equal(result.actionAcknowledged, true);
  assert.equal(calls.filter(call => call === 'touch').length, 1); assert.ok(result.observations >= 2);
  assert.equal(result.admission, 'quarantined'); await service.close();
});
test('retained allocations exclude another action and global identity cannot be reassigned', async t => {
  const calls: string[] = []; const { admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(true); });
  const allocationId = await ready(admission); const raw = request(allocationId);
  await service.start(raw); await service.inspect('one', { waitMs: 5000 });
  await assert.rejects(service.start({ ...raw, actionId: 'other' }), { code: 'ACTION_ID_CONFLICT' });
  await assert.rejects(service.start({ ...raw, allocationId: 'ABCDEF00-0000-4000-8000-000000000099' }), { code: 'ACTION_ID_CONFLICT' });
  await assert.rejects(service.start({ ...raw, app: { bundleId: 'dev.other' } }), { code: 'ACTION_ID_CONFLICT' });
  const previous = admission.readAllocation(allocationId)!;
  const next = admission.reserveAllocation({ actionId: 'other', preparationDigest: previous.preparationDigest, preparation: previous.preparation,
    appBundleId: previous.appBundleId, source: { ...previous.source, kind: 'supplied', inventoryId: 'other', udid: device,
      deviceTypeId: 'device', runtimeId: 'runtime', creation: { createdAt: 'fixture', origin: 'fixture', evidenceRef: '/isolated/creation' },
      attestation: { freshUnused: true, exclusive: true } }, inspectedContentDigest: previous.inspectedContentDigest,
    artifactBytes: previous.artifactBytes, configVersion: previous.configVersion, configDigest: previous.configDigest,
    evidenceDirectory: '/isolated/other', budgets: previous.budgets, storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } });
  assert.deepEqual(next, { kind: 'refused', reason: 'INVENTORY_INELIGIBLE' }); assert.equal(admission.readAction('other'), undefined);
  assert.deepEqual(calls, ['snapshot-ui']); await service.close();
});
test('store closure refuses reads/start safely and never reconstructs authority from terminal exports', async t => {
  const calls: string[] = []; const { root, admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(true); });
  const raw = request(await ready(admission)); await service.start(raw); const terminal = await service.inspect('one', { waitMs: 5000 });
  assert.equal(terminal.outcome, 'already_satisfied');
  rmSync(join(root, 'store', 'admission.sqlite'));
  await assert.rejects(service.inspect('one'), { code: 'STORE_UNAVAILABLE' }); await assert.rejects(service.start(raw), { code: 'STORE_UNAVAILABLE' });
  assert.equal(JSON.parse(readFileSync(terminal.evidence.terminal!, 'utf8')).outcome, 'already_satisfied');
  assert.deepEqual(calls, ['snapshot-ui']); await service.close();
});
test('read validation and healthy foreign-owner polling do not mutate or take over an action', async t => {
  const { root, admission, service } = fixture(t, async () => assert.fail('No execution'));
  const raw = parseObservedAction(request(await ready(admission))); const directory = join(root, 'no-files');
  admission.consumeAllocation({ actionId: raw.actionId, allocationId: raw.allocationId, actionDigest: observedActionDigest(raw),
    request: JSON.parse(JSON.stringify(raw)), appBundleId: raw.app.bundleId, evidence: { directory, request: join(directory, 'request.json'), bridgeVersion: 'fixture' } });
  const bytes = readFileSync(join(root, 'store', 'admission.sqlite'));
  assert.equal((await service.inspect('one', { waitMs: 100 })).state, 'running');
  assert.equal((await service.start(raw)).disposition, 'retrieved');
  await assert.rejects(service.inspect('../invalid'), { code: 'INVALID_REQUEST' });
  for (const waitMs of [-1, 45001, 1.5, NaN]) await assert.rejects(service.inspect('one', { waitMs }), { code: 'INVALID_REQUEST' });
  await assert.rejects(service.inspect('one', { signal: AbortSignal.abort() }), { code: 'WAIT_CANCELLED' });
  service.recoverAbandoned(); await service.close(); assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), bytes);
});
test('allocator configuration errors are typed preparation errors and shutdown never closes the borrowed store', async t => {
  const { admission, service } = fixture(t, async () => assert.fail('No backend'));
  await assert.rejects(service.getAllocation('identity'), error => {
    assert.equal((error as { code: string }).code, 'CONFIGURATION_ERROR');
    assert.equal((error as { toJSON(): { acceptanceKind: string } }).toJSON().acceptanceKind, 'preparation'); return true;
  });
  await service.close(); assert.equal(admission.readAction('missing'), undefined);
  await assert.rejects(service.prepareAllocation({}), { code: 'SHUTTING_DOWN' });
});

test('shutdown synchronously closes owned action and allocator gates before awaiting either cleanup', async t => {
  const entered = deferred<void>(t, 'backend entry'); const pending = deferred<ReturnType<typeof reply>>(t, 'backend reply release'); const allocatorDone = deferred<void>(t, 'allocator close release');
  let allocatorClosed = false; let admission!: Admission;
  const allocator: ObservedAllocator = { async prepare() {}, async get() {}, async cancel() {}, async retire() {},
    consume(binding) { return admission.consumeAllocation(binding); },
    close() { allocatorClosed = true; return allocatorDone.promise; } };
  const f = fixture(t, async () => { entered.resolve(); return pending.promise; }, { allocator }); admission = f.admission;
  const raw = request(await ready(admission)); raw.timeoutMs = 5000; await f.service.start(raw); await entered.promise;
  const closing = f.service.close();
  assert.equal(allocatorClosed, true); const view = admission.readAction('one');
  assert.equal(view?.kind === 'allocation' && view.attempt?.cancellationRequested, true);
  allocatorDone.resolve(); await closing; pending.resolve(reply(false));
  assert.equal((await f.service.inspect('one')).outcome, 'inconclusive');
});

test('authoritative renderer validates binding consistency and absolute evidence before exposing success', async t => {
  const { admission, service } = fixture(t, async () => reply(true));
  await service.start(request(await ready(admission))); const snapshot = await service.inspect('one', { waitMs: 5000 });
  const view = admission.readAction('one')!; assert.equal(view.kind, 'allocation'); if (view.kind !== 'allocation') throw new Error('fixture');
  assert.deepEqual(renderObservedAction(view), snapshot); assert.equal(observedActionExitCode(snapshot), 0);
  assert.ok(observedActionSummary(snapshot).includes(snapshot.evidence.directory));
  const mutations = [
    (value: typeof view) => { value.attempt!.digest = 'different'; },
    (value: typeof view) => { value.allocation.actionEvidence!.observations = ['relative.json']; },
    (value: typeof view) => { value.allocation.actionEvidence!.terminal = 'relative.json'; },
    (value: typeof view) => { value.allocation.actionEvidence!.actionAttempted = true; },
    (value: typeof view) => { value.allocation.actionEvidence!.state = 'running'; },
  ];
  for (const mutate of mutations) { const changed = structuredClone(view); mutate(changed); assert.throws(() => renderObservedAction(changed), { code: 'STORE_UNAVAILABLE' }); }
  assert.equal(observedActionExitCode({ ...snapshot, authority: 'none', outcome: null }), 2);
  assert.equal(observedActionExitCode({ ...snapshot, outcome: 'refused' }), 3);
  assert.equal(observedActionExitCode({ ...snapshot, outcome: 'inconclusive' }), 2); await service.close();
});

for (const mode of ['error', 'pending'] as const) {
  test(`local close ${mode} cannot promote an observed success and finishes within the separate five-second budget`, async t => {
    let driver!: ReturnType<typeof createObservedDriver>; const release = deferred<void>(t, 'local finalization release');
    let finalizationBegan: number | undefined;
    const { root, admission, service } = fixture(t, async () => reply(true), { createDriver: () => ({
      attachObserved: (...args) => driver.attachObserved(...args), observe: (...args) => driver.observe(...args),
      tapOnce: (...args) => driver.tapOnce(...args), revokeIssuance: () => driver.revokeIssuance(),
      async close() { if (mode === 'error') throw new Error('Unknown local close'); await release.promise; },
    }) }, { fault(point, operation) {
      if (point === 'beforeCommit' && operation === 'beginActionFinalization') finalizationBegan = Date.now();
    } });
    const runner: CliRunner = async () => reply(true);
    driver = createObservedDriver({ cwd: root, admission, lockRoot: join(root, 'leases'), runner,
      deviceWindow: async () => assert.fail('No window'), fakeBackend: { runner, window: undefined } });
    const raw = request(await ready(admission)); raw.timeoutMs = 6000; await service.start(raw);
    const result = await service.inspect('one', { waitMs: 7000 });
    assert.equal(result.authority, 'committed'); assert.equal(result.outcome, 'inconclusive'); assert.equal(result.reason, 'FINISH_UNCONFIRMED');
    assert.equal(result.actionAttempted, false); assert.equal(result.admission, 'quarantined');
    assert.ok(finalizationBegan !== undefined, 'Finalization began'); assert.ok(Date.now() - finalizationBegan < 6500);
    assert.equal(result.evidence.exportStatus, mode === 'pending' ? 'failed' : 'complete');
    const before = admission.readAction('one'); release.resolve(); await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(admission.readAction('one'), before); await service.close();
  });
}
test('aborting the historical wait leaves admitted execution running to its authoritative result', async t => {
  const calls: string[] = []; const { admission, service } = fixture(t, async args => { calls.push(args[1]!); return reply(true); });
  await ready(admission);
  const raw = { experimental: 'observed-tap-v1', actionId: 'one', deviceId: device, app: { bundleId: 'dev.fixture' },
    selector: { identifier: 'go' }, before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 };
  await assert.rejects(runObservedExperiment(raw, '/unused', { cwd: '/unused', service, signal: AbortSignal.abort() }), { code: 'WAIT_CANCELLED' });
  const terminal = await service.inspect('one', { waitMs: 5000 }); assert.equal(terminal.outcome, 'already_satisfied');
  assert.equal(terminal.cancellationRequested, false); assert.deepEqual(calls, ['snapshot-ui']); await service.close();
});

test('a fresh attachment failure is conservative preparation uncertainty with no observation or input', async t => {
  const { admission, service } = fixture(t, async () => assert.fail('No backend'), {
    createDriver: () => ({ async attachObserved() { throw new Error('Unknown attachment'); }, async observe() { assert.fail('No observation'); },
      async tapOnce() { assert.fail('No input'); }, revokeIssuance() {}, async close() {} }),
  });
  await service.start(request(await ready(admission))); const result = await service.inspect('one', { waitMs: 5000 });
  assert.equal(result.outcome, 'inconclusive'); assert.equal(result.reason, 'PREPARATION_UNCONFIRMED');
  assert.equal(result.actionAttempted, false); assert.equal(result.actionAcknowledged, false); assert.equal(result.admission, 'quarantined');
  await service.close();
});

test('production capture composition forces full fresh captures and private screenshots with no reuse, verification probe or stop', async t => {
  let factory!: () => ReturnType<typeof createObservedDriver>; let captures = 0; const calls: string[][] = [];
  const { root, admission, service } = fixture(t, async () => assert.fail('Wrong factory'), { createDriver: () => factory() });
  const source = join(root, 'vendor-shot.jpg'); writeFileSync(source, 'private fixture image', { mode: 0o600 });
  const runner: CliRunner = async args => {
    calls.push(args);
    if (args[1] === 'screenshot') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.capture-result', schemaVersion: '2',
      data: { artifacts: { simulatorId: device, screenshotPath: source }, capture: { path: source } } }), stderr: '', exitCode: 0 };
    if (args[1] === 'touch') return reply(true, true); return reply(++captures > 1);
  };
  factory = observedDriverFactory({ cwd: root, admission, lockRoot: join(root, 'leases'), runner,
    deviceWindow: async () => assert.fail('No window'), fakeBackend: { runner, window: undefined },
    screenshots: false, capture: 'compact', reuseActionCapture: true, verifyScreenshotAgreement: true, stopAppOnClose: true });
  const raw = request(await ready(admission)); raw.timeoutMs = 5000; await service.start(raw);
  const result = await service.inspect('one', { waitMs: 6000 }); assert.equal(result.outcome, 'outcome_observed');
  assert.deepEqual(calls.map(args => args[1]), ['snapshot-ui', 'screenshot', 'touch', 'snapshot-ui', 'screenshot']);
  assert.equal(calls[0]!.includes('--verbose'), true); assert.equal(calls[2]!.includes('--verbose'), false);
  assert.equal(result.observations, 2); assert.equal(result.evidence.observations.length, 4);
  for (const path of result.evidence.observations.filter(path => path.endsWith('.jpg'))) assert.deepEqual(readFileSync(path), readFileSync(source));
  await service.close(); assert.equal(calls.some(args => ['launch-app', 'stop', 'list', 'boot', 'install'].includes(args[1]!)), false);
});

for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`consume ${point} failure resolves authoritatively without attaching or rebinding`, async t => {
    const { admission, service } = fixture(t, async () => assert.fail('No backend'), {}, {
      fault: (seen, operation) => { if (seen === point && operation === 'consumeAllocation') throw new Error('Lost consume reply'); },
    });
    const raw = request(await ready(admission));
    if (point === 'beforeCommit') {
      await assert.rejects(service.start(raw), error => {
        assert.equal((error as { code: string }).code, 'STORE_UNAVAILABLE');
        assert.equal((error as { toJSON(): { acceptance: string } }).toJSON().acceptance, 'unknown'); return true;
      });
      await assert.rejects(service.inspect('one'), { code: 'ACTION_NOT_STARTED' });
    } else {
      const result = await service.start(raw); assert.equal(result.disposition, 'retrieved');
      assert.equal(result.state, 'running'); assert.equal(result.authority, 'none'); assert.equal(result.outcome, null);
      assert.equal((await service.start(raw)).disposition, 'retrieved');
    }
    await service.close();
  });
}
test('retrieved consume and host creation refusal invoke zero driver or probe calls', async t => {
  let admission!: Admission; let consumed = false; let blockerId = '';
  const allocator: ObservedAllocator = { async prepare() {}, async get() {}, async cancel() {}, async retire() {}, async close() {},
    consume(binding) {
      if (consumed) return { kind: 'refused', reason: 'HOST_CREATION_UNRESOLVED', blockingAllocationId: blockerId };
      consumed = true; const result = admission.consumeAllocation(binding); assert.equal(result.kind, 'consumed');
      if (result.kind !== 'consumed') throw new Error('fixture'); return { kind: 'retrieved', allocation: result.allocation };
    } };
  const f = fixture(t, async () => assert.fail('No backend'), { allocator, createDriver: () => assert.fail('No attachment') }); admission = f.admission;
  const allocationId = await ready(admission);
  assert.equal((await f.service.start(request(allocationId))).disposition, 'retrieved');
  blockerId = await unresolvedCreator(admission, allocationId);
  await assert.rejects(f.service.start(request('ABCDEF00-0000-4000-8000-000000000098', 'other')), error => {
    const value = error as { code: string; toJSON(): { blockingAllocationId: string; acceptance: string; evidenceDirectory: string } };
    assert.equal(value.code, 'HOST_CREATION_UNRESOLVED'); assert.equal(value.toJSON().blockingAllocationId, blockerId);
    assert.equal(value.toJSON().evidenceDirectory, '/isolated/blocker-evidence');
    assert.equal(value.toJSON().acceptance, 'no'); return true;
  });
  await f.service.close();
});
test('a retired unused allocation refuses action consumption without binding action intent', async t => {
  const { admission, service } = fixture(t, async () => assert.fail('No backend'));
  const id = await ready(admission); admission.retireAllocation(id);
  await assert.rejects(service.start(request(id)), { code: 'ALLOCATION_NOT_READY' });
  assert.equal(admission.readAllocation(id)?.actionDigest, null); await assert.rejects(service.inspect('one'), { code: 'ACTION_NOT_STARTED' });
  await service.close();
});
for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`export tracking ${point} failure cannot rewrite the committed outcome`, async t => {
    const { admission, service } = fixture(t, async () => reply(true), {}, {
      fault: (seen, operation) => { if (seen === point && operation === 'recordActionExport') throw new Error('Export status uncertainty'); },
    });
    await service.start(request(await ready(admission))); const result = await service.inspect('one', { waitMs: 5000 });
    assert.equal(result.authority, 'committed'); assert.equal(result.outcome, 'already_satisfied'); assert.equal(result.admission, 'available');
    assert.equal(result.evidence.exportStatus, point === 'beforeCommit' ? 'pending' : 'complete');
    assert.equal((await service.inspect('one')).outcome, 'already_satisfied'); await service.close();
  });
}
test('explicit startup recovery quarantines only the proven abandoned expected owner; reads stay invariant', async t => {
  const { root, admission, service } = fixture(t, async () => assert.fail('No backend'), { ownerLiveness: () => 'dead' },
    { process: { pid: 999999999, incarnation: 'proven-dead-fixture' }, ownerLiveness: () => 'dead' });
  const raw = parseObservedAction(request(await ready(admission))); const directory = join(root, 'missing');
  const result = admission.consumeAllocation({ actionId: raw.actionId, allocationId: raw.allocationId, actionDigest: observedActionDigest(raw),
    request: JSON.parse(JSON.stringify(raw)), appBundleId: raw.app.bundleId, evidence: { directory, request: join(directory, 'request.json'), bridgeVersion: 'fixture' } });
  assert.equal(result.kind, 'consumed');
  const bytes = readFileSync(join(root, 'store', 'admission.sqlite')); assert.equal((await service.inspect('one')).state, 'unresolved');
  assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), bytes);
  service.recoverAbandoned(); const terminal = await service.inspect('one');
  assert.equal(terminal.outcome, 'inconclusive'); assert.equal(terminal.reason, 'OWNER_LOST'); assert.equal(terminal.admission, 'quarantined');
  assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
  const committed = readFileSync(join(root, 'store', 'admission.sqlite')); await service.start(raw); await service.close();
  assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), committed);
});

test('local cancel fences continuation even when initial authoritative read fails', async t => {
  const entered = deferred<void>(t, 'backend entry'); const pending = deferred<ReturnType<typeof reply>>(t, 'backend reply release');
  const calls: string[] = []; let driver!: ReturnType<typeof createObservedDriver>; let revocations = 0;
  const runner: CliRunner = async args => {
    calls.push(args[1]!);
    if (calls.length === 1) { entered.resolve(); return pending.promise; }
    return reply(true, args[1] === 'touch');
  };
  const { root, admission, service } = fixture(t, runner, { createDriver: () => ({
    attachObserved: (...args) => driver.attachObserved(...args), observe: (...args) => driver.observe(...args),
    tapOnce: (...args) => driver.tapOnce(...args), revokeIssuance() { revocations++; driver.revokeIssuance(); },
    close: signal => driver.close(signal),
  }) });
  driver = createObservedDriver({ cwd: root, admission, lockRoot: join(root, 'leases'), runner,
    deviceWindow: async () => assert.fail('No window'), fakeBackend: { runner, window: undefined } });
  await service.start(request(await ready(admission))); await entered.promise;
  const db = join(root, 'store', 'admission.sqlite');
  renameSync(db, db + '.temporarily-unavailable');
  try {
    const cancellation = service.cancel('one');
    assert.equal(revocations, 1, 'The owned local gate is revoked synchronously before cancellation awaits authority');
    await assert.rejects(cancellation, { code: 'STORE_UNAVAILABLE' });
  }
  finally { renameSync(db + '.temporarily-unavailable', db); }
  pending.resolve(reply(false));
  const terminal = await service.inspect('one', { waitMs: 3000 });
  await service.close();
  assert.deepEqual(calls, ['snapshot-ui'], 'Explicit local cancellation prevents follow-up input despite an unavailable initial read');
  assert.equal(terminal.cancellationRequested, false, 'An unavailable cancellation read cannot invent durable cancellation');
  assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
  assert.equal(terminal.observations, 0); assert.deepEqual(terminal.evidence.observations, []);
  assert.equal(terminal.state, 'unresolved'); assert.equal(terminal.authority, 'unconfirmed');
  assert.equal(terminal.outcome, null); assert.equal(terminal.reason, 'FINALIZATION_UNCONFIRMED');
});

test('settled close within finalization budget does not consume action observation budget', async t => {
  let driver!: ReturnType<typeof createObservedDriver>; let deadline!: AbortController;
  const calls: string[] = [];
  const runner: CliRunner = async args => { calls.push(args[1]!); return reply(true); };
  const { root, admission, service } = fixture(t, runner, { createDriver: () => ({
    attachObserved: (...args) => driver.attachObserved(...args),
    observe: async (...args) => {
      const value = await driver.observe(...args);
      assert.equal(deadline.signal.aborted, false, 'Observation settles before the action deadline');
      return value;
    },
    tapOnce: (...args) => driver.tapOnce(...args), revokeIssuance: () => driver.revokeIssuance(),
    close: async signal => {
      await driver.close(signal);
      deadline.abort(new DOMException('Action deadline expired', 'TimeoutError'));
      assert.equal(signal.aborted, false, 'Local close settles inside the separate finalization budget after action expiry');
    },
  }) });
  driver = createObservedDriver({ cwd: root, admission, lockRoot: join(root, 'leases'), runner,
    deviceWindow: async () => assert.fail('No window'), fakeBackend: { runner, window: undefined } });
  const raw = request(await ready(admission)); raw.timeoutMs = 500;
  deadline = actionDeadline(t);
  await service.start(raw); const terminal = await service.inspect('one', { waitMs: 5000 });
  await service.close(); assert.equal(terminal.outcome, 'already_satisfied');
  assert.equal(terminal.authority, 'committed'); assert.equal(terminal.reason, null);
  assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
  assert.equal(terminal.observations, 1); assert.deepEqual(calls, ['snapshot-ui']);
  assert.equal(terminal.cancellationRequested, false); assert.equal(terminal.admission, 'available');
  assert.equal(terminal.evidence.exportStatus, 'complete');
  assert.equal(deadline.signal.aborted, true, 'Local close outlasted the action deadline');
});

for (const phase of ['close', 'provisional'] as const) {
  test(`local cancellation with a failed durable write during prolonged ${phase} cannot commit computed success`, async t => {
    let driver!: ReturnType<typeof createObservedDriver>; let failing = false;
    const entered = deferred<void>(t, `${phase} entry`); const release = deferred<void>(t, 'local finalization release'); const files = new FileObservedEvidence();
    const calls: string[] = [];
    const runner: CliRunner = async args => { calls.push(args[1]!); return reply(true); };
    const evidence: ObservedEvidenceStore = {
      prepare: (...args) => files.prepare(...args), observation: (...args) => files.observation(...args),
      async provisional(directory, result) {
        if (phase === 'provisional') { entered.resolve(); await release.promise; }
        await files.provisional(directory, result);
      }, terminal: (...args) => files.terminal(...args),
    };
    const { root, admission, service } = fixture(t, runner, { evidence, createDriver: () => ({
      attachObserved: (...args) => driver.attachObserved(...args), observe: (...args) => driver.observe(...args),
      tapOnce: (...args) => driver.tapOnce(...args), revokeIssuance: () => driver.revokeIssuance(),
      async close(signal) { await driver.close(signal); if (phase === 'close') { entered.resolve(); await release.promise; } },
    }) }, { fault: (point, operation) => {
      if (failing && point === 'beforeCommit' && operation === 'cancel') throw new Error('Injected cancellation write failure');
    } });
    driver = createObservedDriver({ cwd: root, admission, lockRoot: join(root, 'leases'), runner,
      deviceWindow: async () => assert.fail('No window'), fakeBackend: { runner, window: undefined } });
    const raw = request(await ready(admission)); raw.timeoutMs = 500;
    const deadline = actionDeadline(t);
    await service.start(raw); await entered.promise;
    deadline.abort(new DOMException('Action deadline expired', 'TimeoutError'));
    failing = true;
    await assert.rejects(service.cancel('one'), { code: 'STORE_UNAVAILABLE' });
    assert.equal((await service.inspect('one')).cancellationRequested, false);
    release.resolve(); const terminal = await service.inspect('one', { waitMs: 3000 });
    assert.equal(terminal.authority, 'committed'); assert.equal(terminal.outcome, 'inconclusive');
    assert.equal(terminal.reason, 'CANCELLED');
    assert.equal(terminal.cancellationRequested, true, 'The verified joint finalization commits the claim cancellation flag');
    assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
    assert.equal(terminal.admission, 'quarantined'); assert.equal(terminal.observations, 1);
    assert.deepEqual(calls, ['snapshot-ui']); await service.close();
  });
}

async function unresolvedCreator(admission: Admission, readyId: string) {
  const record = admission.readAllocation(readyId)!;
  const reserved = admission.reserveAllocation({ actionId: 'blocker', preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'create', deviceTypeId: 'device', runtimeId: 'runtime' }, inspectedContentDigest: digest, artifactBytes: 100,
    configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/blocker-evidence', budgets: record.budgets,
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } });
  assert.equal(reserved.kind, 'reserved'); if (reserved.kind !== 'reserved') throw new Error('Fixture reservation refused');
  reserved.reservation.stage(record.staged!);
  await reserved.reservation.create(async () => ({ status: 'unknown', reason: 'CREATE_UNCONFIRMED' }));
  return reserved.reservation.identity.allocationId;
}

test('host creation refusal exposes persisted blocking allocation evidence', async t => {
  const { root, admission, service } = fixture(t, async () => assert.fail('No backend'), { createDriver: () => assert.fail('No attachment') });
  const id = await ready(admission); const blocker = await unresolvedCreator(admission, id);
  const before = readFileSync(join(root, 'store', 'admission.sqlite')); const capacity = admission.readAllocationCapacity();
  let result!: Record<string, unknown>;
  try { await service.start(request(id)); }
  catch (error) { result = (error as { toJSON(): Record<string, unknown> }).toJSON(); }
  assert.equal(result.code, 'HOST_CREATION_UNRESOLVED'); assert.equal(result.evidenceDirectory, '/isolated/blocker-evidence');
  assert.equal(result.acceptance, 'no'); assert.equal(result.allocationId, id); assert.equal(result.actionId, 'one');
  assert.equal(result.blockingAllocationId, blocker);
  assert.equal(admission.readAllocation(id)!.state, 'ready'); assert.equal(admission.readAllocation(id)!.actionDigest, null);
  assert.equal(admission.readAllocation(blocker)!.hostCreationBlocked, true);
  assert.deepEqual(admission.readAllocationCapacity(), capacity);
  assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), before); await service.close();
});

for (const mode of ['unavailable', 'missing', 'relative', 'wrong-identity', 'not-blocking'] as const) {
  test(`unverified ${mode} blocker evidence refuses safely without attaching or consuming`, async t => {
    const { root, admission, service } = fixture(t, async () => assert.fail('No backend'), { createDriver: () => assert.fail('No attachment') });
    const id = await ready(admission); const blocker = await unresolvedCreator(admission, id);
    const read = admission.readAllocation.bind(admission);
    const before = readFileSync(join(root, 'store', 'admission.sqlite')); const capacity = admission.readAllocationCapacity();
    // Fault only the borrowed allocation-read capability after the real store commits the host guard.
    admission.readAllocation = allocationId => {
      assert.equal(allocationId, blocker);
      if (mode === 'unavailable') throw new Error('Injected read failure');
      if (mode === 'missing') return undefined;
      const record = read(allocationId)!;
      return { ...record, ...(mode === 'relative' ? { evidenceDirectory: 'relative/path' } :
        mode === 'wrong-identity' ? { allocationId: id } : { hostCreationBlocked: false }) };
    };
    try {
      await assert.rejects(service.start(request(id)), (error: unknown) => {
        const result = (error as { toJSON(): Record<string, unknown> }).toJSON();
        assert.equal(result.code, 'STORE_UNAVAILABLE'); assert.equal(result.acceptance, 'no');
        assert.equal(result.actionId, 'one'); assert.equal(result.allocationId, id); assert.equal(result.blockingAllocationId, blocker);
        assert.equal(result.evidenceDirectory, undefined); return true;
      });
    } finally { admission.readAllocation = read; }
    assert.equal(read(id)!.state, 'ready'); assert.equal(read(id)!.actionDigest, null); assert.equal(read(blocker)!.hostCreationBlocked, true);
    assert.deepEqual(admission.readAllocationCapacity(), capacity);
    assert.deepEqual(readFileSync(join(root, 'store', 'admission.sqlite')), before); await service.close();
  });
}
