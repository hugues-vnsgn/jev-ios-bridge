import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Admission, type AdmissionRequest, type TerminalCandidate } from '../src/device/admission.js';
import { hostFixture } from './fixtures/observed-host/harness.js';
import { allocation, errorCode } from './fixtures/public-contention.js';
import { bounded, barrier, coreWorker } from './fixtures/admission-race-harness.js';

const device = 'ABCDEF00-0000-4000-8000-000000000001';
const request = (id: string): AdmissionRequest => ({ device, attempt: { kind: 'legacy', id }, digest: 'same', intent: { operation: 'tap' } });
const terminal: TerminalCandidate = { outcome: 'inconclusive', disposition: 'quarantined', payload: { reason: 'closed' }, evidenceRefs: [] };
function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-admission-race-')));
  const admission = Admission.forTesting({ root, backend: 'fake' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission };
}

test('H01 two public creates before the first response reserve one creation slot', { timeout: 30000 }, async t => {
  const f = await hostFixture(t);
  const input = f.request('one');
  const first = f.spawnOwner('cli', 'observed-allocate', await f.requestFile(input), { gate: 'backend:create:1' });
  await bounded('H01 create entered', f.milestone('backend:create:1', first.child.pid));
  const pending = f.admission().readAllocationForAction('one');
  assert.equal(pending?.phase, 'creating'); assert.equal(pending.hostCreationBlocked, true);
  assert.deepEqual(f.admission().readAllocationCommands(pending.allocationId).map(c => [c.operation, c.state]), [['create', 'outstanding']]);
  const before = await f.database();
  const duplicate = await bounded('H01 duplicate', f.cli('observed-allocate', await f.requestFile(input, 'duplicate.json')));
  assert.equal(allocation(duplicate.reply).allocationId, pending.allocationId);
  const conflict = await bounded('H01 changed identity', f.cli('observed-allocate', await f.requestFile({ ...input, app: { ...input.app, build: { ...input.app.build, id: 'changed' } } }, 'changed.json')));
  assert.equal(errorCode(conflict.reply), 'ACTION_ID_CONFLICT');
  const other = await bounded('H01 other creation', f.cli('observed-allocate', await f.requestFile(f.request('two'), 'other.json')));
  assert.equal(errorCode(other.reply), 'HOST_CREATION_UNRESOLVED');
  assert.deepEqual(await f.database(), before);
  await f.release();
  const result = await bounded('H01 first response', first.exited);
  assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).state, 'ready');
  assert.equal(f.calls().filter(call => call === 'create').length, 1);
});

for (const cut of ['before-admit', 'before-issue', 'accepted', 'queued'] as const) {
  test(`H02 close ${cut} prevents every later command and retains issued work`, { timeout: 30000 }, async t => {
    const { root, admission } = fixture(t);
    const controller = new AbortController();
    if (cut === 'before-admit') controller.abort();
    const acquired = admission.acquire({ ...request('close'), signal: controller.signal });
    if (cut === 'before-admit') {
      assert.deepEqual(acquired, { kind: 'refused', reason: 'CANCELLED' });
      assert.equal(admission.readAttempt(request('close').attempt), undefined);
      return;
    }
    assert.equal(acquired.kind, 'acquired');
    if (acquired.kind !== 'acquired') throw new Error('H02 owner missing');
    const session = acquired.claim.bindDriver('fake');
    const effects: string[] = [];
    let finish!: () => void;
    const accepted = new Promise<void>(resolve => { finish = resolve; });
    const inFlight = cut === 'before-issue' ? undefined : session.dispatch('tap', () => { effects.push('tap'); return accepted; });
    const queued = cut === 'queued' ? session.dispatch('capture', async () => { effects.push('capture'); }) : undefined;
    const queueResult = queued ? assert.rejects(queued, { code: 'DISPATCH_CLOSED' }) : undefined;
    const external = Admission.forTesting({ root, backend: 'fake', initialize: false });
    assert.equal(external.cancel(request('close').attempt)?.cancellationRequested, true);
    assert.throws(() => session.dispatch('late', async () => { effects.push('late'); }), { code: 'DISPATCH_CLOSED' });
    assert.deepEqual(admission.readGeneration(acquired.claim.identity).commands.map(c => c.state), cut === 'before-issue' ? [] : ['uncertain']);
    finish();
    if (inFlight) await bounded('H02 accepted completion', inFlight);
    if (queueResult) await bounded('H02 queued refusal', queueResult);
    assert.deepEqual(effects, cut === 'before-issue' ? [] : ['tap']);
    assert.equal(acquired.claim.closeDispatch(terminal).authority, 'committed');
    assert.deepEqual(admission.readAttempt(request('close').attempt)?.terminal, terminal);
    assert.equal(admission.inspect(device)?.state, 'quarantined');
  });
}

