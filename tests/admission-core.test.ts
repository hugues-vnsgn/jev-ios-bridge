import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, realpathSync, mkdirSync, lstatSync, readFileSync, statSync, chmodSync, symlinkSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Admission, type AdmissionRequest } from '../src/device/admission.js';

const device = 'abcdef00-0000-4000-8000-000000000001';
const request = (id: string, udid = device): AdmissionRequest => ({ device: udid, attempt: { kind: 'observed', id }, digest: 'digest', intent: { tap: 'button' } });
function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-core-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission: Admission.forTesting({ root, backend: 'fake' }) };
}
test('atomic admission canonicalizes identity; competing readers preserve the owner and terminal is authoritative', t => {
  const { admission } = fixture(t);
  const result = admission.acquire(request('one'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const before = admission.inspect(device);
  assert.equal(admission.acquire(request('two', device.toUpperCase())).kind, 'refused');
  assert.deepEqual(admission.inspect(device), before);
  assert.equal(admission.readAttempt(request('one').attempt)?.state, 'active');
  assert.equal(result.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { visible: true }, evidenceRefs: [] }).authority, 'committed');
  assert.equal(admission.inspect(device)?.state, 'available');
  assert.equal(admission.readAttempt(request('one').attempt)?.terminal?.outcome, 'observed');
});

test('recovery checks the full recorded process incarnation, preserving a live independent owner', t => {
  const { root, admission } = fixture(t);
  const result = admission.acquire(request('live'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const recovery = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'dead' });
  assert.throws(() => recovery.quarantineAbandoned({ ...result.claim.identity, process: { pid: 123, incarnation: 'wrong' } }, 'mismatched process'), { code: 'STALE_OWNER' });
  assert.equal(admission.inspect(device)?.state, 'active');
});

test('failed underlying work closes further authorization even when its caller catches the rejection', async t => {
  const { admission } = fixture(t);
  const result = admission.acquire(request('failed-operation'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const session = result.claim.bindDriver('fake');
  await assert.rejects(session.dispatch('launch', async () => { throw new Error('reply lost'); }), /reply lost/);
  let calls = 0;
  assert.throws(() => session.dispatch('capture', async () => { calls++; }), { code: 'DISPATCH_CLOSED' });
  assert.equal(calls, 0);
});

test('same identity cannot smuggle changed intent under a reused digest', t => {
  const { admission } = fixture(t);
  admission.acquire(request('immutable'));
  assert.deepEqual(admission.acquire({ ...request('immutable'), intent: { tap: 'different' } }), { kind: 'refused', reason: 'ACTION_ID_CONFLICT' });
});

test('foreign cancellation persists and prevents dispatch, while an already authorized late result cannot promote quarantine', async t => {
  const { root, admission } = fixture(t);
  const result = admission.acquire(request('cancel-race'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const session = result.claim.bindDriver('fake');
  let complete!: () => void;
  const pending = session.dispatch('tap', () => new Promise<void>(resolve => { complete = resolve; }));
  Admission.forTesting({ root, backend: 'fake' }).cancel(request('cancel-race').attempt);
  let followups = 0;
  assert.throws(() => session.dispatch('capture', async () => { followups++; }), { code: 'DISPATCH_CLOSED' });
  assert.throws(() => result.claim.finalize({ outcome: 'observed', disposition: 'available', payload: {}, evidenceRefs: [] }), { code: 'OPERATIONS_UNSETTLED' });
  const terminal = { outcome: 'inconclusive' as const, disposition: 'quarantined' as const, payload: { reason: 'cancelled' }, evidenceRefs: [] };
  assert.equal(result.claim.finalize(terminal).authority, 'committed');
  complete(); await pending;
  assert.equal(admission.inspect(device)?.state, 'quarantined');
  assert.deepEqual(admission.readAttempt(request('cancel-race').attempt)?.terminal, terminal);
  assert.equal(followups, 0);
});

test('cancel before acquisition, pre-effect cancellation, and exactly one tap are enforced', async t => {
  const { admission } = fixture(t);
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(admission.acquire({ ...request('pre'), signal: controller.signal }), { kind: 'refused', reason: 'CANCELLED' });
  assert.equal(admission.inspect(device), undefined);
  const active = admission.acquire(request('cancel-before-effects'));
  assert.equal(active.kind, 'acquired');
  if (active.kind !== 'acquired') return;
  active.claim.cancel();
  assert.throws(() => active.claim.bindDriver('fake'), { code: 'DISPATCH_CLOSED' });
  assert.equal(active.claim.finalize({ outcome: 'refused', disposition: 'available', payload: {}, evidenceRefs: [] }).authority, 'committed');
  const next = admission.acquire(request('one-tap'));
  assert.equal(next.kind, 'acquired');
  if (next.kind !== 'acquired') return;
  const session = next.claim.bindDriver('fake');
  assert.throws(() => next.claim.bindDriver('fake'), { code: 'DISPATCH_CLOSED' });
  let taps = 0;
  await session.dispatch('tap', async () => { taps++; });
  assert.throws(() => session.dispatch('tap', async () => { taps++; }), { code: 'DISPATCH_CLOSED' });
  assert.equal(taps, 1);
});

for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`terminal ${point} failure never publishes its candidate and fresh reads resolve the whole transaction`, t => {
    const { root, admission } = fixture(t);
    const faulty = Admission.forTesting({ root, backend: 'fake', fault(at, operation) { if (at === point && operation === 'finalize') throw new Error('injected commit fault'); } });
    const result = faulty.acquire(request('commit-fault'));
    assert.equal(result.kind, 'acquired');
    if (result.kind !== 'acquired') return;
    assert.deepEqual(result.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { exact: 'committed only' }, evidenceRefs: ['evidence'] }), { authority: 'unconfirmed', reason: 'FINALIZATION_UNCONFIRMED' });
    assert.throws(() => result.claim.bindDriver('fake'), { code: 'DISPATCH_CLOSED' });
    const attempt = admission.readAttempt(request('commit-fault').attempt);
    assert.equal(attempt?.state, point === 'beforeCommit' ? 'active' : 'terminal');
    assert.equal(admission.inspect(device)?.state, point === 'beforeCommit' ? 'active' : 'available');
    assert.equal(attempt?.terminal?.payload && (attempt.terminal.payload as {exact: string}).exact, point === 'beforeCommit' ? undefined : 'committed only');
  });
}

