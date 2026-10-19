import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, realpathSync, mkdirSync, lstatSync, readFileSync, statSync, chmodSync, symlinkSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Admission, canonicalDevice, type AdmissionRequest } from '../src/device/admission.js';

import { messageSchema, commandSchema, faultSchema, requireAcquisition, type CoreReply, type CommandInput, type Acquisition, type Finalization, type Control } from './fixtures/admission-core-protocol.js';

const device = 'abcdef00-0000-4000-8000-000000000001';
const request = (id: string, udid = device): AdmissionRequest => ({ device: udid, attempt: { kind: 'observed', id }, digest: 'digest', intent: { tap: 'button' } });
test('device identity normalization preserves the category and its value semantics', () => {
  assert.deepEqual(canonicalDevice({ category: 'ios-simulator', value: device }), {
    category: 'ios-simulator', value: 'ABCDEF00-0000-4000-8000-000000000001',
  });
  assert.deepEqual(canonicalDevice({ category: 'android-emulator', value: '/private/avds/Pixel.avd' }), {
    category: 'android-emulator', value: '/private/avds/Pixel.avd',
  });
  assert.deepEqual(canonicalDevice({ category: 'android-phone', value: device }), {
    category: 'android-phone', value: 'abcdef00-0000-4000-8000-000000000001',
  });
  assert.equal(canonicalDevice(device), 'ABCDEF00-0000-4000-8000-000000000001');
});

test('reserved iOS phone identities refuse before simulator UUID validation', () => {
  for (const value of ['00008140-001234567890001E', device]) {
    assert.throws(() => canonicalDevice({ category: 'ios-phone', value }), { code: 'CATEGORY_NOT_ENABLED' });
  }
});

test('device identities reject unresolved emulator names and malformed identity pairs', () => {
  for (const value of ['Pixel.avd', '/private/avds/../Pixel.avd', '/private/avds/Pixel.avd\0']) {
    assert.throws(() => canonicalDevice({ category: 'android-emulator', value }), { code: 'INVALID_REQUEST' });
  }
  for (const raw of ['null', '{}', '{"category":"watch","value":"id"}', '{"category":"android-phone","value":""}', '{"category":"android-phone","value":"id","extra":true}']) {
    assert.throws(() => canonicalDevice(JSON.parse(raw)), { code: 'INVALID_REQUEST' });
  }
});

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-core-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission: Admission.forTesting({ root, backend: 'fake' }) };
}
test('fresh fake stores are initialized at schema 3 through the upgrade chain', t => {
  const { root } = fixture(t);
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  try {
    assert.equal(db.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 3);
    assert.equal(db.prepare("SELECT count(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()?.total, 19);
    assert.equal(db.prepare("SELECT count(*) AS total FROM upgrades").get()?.total, 0);
    assert.equal(db.prepare("SELECT count(*) AS total FROM pragma_table_info('devices') WHERE name='state'").get()?.total, 0);
  } finally { db.close(); }
});

test('admission requests and retrieved owners retain their explicit device category', t => {
  const { admission } = fixture(t);
  const input = { ...request('category-aware'), category: 'ios-simulator' as const };
  const result = admission.acquire(input);
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  assert.equal(result.claim.identity.category, 'ios-simulator');
  assert.equal(admission.readAttempt(input.attempt)?.category, 'ios-simulator');
  assert.equal(admission.inspect(device)?.category, 'ios-simulator');
});

test('reserved and unknown request categories refuse without recording an attempt', t => {
  const { admission, root } = fixture(t);
  const before = readFileSync(join(root, 'admission.sqlite'));
  assert.throws(() => admission.acquire({ ...request('reserved'), category: 'ios-phone' }), { code: 'CATEGORY_NOT_ENABLED' });
  assert.throws(() => admission.acquire(JSON.parse(JSON.stringify({ ...request('unknown'), category: 'watch' }))), { code: 'INVALID_REQUEST' });
  assert.equal(admission.readAttempt(request('reserved').attempt), undefined);
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), before);
});

test('an owner from another category cannot recover a matching device value', t => {
  const { admission, root } = fixture(t);
  const result = admission.acquire(request('owner-category'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const recovery = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'dead' });
  const before = readFileSync(join(root, 'admission.sqlite'));
  assert.throws(() => recovery.quarantineAbandoned({ ...result.claim.identity, category: 'android-phone' }, 'wrong category'), { code: 'STALE_OWNER' });
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), before);
});