test('H03 buffered worker request after durable closure and authority restart never replays', { timeout: 30000 }, async t => {
  const { root, admission } = fixture(t);
  const worker = await coreWorker(t, root);
  const acquired = await worker.exchange({ operation: 'acquire', request: request('buffered') });
  assert.equal(acquired.result.kind, 'acquired');
  if (acquired.result.kind !== 'acquired') throw new Error('H03 owner missing');
  const buffered = { operation: 'dispatch' } as const;
  admission.cancel(request('buffered').attempt);
  const first = await worker.exchange(buffered);
  assert.equal(first.result.kind, 'unexpected-error');
  if (first.result.kind !== 'unexpected-error') throw new Error('H03 refusal missing');
  assert.equal(first.result.code, 'DISPATCH_CLOSED'); assert.equal(first.effects, 0);
  const restarted = Admission.forTesting({ root, backend: 'fake', initialize: false });
  const view = restarted.readAttempt(request('buffered').attempt);
  const afterRestart = await worker.exchange(buffered);
  assert.equal(afterRestart.result.kind, 'unexpected-error');
  if (afterRestart.result.kind !== 'unexpected-error') throw new Error('H03 restarted refusal missing');
  assert.equal(afterRestart.result.code, 'DISPATCH_CLOSED');
  assert.equal(afterRestart.effects, 0);
  const duplicate = await coreWorker(t, root);
  const result = await duplicate.exchange({ operation: 'acquire', request: request('buffered') });
  assert.equal(result.result.kind, 'retrieved'); assert.equal(result.effects, 0);
  assert.deepEqual(restarted.readAttempt(request('buffered').attempt), view);
  assert.equal(view?.cancellationRequested, true);
  assert.equal(restarted.readGeneration(acquired.result.owner).commands.length, 0);
  const final = await worker.exchange({ operation: 'finalize', terminal });
  assert.equal(final.result.kind, 'finalized');
  assert.deepEqual(restarted.readAttempt(request('buffered').attempt)?.terminal, terminal);
  const afterClose = await coreWorker(t, root);
  const replay = await afterClose.exchange({ operation: 'acquire', request: request('buffered') });
  assert.equal(replay.result.kind, 'retrieved'); assert.equal(replay.effects, 0);
  assert.deepEqual(restarted.readAttempt(request('buffered').attempt)?.terminal, terminal);
});

for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`P4 issue ${point} and competing close have one durable order`, { timeout: 30000 }, async t => {
    const { root, admission } = fixture(t);
    const entered = join(root, 'entered'), release = join(root, 'release');
    const worker = await coreWorker(t, root, { control: { kind: 'hold', operation: 'authorize', point, entered, release } });
    const acquired = await worker.exchange({ operation: 'acquire', request: request('ordered') });
    if (acquired.result.kind !== 'acquired') throw new Error('P4 owner missing');
    const pending = worker.exchange({ operation: 'dispatch' });
    void pending.catch(() => {});
    await barrier(entered);
    const generation = admission.readGeneration(acquired.result.owner);
    assert.deepEqual(generation.commands.map(c => c.state), point === 'beforeCommit' ? [] : ['outstanding']);
    assert.equal(generation.dispatchClosedAt, null);
    if (point === 'beforeCommit') assert.throws(() => admission.cancel(request('ordered').attempt), { code: 'STATE_UNAVAILABLE' });
    else assert.equal(admission.cancel(request('ordered').attempt)?.cancellationRequested, true);
    writeFileSync(release, 'release');
    const reply = await bounded('P4 dispatch completion', pending);
    assert.equal(reply.result.kind, 'dispatched'); assert.equal(reply.effects, 1);
    assert.deepEqual(reply.entries.map(e => e.authorizationSeenAtEntry), [true]);
    if (point === 'beforeCommit') admission.cancel(request('ordered').attempt);
    const closed = await worker.exchange({ operation: 'finalize', terminal });
    assert.equal(closed.result.kind, 'finalized');
    const final = admission.readGeneration(acquired.result.owner);
    assert.equal(typeof final.dispatchClosedAt, 'number');
    assert.equal(final.commands.length, 1);
    assert.equal(final.commands[0]?.state, point === 'beforeCommit' ? 'settled' : 'uncertain');
    assert.deepEqual(admission.readAttempt(request('ordered').attempt)?.terminal, terminal);
  });
}