async function worker(t: TestContext, root: string, faultOperation = '', faultPoint = '') {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./fixtures/admission-core-worker.ts', import.meta.url)), root, faultOperation, faultPoint], { cwd: tmpdir(), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = ''; child.stderr!.on('data', chunk => { stderr += chunk; });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const first = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(`Worker exited: ${stderr}`); })]);
  assert.deepEqual(first[0], { ready: true });
  return child;
}
function reply(child: ChildProcess, message: object): Promise<any> {
  const response = once(child, 'message'); child.send(message); return response.then(([value]) => value);
}
const success = { outcome: 'observed' as const, disposition: 'available' as const, payload: { visible: true }, evidenceRefs: [] };

for (const firstKind of ['observed', 'legacy'] as const) {
  test(`independent ${firstKind} and competing owner serialize acquisition without sabotaging the winner`, async t => {
    const { root, admission } = fixture(t);
    const children = await Promise.all([worker(t, root), worker(t, root)]);
    const requests = [request('first'), request('second')];
    requests[0]!.attempt.kind = firstKind;
    requests[1]!.attempt.kind = firstKind === 'observed' ? 'legacy' : 'observed';
    const results = await Promise.all(children.map((child, index) => reply(child, { operation: 'acquire', request: requests[index] })));
    assert.deepEqual(results.map(result => result.kind).sort(), ['acquired', 'refused']);
    const winner = results.findIndex(result => result.kind === 'acquired');
    for (let i = 0; i < 5; i++) { assert.equal(admission.inspect(device)?.state, 'active'); }
    assert.equal((await reply(children[winner]!, { operation: 'finalize', terminal: success })).authority, 'committed');
    assert.equal(admission.inspect(device)?.state, 'available');
  });
}