test('the same device value in different categories has independent owners', t => {
  const { admission } = fixture(t);
  const simulator=admission.acquire({ ...request('simulator-pair'), category: 'ios-simulator' });
  const phone=admission.acquire({ ...request('phone-pair',device.toUpperCase()), category: 'android-phone' });
  assert.equal(simulator.kind,'acquired');
  assert.equal(phone.kind,'acquired');
  if(simulator.kind!=='acquired'||phone.kind!=='acquired') return;
  assert.notEqual(simulator.claim.identity.token,phone.claim.identity.token);
  assert.deepEqual(admission.inspect({category:'ios-simulator',value:device})?.owner,simulator.claim.identity);
  assert.deepEqual(admission.inspect({category:'android-phone',value:device.toUpperCase()})?.owner,phone.claim.identity);
});

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

type CoreExit = { code: number | null; signal: NodeJS.Signals | null; stderr: string; faultOutput: string };
type Pending = { id: number; operation: CommandInput['operation']; resolve: (reply: CoreReply) => void; reject: (error: Error) => void };
type ActorState = { sequence: number; errors: string[]; pending: Pending | undefined; closed: Promise<CoreExit>; termination: 'none' | 'deadline' | 'teardown' };
const actors = new WeakMap<ChildProcess, ActorState>();
async function worker({ t, root, faultOperation = '', faultPoint = '', control }: { t: TestContext; root: string; faultOperation?: string; faultPoint?: string; control?: Control }) {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./fixtures/admission-core-worker.ts', import.meta.url)), root, faultOperation, faultPoint, ...(control ? [JSON.stringify(control)] : [])],
    { cwd: tmpdir(), stdio: ['ignore','ignore','pipe','ipc','pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME!, TMPDIR: process.env.TMPDIR!, NODE_NO_WARNINGS: '1' } });
  let faultOutput = ''; child.stdio[4]!.on('data', chunk => { faultOutput += chunk; });
  let stderr = ''; child.stderr!.on('data', chunk => { stderr += chunk; });
  const errors: string[] = []; let readySeen = false;
  const closed = new Promise<CoreExit>(resolve => child.once('close', (code, signal) => { const state = actors.get(child)!; state.pending?.reject(new Error('Worker exited before reply: ' + stderr)); state.pending = undefined; resolve({ code, signal, stderr, faultOutput }); }));
  const state: ActorState = { sequence: 0, errors, pending: undefined, closed, termination: 'none' }; actors.set(child, state);
  const ready = new Promise<void>((resolve, reject) => {
    child.on('message', raw => {
      const parsed = messageSchema.safeParse(raw);
      if (!parsed.success) { errors.push(parsed.error.message); state.pending?.reject(new Error(parsed.error.message)); state.pending = undefined; return; }
      const value = parsed.data;
      if (value.actor !== child.pid) { errors.push('Wrong actor'); state.pending?.reject(new Error('Wrong actor')); state.pending = undefined; return; }
      if (value.type === 'ready') { if (readySeen) errors.push('Duplicate ready'); readySeen = true; resolve(); return; }
      const pending = state.pending;
      if (!readySeen || !pending || pending.id !== value.requestId || pending.operation !== value.operation) { errors.push('Unmatched or duplicate reply'); pending?.reject(new Error('Unmatched reply')); state.pending = undefined; return; }
      state.pending = undefined; pending.resolve(value);
    });
    child.once('error', reject); child.once('exit', () => { if (!readySeen) reject(new Error('Worker exited before ready: ' + stderr)); });
  });
  const cap = setTimeout(() => { state.termination = 'deadline'; child.kill('SIGKILL'); }, 10000);
  void closed.then(() => clearTimeout(cap));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { state.termination = 'teardown'; child.kill('SIGKILL'); } await closed; clearTimeout(cap); });
  await ready; return child;
}
function sendUnanswered({ child, command }: { child: ChildProcess; command: CommandInput }) {
  const state = actors.get(child)!; assert.equal(state.pending, undefined); assert.deepEqual(state.errors, []);
  const requestId = ++state.sequence; child.send(commandSchema.parse({ ...command, requestId })); return requestId;
}
function exchange({ child, command }: { child: ChildProcess; command: Exclude<CommandInput, { operation: 'exit' }> }): Promise<CoreReply> {
  const state = actors.get(child)!; assert.equal(state.pending, undefined); assert.deepEqual(state.errors, []); assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
  const requestId = ++state.sequence;
  return new Promise((resolve, reject) => { state.pending = { id: requestId, operation: command.operation, resolve, reject }; child.send(commandSchema.parse({ ...command, requestId })); });
}
type BusinessAcquisition = Exclude<Acquisition, { kind: 'state-unavailable' | 'unexpected-error' }>;
function reply({ child, message }: { child: ChildProcess; message: Extract<CommandInput, { operation: 'acquire' }> }): Promise<BusinessAcquisition>;
function reply({ child, message }: { child: ChildProcess; message: Extract<CommandInput, { operation: 'finalize' }> }): Promise<Finalization>;
async function reply({ child, message }: { child: ChildProcess; message: Exclude<CommandInput, { operation: 'exit' }> }) {
  const value = await exchange({ child, command: message });
  if (value.result.kind === 'state-unavailable' || value.result.kind === 'unexpected-error') throw new Error(JSON.stringify(value.result));
  if (value.operation === 'acquire') return value.result;
  if (value.operation === 'finalize') { assert.equal(value.result.kind, 'finalized'); if (value.result.kind !== 'finalized') throw new Error('Invalid finalization'); return value.result.finalization; }
  throw new Error('Use exchange for dispatch receipts');
}
async function closeActor(child: ChildProcess) {
  const state = actors.get(child)!; sendUnanswered({ child, command: { operation: 'exit' } }); const exited = await state.closed;
  assert.equal(exited.code, 0, exited.stderr); assert.equal(exited.signal, null); assert.deepEqual(state.errors, []);
}
async function entered(path: string) { const deadline = Date.now() + 5000; while (!existsSync(path)) { assert.ok(Date.now() < deadline, 'Missing lock barrier'); await new Promise(resolve => setTimeout(resolve,5)); } }
const success = { outcome: 'observed' as const, disposition: 'available' as const, payload: { visible: true }, evidenceRefs: [] };