for (const operation of ['acquire', 'attach', 'authorize', 'settle', 'finalize'] as const) {
  for (const point of ['beforeCommit', 'afterCommit'] as const) {
    test(`H11 authority death at ${operation} ${point} recovers closed without replay`, { timeout: 30000 }, async t => {
      const { root, admission } = fixture(t);
      const worker = await coreWorker(t, root, { operation, point });
      if (operation !== 'acquire') {
        const acquired = await worker.exchange({ operation: 'acquire', request: request('crashed') });
        assert.equal(acquired.result.kind, 'acquired');
      }
      const requestId = worker.send(operation === 'acquire' ? { operation, request: request('crashed') }
        : operation === 'finalize' ? { operation, terminal } : { operation: 'dispatch' });
      assert.deepEqual(await worker.killed(), { type: 'fault', requestId, actor: worker.child.pid, operation, point });
      const restarted = Admission.forTesting({ root, backend: 'fake', initialize: false });
      const prior = restarted.readAttempt(request('crashed').attempt);
      if (operation === 'acquire' && point === 'beforeCommit') {
        assert.equal(prior, undefined); assert.equal(restarted.acquire(request('successor')).kind, 'acquired'); return;
      }
      assert.ok(prior);
      const commands = restarted.readGeneration(prior.owner).commands;
      const issued = operation === 'settle' || operation === 'authorize' && point === 'afterCommit';
      assert.equal(commands.length, issued ? 1 : 0);
      if (issued) assert.equal(commands[0]?.state, operation === 'settle' && point === 'afterCommit' ? 'settled' : 'outstanding');
      assert.deepEqual(restarted.acquire(request('successor')), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
      const recovered = restarted.readGeneration(prior.owner);
      assert.equal(typeof recovered.dispatchClosedAt, 'number');
      assert.deepEqual(recovered.commands.map(c => c.state), issued ? [operation === 'settle' && point === 'afterCommit' ? 'settled' : 'uncertain'] : []);
      const outcome = restarted.readAttempt(request('crashed').attempt);
      assert.equal(outcome?.terminal?.outcome, 'inconclusive');
      assert.equal(restarted.acquire(request('crashed')).kind, 'retrieved');
      assert.deepEqual(restarted.readAttempt(request('crashed').attempt), outcome);
      assert.deepEqual(admission.readGeneration(prior.owner), recovered);
    });
  }
}

for (const operation of ['reserveAllocation', 'stageAllocation', 'startCreation', 'recordCreation'] as const) {
  for (const point of ['beforeCommit', 'afterCommit'] as const) {
    test(`P3 death ${operation} ${point} preserves the unique creation reservation`, { timeout: 30000 }, async t => {
      const f = await hostFixture(t);
      const input = f.request('one'), gate = `${point}:${operation}:1`;
      const owner = f.spawnOwner('cli', 'observed-allocate', await f.requestFile(input), { gate });
      await bounded(`P3 ${gate}`, f.milestone(gate, owner.child.pid));
      owner.child.kill('SIGKILL');
      assert.equal((await bounded('P3 owner death', owner.exited)).signal, 'SIGKILL');
      const reopened = f.admission();
      const record = reopened.readAllocationForAction('one');
      const createCount = operation === 'recordCreation' ? 1 : 0;
      assert.equal(f.calls().filter(c => c === 'create').length, createCount);
      if (operation === 'reserveAllocation' && point === 'beforeCommit') {
        assert.equal(record, undefined);
        assert.deepEqual(reopened.readAllocationCapacity(), { heldAllocations: 0, reservedBytes: 0 });
        return;
      }
      assert.ok(record);
      assert.equal(record.capacityHeld, true);
      const issued = operation === 'recordCreation' || operation === 'startCreation' && point === 'afterCommit';
      assert.deepEqual(reopened.readAllocationCommands(record.allocationId).map(c => [c.operation, c.state]),
        issued ? [['create', operation === 'recordCreation' && point === 'afterCommit' ? 'settled' : 'outstanding']] : []);
      assert.equal(record.hostCreationBlocked, issued && !(operation === 'recordCreation' && point === 'afterCommit'));
      const duplicate = await bounded('P3 duplicate after restart', f.cli('observed-allocate', await f.requestFile(input, 'duplicate.json')));
      assert.equal(allocation(duplicate.reply).allocationId, record.allocationId);
      assert.equal(f.calls().filter(c => c === 'create').length, createCount);
      assert.equal(reopened.readAllocationForAction('one')?.allocationId, record.allocationId);
      assert.equal(reopened.readAllocationCapacity().heldAllocations, 1);
    });
  }
}

test('H11 two recovery owners contend and a torn store cannot create fallback ownership', { timeout: 30000 }, async t => {
  const { root, admission } = fixture(t);
  const worker = await coreWorker(t, root, { operation: 'authorize', point: 'afterCommit' });
  const acquired = await worker.exchange({ operation: 'acquire', request: request('recovery') });
  if (acquired.result.kind !== 'acquired') throw new Error('H11 owner missing');
  worker.send({ operation: 'dispatch' }); await worker.killed();
  assert.deepEqual(admission.acquire(request('next')), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  const recovery = admission.claimRecovery(acquired.result.owner, 'first');
  assert.equal(recovery.kind, 'claimed');
  if (recovery.kind !== 'claimed') throw new Error('H11 recovery missing');
  const before = admission.readGeneration(acquired.result.owner);
  const contender = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { Admission } = await import(process.argv[1]);
    const admission = Admission.forTesting({ root: process.argv[2], backend: 'fake', initialize: false });
    const owner = admission.readAttempt({ kind: 'legacy', id: 'recovery' }).owner;
    const result = admission.claimRecovery(owner, 'competitor');
    assert.deepEqual(result, { kind: 'refused' });
    process.stdout.write('refused; zero sweep commands');
  `, import.meta.resolve('../src/device/admission.js'), root], { encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH } });
  assert.equal(contender.status, 0, contender.stderr);
  assert.equal(contender.stdout, 'refused; zero sweep commands');
  assert.deepEqual(admission.readGeneration(acquired.result.owner), before);
  assert.equal(before.recoveries.filter(r => r.closedAt === null).length, 1);
  recovery.claim.close();
  assert.deepEqual(admission.readGeneration(acquired.result.owner).commands.map(c => c.state), ['uncertain']);
  assert.equal(admission.readAttempt(request('recovery').attempt)?.terminal?.outcome, 'inconclusive');
  writeFileSync(join(root, 'admission.sqlite'), 'torn receipt/store', { mode: 0o600 });
  assert.throws(() => Admission.forTesting({ root, backend: 'fake', initialize: false }), { code: 'STATE_UNAVAILABLE' });
  assert.equal(readFileSync(join(root, 'admission.sqlite'), 'utf8'), 'torn receipt/store');
});

test('H03 HOME cwd project temp and path aliases keep the account authority and refuse fake real attachment', { timeout: 30000 }, t => {
  const { root, admission } = fixture(t);
  const alias = join(root, 'store-alias'); symlinkSync(root, alias);
  const expected = join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge/admission');
  for (const name of ['one', 'two']) {
    const directory = join(root, name); mkdirSync(directory);
    const probe = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const { Admission, admissionRoot } = await import(process.argv[1]);
      process.stdout.write(admissionRoot());
      const admission = Admission.forTesting({ root: process.argv[2], backend: 'fake', initialize: false });
      assert.throws(() => admission.assertBackend('real'), { code: 'STATE_UNAVAILABLE' });
    `, import.meta.resolve('../src/device/admission.js'), root], { cwd: directory, encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory, JEV_PROJECT_DIR: directory, JEV_ADMISSION_ROOT: directory } });
    assert.equal(probe.status, 0, probe.stderr); assert.equal(probe.stdout, expected);
  }
  for (const spelling of [alias, root + '/.', root + '/../' + root.split('/').at(-1)]) {
    assert.throws(() => Admission.forTesting({ root: spelling, backend: 'fake', initialize: false }), { code: 'STATE_UNAVAILABLE' });
  }
  const owner = admission.acquire(request('fake'));
  assert.equal(owner.kind, 'acquired');
  if (owner.kind !== 'acquired') throw new Error('H03 fake owner missing');
  assert.throws(() => owner.claim.bindDriver('real'), { code: 'STATE_UNAVAILABLE' });
});

for (const mode of ['lost-create', 'torn-create']) {
  test(`H11 ${mode} keeps unknown creation and duplicate retrieval cannot replay`, { timeout: 30000 }, async t => {
    const f = await hostFixture(t), input = f.request('one');
    const first = await bounded(`H11 ${mode}`, f.cli('observed-allocate', await f.requestFile(input), { mode }));
    assert.equal(allocation(first.reply).state, 'quarantined');
    const record = f.admission().readAllocationForAction('one');
    assert.ok(record); assert.equal(record.hostCreationBlocked, true); assert.equal(record.capacityHeld, true);
    assert.deepEqual(f.admission().readAllocationCommands(record.allocationId).map(c => [c.operation, c.state]), [['create', 'uncertain']]);
    const duplicate = await bounded('H11 retrieval', f.cli('observed-allocate', await f.requestFile(input, 'duplicate.json')));
    assert.equal(allocation(duplicate.reply).allocationId, record.allocationId);
    assert.deepEqual(f.admission().readAllocationForAction('one'), record);
    assert.equal(f.calls().filter(c => c === 'create').length, 1);
  });
}