test('real dead child remains busy on reads; explicit owner-aware recovery quarantines it without reclaiming', async t => {
  const { root, admission } = fixture(t);
  const child = await worker(t, root);
  const acquired = await reply(child, { operation: 'acquire', request: request('child') });
  assert.equal(acquired.kind, 'acquired');
  assert.equal(admission.quarantineAbandoned(acquired.owner, 'still live'), false);
  const exited = once(child, 'exit'); child.send({ operation: 'exit' }); await exited;
  assert.equal(admission.inspect(device)?.state, 'active');
  assert.deepEqual(admission.acquire(request('successor')), { kind: 'refused', reason: 'DEVICE_BUSY' });
  assert.equal(admission.quarantineAbandoned(acquired.owner, 'owner exited'), true);
  assert.equal(admission.inspect(device)?.state, 'quarantined');
  assert.equal(admission.readAttempt(request('child').attempt)?.terminal?.outcome, 'inconclusive');
  assert.deepEqual(admission.acquire(request('successor')), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
});

for (const operation of ['acquire', 'finalize']) for (const point of ['beforeCommit', 'afterCommit']) {
  test(`child death ${operation} ${point} leaves only atomic authority`, async t => {
    const { root, admission } = fixture(t);
    const child = await worker(t, root, operation, point);
    if (operation === 'finalize') assert.equal((await reply(child, { operation: 'acquire', request: request('killed') })).kind, 'acquired');
    const exited = once(child, 'exit');
    child.send(operation === 'acquire' ? { operation, request: request('killed') } : { operation, terminal: success });
    await exited;
    const attempt = admission.readAttempt(request('killed').attempt);
    const disposition = admission.inspect(device);
    if (operation === 'acquire' && point === 'beforeCommit') { assert.equal(attempt, undefined); assert.equal(disposition, undefined); }
    else if (operation === 'finalize' && point === 'afterCommit') { assert.deepEqual(attempt?.terminal, success); assert.equal(disposition?.state, 'available'); }
    else { assert.equal(attempt?.state, 'active'); assert.equal(attempt?.terminal, null); assert.equal(disposition?.state, 'active'); }
  });
}

test('status is physically read-only and duplicate retrieval does not change the active store', t => {
  const { root, admission } = fixture(t);
  admission.acquire(request('poll'));
  const path = join(root, 'admission.sqlite'); const before = readFileSync(path); const mtime = statSync(path).mtimeMs;
  for (let i = 0; i < 5; i++) { admission.inspect(device); admission.readAttempt(request('poll').attempt); }
  assert.deepEqual(readFileSync(path), before); assert.equal(statSync(path).mtimeMs, mtime);
  assert.equal(admission.acquire(request('poll')).kind, 'retrieved');
  assert.deepEqual(readFileSync(path), before); assert.equal(statSync(path).mtimeMs, mtime);
});

test('initialized store missing its database cannot silently recreate or resolve a terminal', t => {
  const { root, admission } = fixture(t);
  const acquired = admission.acquire(request('removed'));
  if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
  unlinkSync(join(root, 'admission.sqlite'));
  assert.throws(() => admission.readAttempt(request('removed').attempt), { code: 'STATE_UNAVAILABLE' });
  assert.throws(() => Admission.forTesting({ root, backend: 'fake' }), { code: 'STATE_UNAVAILABLE' });
  assert.equal(acquired.claim.finalize(success).authority, 'unconfirmed');
  assert.throws(() => statSync(join(root, 'admission.sqlite')), { code: 'ENOENT' });
});

for (const corruption of ['schema', 'inactive', 'marker', 'database', 'permissions', 'symlink']) {
  test(`unsafe ${corruption} storage fails closed`, t => {
    const { root, admission } = fixture(t);
    const path = join(root, 'admission.sqlite');
    if (corruption === 'schema' || corruption === 'inactive') {
      const db = new DatabaseSync(path);
      db.exec(corruption === 'schema' ? 'UPDATE metadata SET schema_version=999' : 'UPDATE metadata SET migration_manifest=NULL'); db.close();
    } else if (corruption === 'marker') { writeFileSync(join(root, 'installation.json'), '{}'); }
    else if (corruption === 'database') { writeFileSync(path, 'corrupt SQLite'); }
    else if (corruption === 'permissions') { chmodSync(path, 0o644); }
    else { const alias = `${root}-alias`; symlinkSync(root, alias); t.after(() => unlinkSync(alias)); assert.throws(() => Admission.forTesting({ root: alias, backend: 'fake', initialize: false }), { code: 'STATE_UNAVAILABLE' }); return; }
    assert.throws(() => admission.acquire(request('unsafe')), { code: 'STATE_UNAVAILABLE' });
    assert.throws(() => admission.readAttempt(request('unsafe').attempt), { code: 'STATE_UNAVAILABLE' });
  });
}

test('bounded SQLite contention refuses acquisition while preserving the incumbent', t => {
  const { root, admission } = fixture(t);
  admission.acquire(request('incumbent'));
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  try {
    db.exec('BEGIN IMMEDIATE');
    const start = performance.now();
    assert.throws(() => admission.acquire(request('blocked')), { code: 'STATE_UNAVAILABLE' });
    assert.ok(performance.now() - start < 1500, 'Writer wait must be bounded');
    assert.equal(admission.inspect(device)?.owner?.attempt.id, 'incumbent');
  } finally { db.exec('ROLLBACK'); db.close(); }
});

test('ambiguous dispatch authorization revokes the local session before a caller can issue a follow-up', t => {
  const { root } = fixture(t);
  let fault = true;
  const admission = Admission.forTesting({ root, backend: 'fake', fault(point, operation) { if (fault && point === 'afterCommit' && operation === 'authorize') { fault = false; throw new Error('reply lost'); } } });
  const result = admission.acquire(request('dispatch-ambiguity'));
  if (result.kind !== 'acquired') assert.fail('Expected acquisition');
  const session = result.claim.bindDriver('fake'); let calls = 0;
  assert.throws(() => session.dispatch('launch', async () => { calls++; }), { code: 'STATE_UNAVAILABLE' });
  assert.throws(() => session.dispatch('capture', async () => { calls++; }), { code: 'DISPATCH_CLOSED' });
  assert.equal(calls, 0);
});

test('late owner and stale fencing cannot overwrite a successor or change immutable terminals', t => {
  const { root, admission } = fixture(t);
  const first = admission.acquire(request('first-generation'));
  if (first.kind !== 'acquired') assert.fail('Expected acquisition');
  assert.throws(() => { first.claim.identity.token = 'replacement'; }, TypeError);
  assert.equal(first.claim.finalize(success).authority, 'committed');
  const next = admission.acquire(request('second-generation'));
  if (next.kind !== 'acquired') assert.fail('Expected acquisition');
  assert.equal(next.claim.identity.generation, first.claim.identity.generation + 1);
  assert.notEqual(next.claim.identity.token, first.claim.identity.token);
  const recovery = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'dead' });
  assert.throws(() => recovery.quarantineAbandoned({ ...next.claim.identity, token: first.claim.identity.token }, 'stale token'), { code: 'STALE_OWNER' });
  assert.throws(() => recovery.quarantineAbandoned({ ...next.claim.identity, generation: first.claim.identity.generation }, 'stale generation'), { code: 'STALE_OWNER' });
  assert.throws(() => first.claim.cancel(), { code: 'STALE_OWNER' });
  assert.throws(() => first.claim.finalize({ ...success, payload: { changed: true } }), { code: 'STALE_OWNER' });
  assert.equal(first.claim.finalize(success).authority, 'committed');
  assert.equal(admission.inspect(device)?.owner?.attempt.id, 'second-generation');
  assert.equal(admission.readAttempt(request('first-generation').attempt)?.terminal?.outcome, 'observed');
});