type AcquireReply = Extract<CoreReply, { operation: 'acquire' }>;
async function acquire({ child, request: input, policy = 'strict' }: { child: ChildProcess; request: AdmissionRequest; policy?: 'strict' | 'contention' }): Promise<AcquireReply> {
  const value = await exchange({ child, command: { operation: 'acquire', request: input } }); assert.equal(value.operation, 'acquire');
  if (value.operation !== 'acquire') throw new Error('Wrong operation'); requireAcquisition({ result: value.result, policy }); return value;
}
function coreAuthority({ admission, contenders, activity = [], terminal }: { admission: Admission; contenders: { request: AdmissionRequest; reply: AcquireReply }[]; activity?: CoreReply[]; terminal?: typeof success }) {
  for (const { request: input, reply: receipt } of contenders) {
    if (receipt.result.kind !== 'acquired') continue;
    assert.deepEqual(receipt.result.owner.attempt, input.attempt, 'Acquired owner must match its submitted attempt');
    assert.equal(receipt.result.owner.device, input.device.toUpperCase(), 'Acquired owner must match its submitted device');
    assert.equal(receipt.result.owner.process.pid, receipt.actor, 'Acquired owner must belong to its actor process');
  }
  const snapshots = contenders.map(({ request: input }) => ({ request: input, view: admission.readAttempt(input.attempt) }));
  const present = snapshots.filter(row => row.view !== undefined); assert.ok(present.length <= 1, 'At most one authoritative attempt');
  const deviceView = admission.inspect(device);
  const last = new Map<number, CoreReply>();
  for (const value of [...contenders.map(c => c.reply), ...activity]) {
    assert.notEqual(value.result.kind, 'unexpected-error');
    const previous = last.get(value.actor); if (!previous || value.requestId > previous.requestId) last.set(value.actor, value);
  }
  assert.ok([...last.values()].reduce((sum, r) => sum + r.effects, 0) <= 1, 'At most one effect');
  assert.ok([...last.values()].reduce((sum, r) => sum + r.entries.length, 0) <= 1, 'At most one callback entry');
  if (present.length === 0) {
    assert.equal(deviceView, undefined); assert.ok(contenders.every(c => c.reply.result.kind === 'state-unavailable'));
    for (const value of last.values()) { assert.equal(value.effects, 0); assert.deepEqual(value.entries, []); assert.deepEqual(value.authorizations, []); }
    return undefined;
  }
  const { request: input, view } = present[0]!; assert.ok(view);
  assert.deepEqual(view.identity, input.attempt); assert.equal(view.device, input.device.toUpperCase()); assert.equal(view.digest, input.digest); assert.deepEqual(view.intent, input.intent);
  assert.deepEqual(view.owner.attempt, input.attempt); assert.equal(view.owner.device, view.device); assert.equal(view.owner.generation, 1); assert.ok(view.owner.token); assert.ok(view.owner.process.incarnation);
  const ownerReply = contenders.find(c => c.request.attempt.id === input.attempt.id)!.reply;
  assert.equal(view.owner.process.pid, ownerReply.actor);
  assert.ok(ownerReply.result.kind === 'acquired' || ownerReply.result.kind === 'state-unavailable');
  for (const contender of contenders) {
    const result = contender.reply.result;
    if (result.kind === 'acquired') assert.deepEqual(result.owner, view.owner);
    else if (result.kind === 'refused') { assert.equal(result.reason, 'DEVICE_BUSY'); assert.notDeepEqual(contender.request.attempt, view.identity); }
    else assert.equal(result.kind, 'state-unavailable');
  }
  for (const value of last.values()) {
    assert.equal(value.effects, value.entries.length);
    for (const entry of value.entries) { assert.equal(entry.authorizationSeenAtEntry, true, 'Unauthorized callback entry'); assert.deepEqual(entry.owner, view.owner); assert.ok(value.authorizations.some(owner => JSON.stringify(owner) === JSON.stringify(entry.owner))); }
    for (const owner of value.authorizations) assert.deepEqual(owner, view.owner);
    if (value.actor !== view.owner.process.pid) { assert.equal(value.effects, 0); assert.deepEqual(value.entries, []); assert.deepEqual(value.authorizations, []); }
  }
  assert.equal(view.cancellationRequested, false); assert.ok(deviceView); assert.equal(deviceView.generation, view.owner.generation);
  if (terminal) { assert.equal(view.state, 'terminal'); assert.deepEqual(view.terminal, terminal); assert.equal(deviceView.state, 'available'); assert.equal(deviceView.owner, null); }
  else { assert.equal(view.state, 'active'); assert.equal(view.terminal, null); assert.equal(deviceView.state, 'active'); assert.deepEqual(deviceView.owner, view.owner); }
  return view;
}
test('controlled core storage refusal reconciles both attempts without replay', async t => {
  const { root, admission } = fixture(t); const held = join(root, 'entered'); const release = join(root, 'release');
  const first = await worker({ t, root, control: { kind: 'hold', operation: 'acquire', point: 'beforeCommit', entered: held, release } });
  const firstReply = acquire({ child: first, request: request('holder') }); await entered(held);
  const second = await worker({ t, root });
  const lost = await acquire({ child: second, request: request('waiter'), policy: 'contention' });
  writeFileSync(release, 'release'); const won = await firstReply;
  assert.throws(() => requireAcquisition({ result: lost.result }), /state-unavailable/); assert.equal(lost.result.kind, 'state-unavailable');
  const finished = await exchange({ child: first, command: { operation: 'finalize', terminal: success } });
  assert.equal(finished.operation, 'finalize'); assert.equal(finished.result.kind, 'finalized');
  if (finished.operation !== 'finalize' || finished.result.kind !== 'finalized') throw new Error('Finalization failed'); assert.equal(finished.result.finalization.authority, 'committed');
  await Promise.all([closeActor(first), closeActor(second)]);
  coreAuthority({ admission, contenders: [{ request: request('holder'), reply: won }, { request: request('waiter'), reply: lost }], activity: [finished], terminal: success });
});
test('unconfirmed core acquisition retains committed owner after normal exit without retry', async t => {
  const { root, admission } = fixture(t); const input = request('ambiguous');
  const child = await worker({ t, root, control: { kind: 'unavailable', operation: 'acquire', point: 'afterCommit' } });
  const result = await acquire({ child, request: input, policy: 'contention' }); assert.equal(result.result.kind, 'state-unavailable');
  await closeActor(child);
  const view = coreAuthority({ admission, contenders: [{ request: input, reply: result }] }); assert.ok(view); assert.equal(view.state, 'active'); assert.equal(view.terminal, null);
  assert.equal(result.effects, 0); assert.equal(result.entries.length, 0);
});
for (const firstKind of ['observed', 'legacy'] as const) {
  test(`independent ${firstKind} and competing owner serialize acquisition without sabotaging the winner`, async t => {
    const { root, admission } = fixture(t); const firstRequest = request('first'); firstRequest.attempt.kind = firstKind;
    const secondRequest = request('second'); secondRequest.attempt.kind = firstKind === 'observed' ? 'legacy' : 'observed';
    const first = await worker({ t, root }); const second = await worker({ t, root });
    const [firstReply, secondReply] = await Promise.all([acquire({ child: first, request: firstRequest, policy: 'contention' }), acquire({ child: second, request: secondRequest, policy: 'contention' })]);
    if ([firstReply,secondReply].every(r => r.result.kind !== 'state-unavailable')) assert.deepEqual([firstReply.result.kind,secondReply.result.kind].sort(), ['acquired','refused']);
    await Promise.all([closeActor(first),closeActor(second)]);
    coreAuthority({ admission, contenders: [{ request: firstRequest, reply: firstReply }, { request: secondRequest, reply: secondReply }] });
  });
  test(`ordered independent ${firstKind} winner is useful, exclusive and completable`, async t => {
    const { root, admission } = fixture(t); const firstRequest = request('first'); firstRequest.attempt.kind = firstKind;
    const secondRequest = request('second'); secondRequest.attempt.kind = firstKind === 'observed' ? 'legacy' : 'observed';
    const first = await worker({ t, root }); const firstReply = await acquire({ child: first, request: firstRequest }); assert.equal(firstReply.result.kind, 'acquired');
    const second = await worker({ t, root }); const secondReply = await acquire({ child: second, request: secondRequest }); assert.equal(secondReply.result.kind, 'refused'); if (secondReply.result.kind !== 'refused') throw new Error('Missing refusal'); assert.equal(secondReply.result.reason, 'DEVICE_BUSY');
    const effect = await exchange({ child: first, command: { operation: 'dispatch' } }); assert.equal(effect.result.kind, 'dispatched'); assert.equal(effect.effects, 1); assert.equal(secondReply.effects, 0);
    const finished = await exchange({ child: first, command: { operation: 'finalize', terminal: success } });
    assert.ok(finished.operation === 'finalize' && finished.result.kind === 'finalized'); assert.equal(finished.result.finalization.authority, 'committed');
    await Promise.all([closeActor(first),closeActor(second)]);
    coreAuthority({ admission, contenders: [{ request: firstRequest, reply: firstReply }, { request: secondRequest, reply: secondReply }], activity: [effect,finished], terminal: success });
  });
}