test('unknown liveness remains busy; quarantine on one device does not prevent independent admission', t => {
  const { root, admission } = fixture(t);
  const first = admission.acquire(request('quarantine'));
  if (first.kind !== 'acquired') assert.fail('Expected acquisition');
  const uncertain = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'unknown' });
  assert.equal(uncertain.quarantineAbandoned(first.claim.identity, 'uncertain'), false);
  assert.equal(admission.inspect(device)?.state, 'active');
  first.claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const other = 'ABCDEF00-0000-4000-8000-000000000002';
  assert.equal(admission.acquire(request('different-business-action', other)).kind, 'acquired');
  assert.deepEqual(admission.acquire(request('quarantine', other)), { kind: 'refused', reason: 'ACTION_ID_CONFLICT' });
});

test('test capability is refused by real backend attachment and device aliases are rejected', t => {
  const { admission } = fixture(t);
  assert.throws(() => admission.assertBackend('real'), { code: 'STATE_UNAVAILABLE' });
  for (const alias of ['booted', 'iPhone', ` ${device}`, `${device}/path`]) assert.throws(() => admission.acquire(request('bad', alias)), { code: 'INVALID_REQUEST' });
  const acquired = admission.acquire(request('valid'));
  if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
  assert.throws(() => acquired.claim.bindDriver('real'), { code: 'STATE_UNAVAILABLE' });
});

test('legacy scripted attempts retain multiple taps while observed attempts remain single submission', async t => {
  const { admission } = fixture(t);
  const acquired = admission.acquire({ ...request('legacy-script'), attempt: { kind: 'legacy', id: 'legacy-script' } });
  if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
  const session = acquired.claim.bindDriver('fake'); let calls = 0;
  await session.dispatch('tap', async () => { calls++; });
  await session.dispatch('tap', async () => { calls++; });
  assert.equal(calls, 2);
  assert.equal(acquired.claim.finalize({ ...success, outcome: 'completed' }).authority, 'committed');
});

test('opening a store with a changed journal policy refuses rather than silently rewriting it', t => {
  const { root, admission } = fixture(t);
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  db.exec('PRAGMA journal_mode=WAL'); db.close();
  assert.throws(() => admission.inspect(device), { code: 'STATE_UNAVAILABLE' });
});

for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`signal cancellation survives a ${point} cancellation write failure and late tap settlement`, async t => {
    const { root, admission } = fixture(t);
    const controller = new AbortController();
    const faulty = Admission.forTesting({ root, backend: 'fake', fault(at, operation) {
      if (at === point && operation === 'cancel') throw new Error('cancel persistence failed');
    } });
    const acquired = faulty.acquire({ ...request('cancel-persistence'), signal: controller.signal });
    if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
    const session = acquired.claim.bindDriver('fake');
    let settle!: () => void;
    const pending = session.dispatch('tap', () => new Promise<void>(resolve => { settle = resolve; }));
    controller.abort();
    assert.throws(() => session.dispatch('capture', async () => {}), { code: 'DISPATCH_CLOSED' });
    settle(); await pending;
    assert.throws(() => acquired.claim.finalize(success), { code: 'OPERATIONS_UNSETTLED' });
    assert.equal(admission.inspect(device)?.state, 'active');
    assert.equal(admission.readAttempt(request('cancel-persistence').attempt)?.terminal, null);
    const cancelled = { outcome: 'inconclusive' as const, disposition: 'quarantined' as const, payload: { reason: 'cancelled' }, evidenceRefs: [] };
    assert.equal(acquired.claim.finalize(cancelled).authority, 'committed');
    assert.equal(admission.inspect(device)?.state, 'quarantined');
    assert.equal(admission.readAttempt(request('cancel-persistence').attempt)?.cancellationRequested, true);
    assert.deepEqual(admission.readAttempt(request('cancel-persistence').attempt)?.terminal, cancelled);
  });
}

for (const suffix of ['-journal', '-wal', '-shm']) {
  for (const unsafeKind of ['permissions', 'symlink', 'directory']) {
    test(`unsafe SQLite ${suffix} ${unsafeKind} is refused before SQLite can consume or rewrite it`, t => {
      const { root, admission } = fixture(t);
      const path = join(root, `admission.sqlite${suffix}`);
      const target = join(root, 'sidecar-target');
      const bytes = Buffer.alloc(512, 0);
      if (unsafeKind === 'permissions') { writeFileSync(path, bytes, { mode: 0o644 }); }
      else if (unsafeKind === 'symlink') { writeFileSync(target, bytes, { mode: 0o600 }); symlinkSync(target, path); }
      else { mkdirSync(path, { mode: 0o700 }); }
      const before = lstatSync(path);
      assert.throws(() => admission.inspect(device), { code: 'STATE_UNAVAILABLE' });
      assert.throws(() => admission.acquire(request('unsafe-sidecar')), { code: 'STATE_UNAVAILABLE' });
      const after = lstatSync(path);
      assert.equal(after.ino, before.ino);
      assert.equal(after.mode, before.mode);
      if (unsafeKind !== 'directory') assert.deepEqual(readFileSync(path), bytes);
    });
  }
}

test('SQLite creates its transaction journal with private permissions', t => {
  const { root } = fixture(t);
  let witnessedJournal = false;
  const admission = Admission.forTesting({ root, backend: 'fake', fault(point, operation) {
    if (point === 'beforeCommit' && operation === 'acquire') {
      const journal = lstatSync(join(root, 'admission.sqlite-journal'));
      assert.equal(journal.mode & 0o777, 0o600);
      assert.equal(journal.uid, process.getuid!());
      assert.equal(journal.isFile(), true);
      assert.equal(journal.isSymbolicLink(), false);
      witnessedJournal = true;
    }
  } });
  assert.equal(admission.acquire(request('private-journal')).kind, 'acquired');
  assert.equal(witnessedJournal, true);
});