test('real dead child remains busy on reads; explicit owner-aware recovery quarantines it without reclaiming', async t => {
  const { root, admission } = fixture(t);
  const child = await worker({ t, root });
  const acquired = await reply({ child, message: { operation: 'acquire', request: request('child') } });
  assert.equal(acquired.kind, 'acquired'); assert.ok(acquired.kind === 'acquired');
  assert.equal(admission.quarantineAbandoned(acquired.owner, 'still live'), false);
  await closeActor(child);
  assert.equal(admission.inspect(device)?.state, 'active');
  assert.deepEqual(admission.acquire(request('successor')), { kind: 'refused', reason: 'DEVICE_BUSY' });
  assert.equal(admission.quarantineAbandoned(acquired.owner, 'owner exited'), true);
  assert.equal(admission.inspect(device)?.state, 'quarantined');
  assert.equal(admission.readAttempt(request('child').attempt)?.terminal?.outcome, 'inconclusive');
  assert.deepEqual(admission.acquire(request('successor')), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
});

for (const operation of ['acquire', 'finalize'] as const) for (const point of ['beforeCommit', 'afterCommit']) {
  test(`child death ${operation} ${point} leaves only atomic authority`, async t => {
    const { root, admission } = fixture(t);
    const child = await worker({ t, root, faultOperation: operation, faultPoint: point });
    if (operation === 'finalize') assert.equal((await reply({ child, message: { operation: 'acquire', request: request('killed') } })).kind, 'acquired');
    const requestId = sendUnanswered({ child, command: operation === 'acquire' ? { operation, request: request('killed') } : { operation, terminal: success } });
    const state = actors.get(child)!; const exited = await state.closed;
    assert.deepEqual(state.errors, [], 'Fault command must not return a receipt or protocol error');
    assert.equal(state.termination, 'none', 'Fault death must precede deadline or teardown termination');
    assert.equal(exited.code, null, exited.stderr); assert.equal(exited.signal, 'SIGKILL');
    assert.deepEqual(faultSchema.parse(JSON.parse(exited.faultOutput)), { type: 'fault', requestId, actor: child.pid, operation, point }, 'Death must occur at the correlated fault cutpoint');
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
      try {
        if(corruption==='schema') {
          assert.throws(()=>db.exec('UPDATE metadata SET schema_version=999'),/Schema version must advance by one/);
          db.exec('UPDATE metadata SET schema_version=schema_version+1');
        } else {
          assert.throws(()=>db.exec("UPDATE metadata SET migration_manifest='{}'"),/Immutable metadata binding/);
          db.exec("DROP TRIGGER metadata_binding_immutable; UPDATE metadata SET migration_manifest='{}'");
        }
      } finally { db.close(); }
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
