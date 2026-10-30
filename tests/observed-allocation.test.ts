import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn as spawnChild } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ObservedAllocator } from '../src/observed/allocation.js';
import { Admission } from '../src/device/admission.js';
import { deviceWindowOpener } from '../src/device/index.js';
import { allocationSourceProcess } from '../src/observed/allocation-config.js';
import { allocationSnapshot, canonicalJson } from '../src/observed/allocation-schema.js';
import { migrateAdmissionForTesting, type ImportedObservedAction } from '../src/device/admission-migration.js';
import { allocationFixture, fixtureDevice } from './fixtures/observed-allocation-backend.js';
import { appiumAllocator, fixtureWorld, tapLeadsDone, type AllocatorWorld } from './fixtures/appium-wire/observed-allocator.js';

type Allocation = Awaited<ReturnType<typeof appiumAllocator>>;
const prepared = ['ios-boot', 'ios-install', 'ios-launch'];
/** Every device-facing effect so far: simulator creation, native helpers, and each Appium session's tool calls. */
const effects = ({ f, w }: Pick<Allocation, 'f' | 'w'>) => ({ source: f.calls.filter(call => call !== 'plist'), natives: w.native.calls.map(call => call.command.kind),
  tools: w.opened.map(opened => opened.tools()) });
const none = { source: [], natives: [], tools: [] };
const exit = ({ w }: Pick<Allocation, 'w'>, kind: string) => { for (const call of w.native.calls) if (call.command.kind === kind) call.exit({ kind: 'exited', code: 0 }); };
async function until(reached: () => boolean, label: string): Promise<void> {
  for (let waited = 0; !reached(); waited += 10) { assert.ok(waited < 10_000, label); await delay(10); }
}
function hold() {
  let reach!: () => void; let release!: () => void;
  const reached = new Promise<void>(r => { reach = r; }); const released = new Promise<void>(r => { release = r; });
  return { reached, release, async pause() { reach(); await released; } };
}
const supplied = (f: Allocation['f'], actionId?: string) => ({ ...f.request(actionId), source: { kind: 'supplied', inventoryId: 'stock-one' } });

test('one fresh allocation reserves and stages before create, prepares once on the Appium driver and parks for a fresh action', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  f.setBefore(async operation => {
    if (operation === 'create') {
      const record = f.admission.readAllocationForAction('allocate-one');
      assert.equal(record?.phase, 'creating'); assert.equal(record?.hostCreationBlocked, true);
      assert.ok(record?.staged); assert.equal(record?.inspectedContentDigest, record?.staged?.contentDigest);
    }
  });
  const ready = await allocator.prepare(f.request());
  assert.ok(!('kind' in ready), JSON.stringify(ready)); if ('kind' in ready) assert.fail(JSON.stringify(ready));
  assert.equal(ready.state, 'ready'); assert.equal(ready.outcome, 'prepared'); assert.equal(ready.authority, 'committed');
  assert.deepEqual([effects(x).source, effects(x).natives], [['create'], prepared]);
  assert.equal(ready.readinessEvidence.length, 2); assert.ok((await fs.readFile(ready.readinessEvidence[0]!, 'utf8')).includes('capturedAt'));
  const calls = [...f.calls]; const before = effects(x); f.configure({ version: 2 });
  assert.deepEqual(await allocator.prepare(f.request()), ready, 'Retrieval must precede config/artifact/source probes');
  assert.deepEqual(f.calls, calls); assert.deepEqual(effects(x), before);
  await allocator.close(); assert.equal(f.admission.readAllocation(ready.allocationId)?.state, 'ready');
});

test('shutdown during a pending configuration read returns promptly with no reservation or backend continuation', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; const original = f.host.fs.lstat;
  let started!: () => void; let release!: () => void;
  const began = new Promise<void>(r => { started = r; }); const pending = new Promise<void>(r => { release = r; });
  f.host.fs.lstat = (async (...args: Parameters<typeof original>) => {
    if (String(args[0]) === f.configPath) { started(); await pending; } return original(...args);
  }) as typeof original;
  try {
    const preparing = allocator.prepare(f.request()); await began; const closing = allocator.close();
    const result = await Promise.race([preparing, new Promise<string>(r => setTimeout(() => r('still pending'), 100))]);
    assert.notEqual(result, 'still pending'); assert.ok(typeof result === 'object' && 'kind' in result && result.code === 'CANCELLED');
    assert.equal(f.admission.readAllocationForAction('allocate-one'), undefined); assert.deepEqual(f.calls, []); assert.deepEqual(effects(x), none);
    release(); await closing;
  } finally { release(); f.host.fs.lstat = original; }
});

test('supplied inventory is reserved and admitted before availability, then prepares without create or source fallback', async t => {
  let atAvailability: string | undefined;
  const x = await appiumAllocator(t, { beforeList: async count => { if (count === 2) atAvailability = x.f.admission.inspect(fixtureDevice)?.state; } });
  const { f, allocator } = x; f.configure({ inventory: f.inventory() });
  const ready = snapshot(await allocator.prepare(supplied(f)));
  assert.equal(ready.state, 'ready'); assert.deepEqual([effects(x).source, effects(x).natives], [[], prepared]);
  assert.equal(atAvailability, 'active', 'availability is read through the admitted driver');
  const before = effects(x); await allocator.close(); assert.equal(f.admission.readAllocation(ready.allocationId)?.state, 'ready'); assert.deepEqual(effects(x), before);
});

test('unavailable supplied vendor identity refuses before boot and never switches to create', async t => {
  const x = await appiumAllocator(t, { listed: () => ({ state: 'Shutdown', isAvailable: false }) }); const { f, allocator } = x; f.configure({ inventory: f.inventory() });
  const result = snapshot(await allocator.prepare(supplied(f)));
  assert.equal(result.reason, 'INVENTORY_INELIGIBLE'); assert.equal(result.outcome, 'refused');
  assert.deepEqual([effects(x).source, effects(x).natives], [[], []]); assert.equal(result.reservation.capacityHeld, true);
});

function snapshot(result: Awaited<ReturnType<ObservedAllocator['prepare']>>) {
  assert.ok(!('kind' in result), JSON.stringify(result)); if ('kind' in result) assert.fail(); return result;
}
function refused(result: Awaited<ReturnType<ObservedAllocator['prepare']>>, code: string) {
  assert.ok('kind' in result, JSON.stringify(result)); if (!('kind' in result)) assert.fail(); assert.equal(result.code, code); return result;
}

test('eight retained allocations hold capacity, ninth refuses and changed config counts persisted reservation bytes', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  for (let i = 1; i <= 8; i++) {
    assert.equal(snapshot(await allocator.prepare(f.request('allocation-' + i))).state, 'ready');
    assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: i, reservedBytes: i * 1000 });
  }
  const before = effects(x); refused(await allocator.prepare(f.request('allocation-9')), 'BUDGET_EXHAUSTED');
  assert.deepEqual(effects(x), before);
  f.configure({ maxRetainedAllocations: 10, reservationBytesPerAllocation: 500, maxReservedBytes: 8500 });
  assert.equal(snapshot(await allocator.prepare(f.request('allocation-9'))).state, 'ready');
  assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 9, reservedBytes: 8500 });
  const held = effects(x); refused(await allocator.prepare(f.request('allocation-10')), 'BUDGET_EXHAUSTED');
  assert.deepEqual(effects(x), held);
});

for (const [name, storage, expected] of [['simulator below boundary', 2999, 'STORAGE_UNAVAILABLE'],
  ['unreadable storage', NaN, 'STORAGE_UNAVAILABLE']] as const) test(`storage ${name} refuses before reservation and effects`, async t => {
  const x = await appiumAllocator(t); x.f.setStorage(storage);
  refused(await x.allocator.prepare(x.f.request()), expected); assert.equal(x.f.admission.readAllocationForAction('allocate-one'), undefined); assert.deepEqual(effects(x), none);
});

test('fresh storage check after staging holds all persisted reservations and prevents creation', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  f.setBefore(async (operation, path) => { if (operation === 'plist' && path?.includes('/staging/')) f.setStorage(2999); });
  const result = snapshot(await allocator.prepare(f.request()));
  assert.equal(result.reason, 'STORAGE_UNAVAILABLE'); assert.equal(result.outcome, 'refused');
  assert.equal(result.reservation.capacityHeld, false); assert.deepEqual(effects(x), none);
  assert.equal(f.admission.readAllocationForAction('allocate-one')?.staged?.metadata.bundleId, 'org.example.fixture');
});

test('free-space equality and exact artifact byte ceiling are accepted', async t => {
  const { f, allocator } = await appiumAllocator(t);
  const files = await Promise.all(['Fixture', 'Info.plist'].map(name => fs.stat(join(f.app, name))));
  const bytes = files.reduce((n, s) => n + s.size, 0); f.configure({ maxArtifactBytes: bytes }); f.setStorage(3000, 3000 + bytes);
  assert.equal(snapshot(await allocator.prepare(f.request())).state, 'ready');
});

test('artifact size, source mutation and staged mutation refuse without install or rebuilding', async t => {
  for (const mode of ['size', 'source', 'staged'] as const) {
    const x: Allocation = await appiumAllocator(t, mode === 'staged' ? { beforeList: async count => {
      if (count !== 1) return;
      const staged = x.f.admission.readAllocationForAction('allocate-one')!.staged!.stagedPath;
      await fs.chmod(join(staged, 'Fixture'), 0o700); await fs.appendFile(join(staged, 'Fixture'), 'changed');
    } } : {});
    const { f, allocator } = x;
    if (mode === 'size') f.configure({ maxArtifactBytes: 1 });
    if (mode === 'source') f.setBefore(async (operation, path) => { if (operation === 'plist' && path?.includes('/staging/')) await fs.appendFile(join(f.app, 'Info.plist'), 'changed'); });
    const result = await allocator.prepare(f.request());
    if (mode === 'size') refused(result, 'ARTIFACT_INVALID'); else assert.equal(snapshot(result).reason, 'ARTIFACT_INVALID');
    assert.ok(!effects(x).natives.includes('ios-install')); assert.equal(effects(x).source.filter(call => call === 'create').length, mode === 'staged' ? 1 : 0);
  }
});

for (const receipt of [
  { exitCode: 0, stdout: 'not a UUID', stderr: '' }, { exitCode: 1, stdout: 'ABCDEF00-0000-4000-8000-000000000001', stderr: 'vendor refused' },
  { exitCode: null, stdout: '', stderr: '' }, { exitCode: 0, stdout: 'x'.repeat(65537), stderr: '' },
]) test(`unknown creation (${receipt.exitCode}/${receipt.stdout.length}) holds capacity and global guard without retry`, async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; f.setCreateResult(receipt);
  const result = snapshot(await allocator.prepare(f.request())); assert.equal(result.state, 'quarantined'); assert.equal(result.reason, 'CREATE_UNCONFIRMED');
  assert.equal(result.hostCreationBlocked, true); assert.equal(result.device, null); assert.equal(result.reservation.capacityHeld, true);
  assert.ok(result.evidenceRefs.includes(f.admission.readAllocation(result.allocationId)!.evidenceDirectory));
  assert.deepEqual(effects(x), { ...none, source: ['create'] }); const before = [...f.calls];
  assert.deepEqual(await allocator.prepare(f.request()), result); assert.deepEqual(f.calls, before);
  refused(await allocator.prepare(f.request('another')), 'HOST_CREATION_UNRESOLVED'); assert.deepEqual(effects(x), { ...none, source: ['create'] });
  const other = f.admission.acquire({ device: 'ABCDEF00-0000-4000-8000-000000000009', attempt: { kind: 'legacy', id: 'blocked' }, digest: 'blocked', intent: {} });
  assert.equal(other.kind, 'refused'); if (other.kind === 'refused') assert.equal(other.reason, 'HOST_CREATION_UNRESOLVED');
});

for (const protectedDevice of ['73997430-DB8A-48C8-8146-12320CE6AEFE', '2FE383F2-2D0F-4286-8797-D3ACEFCD6220',
  '6A8C5F93-F59A-456B-B157-10642209B734', '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7']) test(`protected receipt ${protectedDevice} is never admitted or prepared`, async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; f.setCreateResult({ exitCode: 0, stdout: protectedDevice, stderr: '' });
  const result = snapshot(await allocator.prepare(f.request())); assert.equal(result.state, 'quarantined'); assert.equal(result.hostCreationBlocked, true);
  assert.deepEqual(effects(x), { ...none, source: ['create'] }); assert.equal(f.admission.inspect(protectedDevice), undefined);
});

for (const phase of ['staging', 'create', 'boot-state', 'screen'] as const) {
  test(`cancel during ${phase} prevents every later dispatch and late completion cannot park`, async t => {
    const gate = hold();
    const world: AllocatorWorld = phase === 'boot-state' ? { beforeList: async count => { if (count === 2) await gate.pause(); } }
      : phase === 'screen' ? { worlds: [fixtureWorld([{ tool: 'jev_screen', nth: 1, fault: { kind: 'held' } }, ...tapLeadsDone])] } : {};
    const x = await appiumAllocator(t, world); const { f, w, allocator } = x;
    f.setBefore(async (operation, path) => {
      if (phase === 'staging' ? operation === 'plist' && !!path?.includes('/staging/') : phase === 'create' && operation === 'create') await gate.pause();
    });
    try {
      const preparing = allocator.prepare(f.request());
      if (phase === 'screen') await until(() => !!w.opened[0]?.tools().includes('jev_screen'), 'screen reached'); else await gate.reached;
      const record = f.admission.readAllocationForAction('allocate-one')!; assert.equal(record.state, 'preparing');
      const cancelling = allocator.cancel(record.allocationId);
      await until(() => f.admission.readAllocation(record.allocationId)!.cancellationRequested, 'cancellation committed');
      gate.release(); w.opened[0]?.release();
      const cancelled = snapshot(await cancelling); assert.equal(cancelled.cancellationRequested, true); assert.notEqual(cancelled.state, 'ready');
      assert.notEqual(snapshot(await preparing).outcome, 'prepared');
      const after = effects(x); await delay(100);
      assert.deepEqual(effects(x), after); assert.notEqual(f.admission.readAllocation(record.allocationId)?.state, 'ready');
      assert.deepEqual(after.natives, { staging: [], create: [], 'boot-state': ['ios-boot'], screen: prepared }[phase]);
      if (phase === 'screen') assert.deepEqual(after.tools, [['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_session_management']],
        'nothing follows the held screen read but the session delete');
    } finally { gate.release(); }
  });
}

test('status wait abortion is a pure read and concurrent IDs retain immutable identity before any new effect', async t => {
  const x = await appiumAllocator(t, { nativeHeld: command => command.kind === 'ios-boot' }); const { f, w, allocator } = x;
  const preparing = allocator.prepare(f.request()); await until(() => w.native.calls.length === 1, 'boot reached');
  const record = f.admission.readAllocationForAction('allocate-one')!;
  const before = effects(x); assert.equal(snapshot(await allocator.prepare(f.request())).state, 'preparing');
  refused(await allocator.prepare({ ...f.request(), timeoutMs: 2000 }), 'ACTION_ID_CONFLICT'); assert.deepEqual(effects(x), before);
  refused(await allocator.prepare(f.request('competing')), 'BUDGET_EXHAUSTED'); assert.deepEqual([effects(x).source, effects(x).natives], [['create'], ['ios-boot']]);
  const saved = f.admission.readAllocation(record.allocationId); const controller = new AbortController();
  const waiting = allocator.get(record.allocationId.toLowerCase(), { waitMs: 45000, signal: controller.signal }); controller.abort();
  refused(await waiting, 'WAIT_CANCELLED'); assert.deepEqual(f.admission.readAllocation(record.allocationId), saved);
  await allocator.cancel(record.allocationId); exit(x, 'ios-boot'); await preparing;
});

function binding(record: { allocationId: string; actionId: string }, f: { root: string }) {
  return { ...record, actionDigest: 'b'.repeat(64), request: { version: 1 }, appBundleId: 'org.example.fixture',
    evidence: { bridgeVersion: 'fixture', directory: join(f.root, 'action'), request: join(f.root, 'action/request.json') } };
}

test('pure ready reads do not expire TTL; only first consume expires or transfers, terminal retirement is bookkeeping', async t => {
  let now = Date.now(); const x = await appiumAllocator(t, { now: () => now }); const { f, allocator } = x;
  const ready = snapshot(await allocator.prepare(f.request())); const record = f.admission.readAllocation(ready.allocationId)!;
  now = record.expiresAt!; assert.equal(snapshot(await allocator.get(ready.allocationId)).state, 'ready');
  assert.deepEqual(f.admission.readAllocation(ready.allocationId), record);
  const before = effects(x); const consumed = allocator.consume(binding({ allocationId: ready.allocationId, actionId: ready.actionId }, f));
  assert.equal(consumed.kind, 'refused'); if (consumed.kind === 'refused') assert.equal(consumed.reason, 'READY_EXPIRED');
  const retired = snapshot(await allocator.retire(ready.allocationId)); assert.equal(retired.outcome, 'retired_unused'); assert.equal(retired.reason, 'READY_EXPIRED');
  assert.deepEqual(effects(x), before); assert.equal(retired.reservation.capacityHeld, true);
});

test('normal shutdown racing the committed park leaves ready ownership intact', async t => {
  let allocator!: ObservedAllocator; let closing: Promise<void> | undefined;
  const x = await appiumAllocator(t, { fault(point, operation) { if (point === 'afterCommit' && operation === 'parkAllocation') closing = allocator.close(); } }); allocator = x.allocator;
  const ready = snapshot(await allocator.prepare(x.f.request())); await closing; assert.equal(ready.state, 'ready');
  assert.equal(x.f.admission.readAllocation(ready.allocationId)?.state, 'ready'); assert.equal(ready.cancellationRequested, false);
});

for (const corruption of ['missing', 'corrupt'] as const) test(`${corruption} initialized store refuses before config/source probes with no alternate root`, async t => {
  const { f, allocator } = await appiumAllocator(t);
  if (corruption === 'missing') await fs.rm(join(f.store, 'admission.sqlite')); else await fs.writeFile(join(f.store, 'admission.sqlite'), 'corrupt');
  refused(await allocator.prepare(f.request()), 'STORE_UNAVAILABLE'); assert.deepEqual(f.calls, []);
});

const hostile = 'TYPESAFE_API_KEY=sk-private-fixture vendor stderr /private/supplied-fixture';
for (const failure of ['config', 'metadata', 'artifact', 'create', 'boot'] as const) test(`public ${failure} errors discard credential-looking diagnostics and supplied values`, async t => {
  const { f, allocator } = await appiumAllocator(t, failure === 'boot' ? { nativeExit: command => command.kind === 'ios-boot' ? 1 : undefined, nativeStderr: hostile } : {});
  if (failure === 'config') f.configure({ unexpected: hostile });
  if (failure === 'create') f.setCreateResult({ exitCode: 1, stdout: hostile, stderr: hostile });
  f.setBefore(async (op, path) => {
    if ((failure === 'metadata' && op === 'plist' && path?.startsWith('/Applications/'))
      || (failure === 'artifact' && op === 'plist' && path === join(f.app, 'Info.plist'))) throw new Error(hostile);
  });
  const result = await allocator.prepare(f.request()); const text = JSON.stringify(result);
  assert.ok(!text.includes(hostile)); assert.ok(!text.includes('sk-private-fixture')); assert.ok(!text.includes('vendor stderr'));
  assert.ok('kind' in result || result.state !== 'ready');
  if (!('kind' in result)) assert.ok(!JSON.stringify(await allocator.get(result.allocationId)).includes('sk-private-fixture'));
});

test('borrowed admission survives memoized module close; closed module retrieves ready stock before checking shutdown', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  const ready = snapshot(await allocator.prepare(f.request())); const before = effects(x);
  const closing = allocator.close(); assert.equal(allocator.close(), closing); await closing;
  assert.equal(f.admission.readAllocation(ready.allocationId)?.state, 'ready');
  assert.deepEqual(await allocator.prepare(f.request()), ready); refused(await allocator.prepare(f.request('closed-new')), 'SHUTTING_DOWN');
  assert.deepEqual(effects(x), before);
});

test('production composition refuses a test store before any fake source, runner or opener can execute', async () => {
  const f = await allocationFixture();
  try { assert.throws(() => new ObservedAllocator({ runsDir: f.runsDir, admission: f.admission }), /production|fake|test/i);
    assert.throws(() => new ObservedAllocator({ runsDir: f.runsDir, admission: f.admission,
      fakeBackend: { process: f.source, runner: f.runner, host: f.host } as never })); assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test('test authority rejects production window opener and production source composition at construction before any effects', async () => {
  const f = await allocationFixture();
  try {
    assert.throws(() => new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir,
      fakeBackend: { process: f.source, runner: f.runner, window: deviceWindowOpener(false, {}), host: f.host } }));
    assert.throws(() => new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir,
      fakeBackend: { process: allocationSourceProcess(f.host), runner: f.runner, window: f.window, host: f.host } }));
    assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

for (const stock of ['unknown', 'protected', 'duplicate', 'used'] as const) test(`supplied ${stock} stock refuses without creation fallback`, async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  if (stock === 'protected') f.configure({ inventory: f.inventory('73997430-DB8A-48C8-8146-12320CE6AEFE') });
  else if (stock === 'duplicate') f.configure({ inventory: [...f.inventory(), ...f.inventory()] });
  else if (stock === 'used') f.configure({ inventory: f.inventory().map(entry => ({ ...entry, attestation: { freshUnused: false, exclusive: true } })) });
  const result = await allocator.prepare(supplied(f));
  assert.ok('kind' in result || result.state !== 'ready'); assert.deepEqual(effects(x), none);
  assert.equal(f.admission.readAllocationForAction('allocate-one'), undefined);
});

test('supplied identity is transactionally exhausted after ready and cannot be prepared twice', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; f.configure({ inventory: f.inventory() });
  assert.equal(snapshot(await allocator.prepare(supplied(f, 'supplied-first'))).state, 'ready'); const before = effects(x);
  refused(await allocator.prepare(supplied(f, 'supplied-second')), 'INVENTORY_INELIGIBLE'); assert.deepEqual(effects(x), before);
});

function isolatedChild(script: string, args: string[]): Promise<{code: number | null; stdout: string; stderr: string}> {
  return new Promise((done, fail) => {
    const child = spawnChild(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, ...args], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.once('error', fail); child.once('close', code => done({ code, stdout, stderr }));
  });
}

test('independent process consumes parked stock after owner closes, exactly once with the full action binding and zero preparation effects', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  const ready = snapshot(await allocator.prepare(f.request())); await allocator.close(); const before = effects(x);
  const child = await isolatedChild(`
    import { Admission } from './src/device/admission.ts';
    const [root, raw] = process.argv.slice(1); const admission = Admission.forTesting({ root, backend:'fake' });
    const binding = JSON.parse(raw); const first = admission.consumeAllocation(binding); const second = admission.consumeAllocation(binding);
    console.log(JSON.stringify({ first:first.kind, second:second.kind, state:admission.readAllocation(binding.allocationId).state }));
  `, [f.store, JSON.stringify(binding({ allocationId: ready.allocationId, actionId: ready.actionId }, f))]);
  assert.equal(child.code, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { first: 'consumed', second: 'retrieved', state: 'executing' });
  assert.deepEqual(effects(x), before); assert.equal(f.admission.readAllocation(ready.allocationId)?.state, 'executing');
});

test('one stage deadline bounds a pending boot and its late receipt cannot continue or become ready', async t => {
  const x = await appiumAllocator(t, { budgets: { bootTimeoutMs: 30 }, nativeHeld: command => command.kind === 'ios-boot' }); const { f, allocator } = x;
  const result = snapshot(await allocator.prepare(f.request()));
  assert.equal(result.state, 'quarantined'); assert.notEqual(result.outcome, 'prepared');
  const before = effects(x); exit(x, 'ios-boot'); await delay(100); assert.deepEqual(effects(x), before);
  assert.deepEqual(before.natives, ['ios-boot']); assert.equal(f.admission.readAllocation(result.allocationId)?.state, 'quarantined');
});

test('one stage deadline bounds a late readiness read and its late reply cannot continue or become ready', async t => {
  const x = await appiumAllocator(t, { budgets: { readinessTimeoutMs: 30 },
    worlds: [fixtureWorld([{ tool: 'appium_get_page_source', nth: 1, fault: { kind: 'late', ms: 1000 } }, ...tapLeadsDone])] });
  const result = snapshot(await x.allocator.prepare(x.f.request()));
  assert.equal(result.state, 'quarantined'); assert.equal(result.reason, 'READINESS_FAILED'); assert.notEqual(result.outcome, 'prepared');
  const before = effects(x); await delay(100); assert.deepEqual(effects(x), before);
  assert.deepEqual(before.tools, [['appium_session_management', 'jev_settings', 'appium_get_page_source', 'appium_session_management']], 'the late reply reads no screen');
  assert.equal(x.f.admission.readAllocation(result.allocationId)?.state, 'quarantined');
});

test('lost creation reply times out with guard retained; eventual known UUID cannot bind or continue', async t => {
  const x = await appiumAllocator(t, { budgets: { createTimeoutMs: 30 } }); const { f, allocator } = x; const gate = hold();
  f.setBefore(async op => { if (op === 'create') await gate.pause(); });
  try { const preparing = allocator.prepare(f.request()); await gate.reached; const unknown = snapshot(await preparing);
    assert.equal(unknown.reason, 'CREATE_UNCONFIRMED'); assert.equal(unknown.hostCreationBlocked, true); assert.equal(unknown.device, null);
    assert.ok(unknown.evidenceRefs.includes(f.admission.readAllocation(unknown.allocationId)!.evidenceDirectory));
    gate.release(); await delay(20); assert.deepEqual(effects(x), { ...none, source: ['create'] });
    const persisted = f.admission.readAllocation(unknown.allocationId)!; assert.equal(persisted.hostCreationBlocked, true); assert.equal(persisted.device, null);
    assert.equal(persisted.state, 'quarantined'); refused(await allocator.prepare(f.request('after-lost')), 'HOST_CREATION_UNRESOLVED');
  } finally { gate.release(); }
});

test('aggregate booting stage budget covers the boot and its state poll without resetting on a settled response', async t => {
  const x = await appiumAllocator(t, { budgets: { bootTimeoutMs: 70 }, nativeHeld: command => command.kind === 'ios-boot',
    beforeList: async count => { if (count === 2) await delay(45); } });
  const preparing = x.allocator.prepare(x.f.request());
  await until(() => x.w.native.calls.length === 1, 'boot reached'); await delay(45); exit(x, 'ios-boot');
  const result = snapshot(await preparing); assert.equal(result.state, 'quarantined'); assert.notEqual(result.outcome, 'prepared');
  assert.ok(!effects(x).natives.includes('ios-install'));
  await delay(50); assert.equal(x.f.admission.readAllocation(result.allocationId)?.state, 'quarantined');
});

test('aggregate readiness stage budget covers every screen read without resetting on a settled response', async t => {
  const x = await appiumAllocator(t, { budgets: { readinessTimeoutMs: 70 },
    worlds: [fixtureWorld([{ tool: 'appium_get_page_source', fault: { kind: 'late', ms: 45 } }, ...tapLeadsDone])] });
  const result = snapshot(await x.allocator.prepare(x.f.request()));
  assert.equal(result.state, 'quarantined'); assert.equal(result.reason, 'READINESS_FAILED'); assert.notEqual(result.outcome, 'prepared');
  await delay(50); assert.equal(x.f.admission.readAllocation(result.allocationId)?.state, 'quarantined');
});

test('boot-state polling is no more frequent than once per second and boot is never retried', { timeout: 15000 }, async t => {
  const x = await appiumAllocator(t, { budgets: { bootTimeoutMs: 2500 }, listed: () => ({ state: 'Booting', isAvailable: true }) });
  const result = snapshot(await x.allocator.prepare(x.f.request())); assert.notEqual(result.state, 'ready');
  const polls = x.w.lists.slice(1);
  assert.ok(polls.length >= 2, `boot state was polled ${polls.length} times`);
  // libuv measures a timer from its cached loop time, which can trail Date.now() by a few milliseconds.
  for (let i = 1; i < polls.length; i++) assert.ok(polls[i]! - polls[i - 1]! >= 990, `poll ${i} came ${polls[i]! - polls[i - 1]!} ms after the previous one`);
  assert.deepEqual(effects(x).natives, ['ios-boot']);
});

test('retrieval and construction never recover missing local jobs; explicit recovery only uses conservative dead owner proof', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; const gate = hold();
  f.setBefore(async op => { if (op === 'create') await gate.pause(); });
  let proof: 'alive' | 'dead' | 'unknown' = 'alive';
  const reader = x.reader(Admission.forTesting({ root: f.store, backend: 'fake', ownerLiveness: () => proof }));
  try { const preparing = allocator.prepare(f.request()); await gate.reached; const stored = f.admission.readAllocationForAction('allocate-one')!;
    assert.equal(snapshot(await reader.get(stored.allocationId)).state, 'preparing'); assert.deepEqual(f.admission.readAllocation(stored.allocationId), stored);
    assert.equal(reader.recoverAbandoned(), 0); proof = 'unknown'; assert.equal(reader.recoverAbandoned(), 0);
    proof = 'dead'; assert.equal(reader.recoverAbandoned(), 1); assert.equal(reader.recoverAbandoned(), 0);
    const recovered = f.admission.readAllocation(stored.allocationId)!; assert.equal(recovered.state, 'quarantined');
    assert.equal(recovered.hostCreationBlocked, true); assert.equal(recovered.capacityHeld, true);
    gate.release(); await preparing; assert.equal(f.admission.readAllocation(stored.allocationId)?.state, 'quarantined'); assert.deepEqual(effects(x), { ...none, source: ['create'] });
  } finally { gate.release(); }
});

test('dead independent preparation process is unchanged by get, then explicit recovery quarantines without clearing unknown-create stock', async () => {
  const f = await allocationFixture(); let workerRoot: string | undefined;
  const child = spawnChild(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { allocationFixture } from './tests/fixtures/observed-allocation-backend.ts';
    import { ObservedAllocator } from './src/observed/allocation.ts';
    const f = await allocationFixture();
    const allocator = new ObservedAllocator({admission:f.admission,runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
    f.setBefore(async op => { if(op==='create') { console.log(JSON.stringify({root:f.root,store:f.store,record:f.admission.readAllocationForAction('allocate-one')})); await new Promise(()=>{}); } });
    setInterval(()=>{},1000); void allocator.prepare(f.request());
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', b => { stderr += b; });
  const exited = new Promise<void>(r => child.once('close', () => r()));
  let reader: ObservedAllocator | undefined;
  try {
    const raw = await new Promise<string>((done, fail) => { let text = ''; child.stdout.on('data', b => { text += b; if(text.includes('\n')) done(text.split('\n')[0]!); });
      child.once('error', fail); child.once('close', () => fail(new Error(stderr))); });
    const receipt = JSON.parse(raw) as {root:string;store:string;record:{allocationId:string;owner:{process:{pid:number}}}}; workerRoot = receipt.root;
    assert.equal(receipt.record.owner.process.pid, child.pid); child.kill('SIGTERM'); await exited;
    const admission = Admission.forTesting({ root: receipt.store, backend: 'fake', initialize: false });
    reader = new ObservedAllocator({ admission, runsDir: f.runsDir, fakeBackend: { process: f.source, runner: f.runner, window: f.window, host: f.host } });
    const stored = admission.readAllocation(receipt.record.allocationId)!; assert.equal(snapshot(await reader.get(stored.allocationId)).state, 'preparing');
    assert.deepEqual(admission.readAllocation(stored.allocationId), stored); assert.equal(reader.recoverAbandoned(), 1);
    const recovered = admission.readAllocation(stored.allocationId)!; assert.equal(recovered.state, 'quarantined'); assert.equal(recovered.capacityHeld, true);
    assert.equal(recovered.hostCreationBlocked, true); assert.equal(recovered.device, null); assert.deepEqual(f.calls, []);
  } finally { child.kill('SIGTERM'); await exited; await reader?.close(); await f.cleanup();
    if (workerRoot) { async function writable(path: string): Promise<void> { const s = await fs.lstat(path); if (!s.isDirectory() || s.isSymbolicLink()) return;
      await fs.chmod(path, 0o700); for (const entry of await fs.readdir(path)) await writable(join(path, entry)); }
      await writable(workerRoot); await fs.rm(workerRoot, { recursive:true, force:true }); }
  }
});

test('reserved failure retains bounded private raw source diagnostics while public envelopes expose only truthful references', async t => {
  const { f, allocator } = await appiumAllocator(t); f.setCreateResult({ exitCode: 1, stdout: '', stderr: hostile + 'x'.repeat(70000) });
  const result = snapshot(await allocator.prepare(f.request())); const directory = f.admission.readAllocation(result.allocationId)!.evidenceDirectory;
  assert.ok(result.evidenceRefs.includes(directory)); const diagnostic = join(directory, 'source-diagnostics.json');
  assert.ok(!result.evidenceRefs.includes(diagnostic), 'Directory authority does not fabricate a per-file receipt'); const stat = await fs.stat(diagnostic); assert.equal(stat.mode & 0o777, 0o600); assert.ok(stat.size <= 65536);
  assert.ok((await fs.readFile(diagnostic, 'utf8')).includes('sk-private-fixture')); assert.ok(!JSON.stringify(result).includes('sk-private-fixture'));
});

for (const [kind, reason] of [['ios-boot', 'BOOT_FAILED'], ['ios-install', 'INSTALL_FAILED'], ['ios-launch', 'LAUNCH_FAILED']] as const) {
  test(`known acknowledged ${kind} failure is a stable stage refusal with no retry or follow-up`, async t => {
    const x = await appiumAllocator(t, { nativeExit: command => command.kind === kind ? 1 : undefined, nativeStderr: hostile });
    const result = snapshot(await x.allocator.prepare(x.f.request())); assert.equal(result.reason, reason); assert.equal(result.state, 'retained');
    const { natives } = effects(x);
    assert.equal(result.outcome, 'refused'); assert.equal(natives.at(-1), kind); assert.equal(natives.filter(call => call === kind).length, 1);
    assert.ok(!JSON.stringify(result).includes('sk-private-fixture')); assert.equal(result.reservation.capacityHeld, true);
  });
}

for (const evidence of ['copy', 'missing', 'symlink', 'relative'] as const) test(`readiness screenshot ${evidence} is persisted privately or refuses without parking`, async t => {
  let path = '';
  const x = await appiumAllocator(t, { wrap: driver => {
    const readiness = driver.readiness.bind(driver);
    driver.readiness = async (signal, timeoutMs) => ({ ...await readiness(signal, timeoutMs), screenshotPath: path });
    return driver;
  } });
  const { f, allocator } = x; path = join(f.root, 'shot.jpg');
  if (evidence === 'copy') await fs.writeFile(path, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { mode: 0o600 });
  if (evidence === 'symlink') { await fs.writeFile(path + '.target', 'fixture'); await fs.symlink(path + '.target', path); }
  if (evidence === 'relative') path = 'shot.jpg';
  const result = snapshot(await allocator.prepare(f.request()));
  if (evidence === 'copy') { assert.equal(result.state, 'ready'); assert.equal(result.readinessEvidence.length, 2);
    const copied = result.readinessEvidence.find(ref => ref.endsWith('.jpg'))!; assert.notEqual(copied, path);
    assert.deepEqual(await fs.readFile(copied), await fs.readFile(path)); assert.equal((await fs.stat(copied)).mode & 0o777, 0o600);
  } else { assert.equal(result.state, 'quarantined'); assert.equal(result.reason, 'READINESS_FAILED'); assert.notEqual(result.outcome, 'prepared'); }
  assert.deepEqual(effects(x).natives, prepared);
});

for (const operation of ['stageAllocation', 'startCreation', 'recordCreation', 'parkAllocation'] as const) test(`lost ${operation} commit response uses fresh durable state and never replays`, async t => {
  let fired = false;
  const x = await appiumAllocator(t, { fault(point, op) { if (point === 'afterCommit' && op === operation && !fired) { fired = true; throw new Error(hostile); } } }); const { f, allocator } = x;
  const result = snapshot(await allocator.prepare(f.request())); assert.equal(fired, true);
  assert.equal(result.authority, 'committed'); assert.equal(result.state === 'ready', operation === 'parkAllocation');
  assert.ok(!JSON.stringify(result).includes(hostile)); const before = effects(x); assert.deepEqual(await allocator.prepare(f.request()), result); assert.deepEqual(effects(x), before);
  assert.equal(before.source.filter(call => call === 'create').length <= 1, true);
  if (operation === 'startCreation') { assert.equal(result.hostCreationBlocked, true); assert.deepEqual(before, none); }
  if (operation === 'recordCreation') assert.ok(!before.natives.includes('ios-boot'));
});

test('lost reservation commit reply returns only fresh accepted authority, never false no-acceptance or a replay', async t => {
  let fired = false;
  const x = await appiumAllocator(t, { fault(point, op) { if (point === 'afterCommit' && op === 'reserveAllocation' && !fired) { fired = true; throw new Error(hostile); } } }); const { f, allocator } = x;
  const result = snapshot(await allocator.prepare(f.request())); assert.equal(result.authority, 'committed'); assert.equal(result.state, 'preparing');
  assert.equal(f.admission.readAllocationForAction('allocate-one')?.allocationId, result.allocationId); assert.deepEqual(effects(x), none);
  const before = [...f.calls]; assert.deepEqual(await allocator.prepare(f.request()), result); assert.deepEqual(f.calls, before);
});

for (const phase of ['before-create', 'before-install'] as const) test(`fresh authoritative held-capacity check ${phase} honors another config generation`, async t => {
  let added = false;
  const reserveAnother = () => {
    if (added) return;
    const record = x.f.admission.readAllocationForAction('allocate-one')!; added = true;
    const reserved = x.f.admission.reserveAllocation({ actionId: 'other-config-generation', preparationDigest: 'c'.repeat(64), preparation: {},
      appBundleId: record.appBundleId, source: { kind: 'supplied', ...x.f.inventory('ABCDEF00-0000-4000-8000-000000000009')[0]! },
      inspectedContentDigest: record.inspectedContentDigest, artifactBytes: record.artifactBytes, configVersion: 1, configDigest: 'd'.repeat(64),
      budgets: { ...record.budgets, maxRetainedAllocations: 2, maxConcurrentPreparations: 2 },
      storage: { simulatorFreeBytes: 100000, stagingFreeBytes: 100000 }, evidenceDirectory: join(x.f.runsDir, 'other') });
    assert.equal(reserved.kind, 'reserved'); assert.equal(x.f.admission.readAllocationCapacity().heldAllocations, 2);
  };
  const x: Allocation = await appiumAllocator(t, { budgets: { maxRetainedAllocations: 1 }, beforeList: async () => { if (phase === 'before-install') reserveAnother(); } });
  x.f.setBefore(async (op, path) => { if (phase === 'before-create' && op === 'plist' && !!path?.includes('/staging/')) reserveAnother(); });
  const result = snapshot(await x.allocator.prepare(x.f.request())); assert.equal(added, true); assert.equal(result.reason, 'BUDGET_EXHAUSTED');
  assert.equal(result.outcome, 'refused');
  assert.ok(phase === 'before-create' ? !effects(x).source.includes('create') : !effects(x).natives.includes('ios-install'));
});

for (const mode of ['file', 'directory'] as const) test(`unsafe ${mode} store permissions fail closed before prerequisites and never choose another root`, async t => {
  const { f, allocator } = await appiumAllocator(t); const path = mode === 'file' ? join(f.store, 'admission.sqlite') : f.store;
  try { await fs.chmod(path, 0o444); refused(await allocator.prepare(f.request()), 'STORE_UNAVAILABLE'); assert.deepEqual(f.calls, []); }
  finally { await fs.chmod(path, mode === 'file' ? 0o600 : 0o700); }
});

test('external cancellation commits before an abort-ignoring boot settles and prevents immediate next dispatch without relying on the monitor', async t => {
  const x = await appiumAllocator(t, { nativeHeld: command => command.kind === 'ios-boot' }); const { f, w, allocator } = x;
  const preparing = allocator.prepare(f.request()); await until(() => w.native.calls.length === 1, 'boot reached');
  const record = f.admission.readAllocationForAction('allocate-one')!;
  const other = Admission.forTesting({ root: f.store, backend: 'fake', initialize: false }); const cancelled = other.cancelAllocation(record.allocationId);
  assert.equal(cancelled.kind, 'retrieved'); assert.equal(other.readAllocation(record.allocationId)?.cancellationRequested, true);
  exit(x, 'ios-boot'); const result = snapshot(await preparing); assert.notEqual(result.state, 'ready');
  assert.deepEqual([effects(x).source, effects(x).natives, w.lists.length], [['create'], ['ios-boot'], 1], 'no boot-state listing follows the cancelled boot');
});

test('unknown creator directory pointer survives a fresh process and changed cwd with zero probes and unchanged durable state', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; f.setCreateResult({ exitCode: 1, stdout: '', stderr: hostile });
  const result = snapshot(await allocator.prepare(f.request())); const stored = f.admission.readAllocation(result.allocationId)!;
  const before = [...f.calls]; await allocator.close(); const child = await isolatedChild(`
    import { Admission } from './src/device/admission.ts';
    import { ObservedAllocator } from './src/observed/allocation.ts';
    import { allocationFixture } from './tests/fixtures/observed-allocation-backend.ts';
    const [root,id] = process.argv.slice(1); const f=await allocationFixture();
    const admission=Admission.forTesting({root,backend:'fake',initialize:false});
    const allocator=new ObservedAllocator({admission,runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
    process.chdir(f.root); const before=admission.readAllocation(id); const result=await allocator.get(id.toLowerCase());
    console.log(JSON.stringify({result,unchanged:JSON.stringify(before)===JSON.stringify(admission.readAllocation(id)),calls:f.calls}));
    await allocator.close(); await f.cleanup();
  `, [f.store, result.allocationId]);
  assert.equal(child.code, 0, child.stderr); const receipt = JSON.parse(child.stdout); assert.deepEqual(receipt.result, result);
  assert.equal(receipt.unchanged, true); assert.deepEqual(receipt.calls, []); assert.deepEqual(f.calls, before);
  assert.deepEqual(f.admission.readAllocation(result.allocationId), stored); assert.ok(result.evidenceRefs.includes(stored.evidenceDirectory));
  assert.equal(new Set(result.evidenceRefs).size, result.evidenceRefs.length);
});

test('wire snapshots omit internal ownership and return copied references; unconfirmed projection cannot claim prepared outcome', async t => {
  const { f, allocator } = await appiumAllocator(t);
  const ready = snapshot(await allocator.prepare(f.request())); const stored = f.admission.readAllocation(ready.allocationId)!;
  assert.deepEqual(Object.keys(ready).sort(), ['version','allocationId','actionId','state','phase','device','reason','outcome','authority',
    'readinessEvidence','evidenceRefs','reservation','hostCreationBlocked','cancellationRequested'].sort());
  const uncertain = allocationSnapshot(stored, 'unconfirmed'); assert.equal(uncertain.outcome, null); assert.equal(uncertain.authority, 'unconfirmed');
  ready.readinessEvidence.push('caller mutation'); ready.evidenceRefs.push('caller mutation'); assert.deepEqual(f.admission.readAllocation(ready.allocationId), stored);
  assert.equal(canonicalJson({ z:[2,1], a:1 }), '{"a":1,"z":[2,1]}');
});

test('invalid lifecycle IDs and waits refuse with zero probes and no accepted allocation', async t => {
  const { f, allocator } = await appiumAllocator(t);
  for (const id of ['', 'raw-device', '/absolute/path']) { refused(await allocator.get(id), 'INVALID_REQUEST');
    refused(await allocator.cancel(id), 'INVALID_REQUEST'); refused(await allocator.retire(id), 'INVALID_REQUEST'); }
  for (const waitMs of [-1, 45001, 0.5, Infinity]) refused(await allocator.get('ABCDEF00-0000-4000-8000-000000000009', {waitMs}), 'INVALID_REQUEST');
  refused(await allocator.get('ABCDEF00-0000-4000-8000-000000000009'), 'ALLOCATION_NOT_FOUND');
  refused(await allocator.cancel('ABCDEF00-0000-4000-8000-000000000009'), 'ALLOCATION_NOT_FOUND');
  refused(await allocator.retire('ABCDEF00-0000-4000-8000-000000000009'), 'ALLOCATION_NOT_FOUND');
  refused(await allocator.prepare({ version:2 }), 'UNSUPPORTED_VERSION'); refused(await allocator.prepare({ version:1 }), 'INVALID_REQUEST');
  assert.deepEqual(f.calls, []); assert.equal(f.admission.listActiveAllocations().length, 0);
});

test('identical concurrent preflight shares one executor while conflicting digest refuses without a second probe', async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; const original = f.host.fs.lstat; let reads = 0; let begin!: () => void; let release!: () => void;
  const began = new Promise<void>(r => { begin = r; }); const pending = new Promise<void>(r => { release = r; });
  f.host.fs.lstat = (async (...args: Parameters<typeof original>) => {
    if (String(args[0]) === f.configPath && ++reads === 1) { begin(); await pending; } return original(...args);
  }) as typeof original;
  try { const first = allocator.prepare(f.request()); await began; const duplicate = allocator.prepare(f.request());
    refused(await allocator.prepare({ ...f.request(), timeoutMs: 2000 }), 'ACTION_ID_CONFLICT'); assert.equal(reads, 1);
    release(); const [one,two] = await Promise.all([first,duplicate]); assert.deepEqual(one,two); assert.equal(snapshot(one).state,'ready');
    assert.equal(effects(x).source.filter(call => call === 'create').length, 1); assert.equal(f.admission.readAllocationCapacity().heldAllocations, 1);
  } finally { release(); f.host.fs.lstat = original; }
});

for (const fail of ['before', 'after'] as const) test(`cancel ${fail}-commit store error synchronously revokes only the known locally owned preparation`, async t => {
  let boots = 0;
  const x = await appiumAllocator(t, { budgets: { maxConcurrentPreparations: 2 }, nativeHeld: command => command.kind === 'ios-boot' && ++boots === 1 });
  const { f, w, allocator } = x; const original = f.admission.cancelAllocation;
  try { const preparing = allocator.prepare(f.request()); await until(() => w.native.calls.length === 1, 'boot reached'); const record = f.admission.readAllocationForAction('allocate-one')!;
    f.admission.cancelAllocation = id => { if (fail === 'after') original.call(f.admission, id); throw new Error(hostile); };
    const cancelled = refused(await allocator.cancel(record.allocationId.toLowerCase()), 'STORE_UNAVAILABLE'); assert.equal(cancelled.acceptance, 'unknown');
    assert.ok(!JSON.stringify(cancelled).includes(hostile)); f.admission.cancelAllocation = original; const before = effects(x); exit(x, 'ios-boot');
    const result = snapshot(await preparing); assert.notEqual(result.state, 'ready'); assert.equal(result.reservation.capacityHeld, true);
    assert.deepEqual(effects(x), before); assert.deepEqual([before.source, before.natives], [['create'], ['ios-boot']]);
    const other = snapshot(await allocator.prepare(f.request('unrelated'))); assert.equal(other.state, 'ready');
    assert.equal(f.admission.readAllocation(result.allocationId)?.state, 'quarantined');
  } finally { f.admission.cancelAllocation = original; }
});

test('failed cancellation targets one owned allocation and preserves another live preparation', async t => {
  let boots = 0;
  const x = await appiumAllocator(t, { budgets: { maxConcurrentPreparations: 2 },
    nativeHeld: command => (command.kind === 'ios-boot' && ++boots === 1) || command.kind === 'ios-install' });
  const { f, w, allocator } = x; const original = f.admission.cancelAllocation; const kinds = () => w.native.calls.map(call => call.command.kind);
  try { const one = allocator.prepare(f.request('cancel-target')); await until(() => kinds().includes('ios-boot'), 'first boot reached');
    const two = allocator.prepare(f.request('other-live')); await until(() => kinds().includes('ios-install'), 'second install reached');
    const target = f.admission.readAllocationForAction('cancel-target')!; const other = f.admission.readAllocationForAction('other-live')!;
    f.admission.cancelAllocation = () => { throw new Error(hostile); }; refused(await allocator.cancel(target.allocationId), 'STORE_UNAVAILABLE'); f.admission.cancelAllocation = original;
    w.native.calls[0]!.exit({ kind: 'exited', code: 0 }); assert.equal(snapshot(await one).state, 'quarantined'); assert.deepEqual(f.admission.readAllocation(other.allocationId), other);
    exit(x, 'ios-install'); assert.equal(snapshot(await two).state, 'ready'); assert.equal(f.admission.readAllocation(other.allocationId)?.cancellationRequested, false);
  } finally { f.admission.cancelAllocation = original; }
});

test('one failure finalization budget bounds pending private diagnostics without late promotion', async t => {
  const child = await isolatedChild(`
    import assert from 'node:assert/strict';import native from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';
    import {appiumAllocator} from './tests/fixtures/appium-wire/observed-allocator.ts';
    const cleanups=[];let start,beginInstall,releaseFile;const installBegan=new Promise(r=>beginInstall=r);const pendingFile=new Promise(r=>releaseFile=r);
    const {f,w,allocator}=await appiumAllocator({after:cleanup=>cleanups.push(cleanup)},{nativeExit:command=>{if(command.kind!=='ios-install')return undefined;start??=Date.now();beginInstall();return 1;}});
    const open=native.open;native.open=async(...args)=>{if(String(args[0]).endsWith('/source-diagnostics.json'))await pendingFile;return open(...args);};syncBuiltinESMExports();
    try{const preparing=allocator.prepare(f.request());
      const reached=await Promise.race([installBegan.then(()=>true),preparing.then(()=>false)]);assert.equal(reached,true,'Known install failure milestone must be reached');
      const result=await Promise.race([preparing,new Promise(r=>setTimeout(()=>r('finalization still pending'),5500))]);
      const elapsed=Date.now()-start;assert.notEqual(result,'finalization still pending');assert.ok(elapsed<=5500,'5000ms plus explicit500ms scheduling tolerance');
      assert.equal(result.state,'quarantined');assert.equal(result.reason,'PREPARATION_UNCONFIRMED');assert.equal(result.reservation.capacityHeld,true);assert.equal(result.device.udid,'ABCDEF00-0000-4000-8000-000000000001');
      assert.equal(f.admission.inspect(result.device.udid).state,'quarantined');const stored=f.admission.readAllocation(result.allocationId);const natives=w.native.calls.map(call=>call.command.kind);
      assert.deepEqual(natives,['ios-boot','ios-install']);releaseFile();await allocator.close();
      assert.deepEqual(f.admission.readAllocation(result.allocationId),stored);assert.equal(f.admission.inspect(result.device.udid).state,'quarantined');assert.deepEqual(w.native.calls.map(call=>call.command.kind),natives);
      const diagnostic=await native.readFile(stored.evidenceDirectory+'/source-diagnostics.json','utf8');assert.ok(diagnostic.includes('preparation/installing'));assert.ok(!result.evidenceRefs.includes(stored.evidenceDirectory+'/source-diagnostics.json'));
      console.log(JSON.stringify({elapsed,state:result.state,capacityHeld:result.reservation.capacityHeld,device:result.device.udid,natives}));
    }finally{releaseFile();native.open=open;syncBuiltinESMExports();for(const cleanup of cleanups.reverse())await cleanup();}
  `,[]);
  assert.equal(child.code,0,child.stderr);t.diagnostic(child.stdout.trim());const receipt=JSON.parse(child.stdout);assert.ok(receipt.elapsed<=5500);assert.equal(receipt.state,'quarantined');
  assert.equal(receipt.capacityHeld,true);assert.deepEqual(receipt.natives,['ios-boot','ios-install']);
});

for (const kind of ['observed', 'preparation'] as const) test(`global ${kind} identity conflicts before any allocation prerequisites`, async t => {
  const { f, allocator } = await appiumAllocator(t);
  const prior = f.admission.acquire({ device: 'ABCDEF00-0000-4000-8000-000000000099', attempt: { kind, id: 'global-existing' }, digest: 'old-digest', intent: {} });
  assert.equal(prior.kind, 'acquired'); const bytes = await fs.readFile(join(f.store, 'admission.sqlite'));
  f.configure({ version: 2 }); refused(await allocator.prepare(f.request('global-existing')), 'ACTION_ID_CONFLICT');
  assert.deepEqual(f.calls, []); assert.deepEqual(await fs.readFile(join(f.store, 'admission.sqlite')), bytes);
  assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 0, reservedBytes: 0 });
});

for (const mode of ['valid', 'unavailable', 'missing', 'relative', 'wrong-identity', 'not-blocking'] as const) test(`creation guard ${mode} evidence uses only its verified retained creator`, async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x; f.setCreateResult({ exitCode: 1, stdout: '', stderr: 'private fake loss' });
  const blocker = snapshot(await allocator.prepare(f.request('creator'))); const read = f.admission.readAllocation.bind(f.admission);
  const record = read(blocker.allocationId)!; const before = effects(x); const bytes = await fs.readFile(join(f.store, 'admission.sqlite'));
  f.admission.readAllocation = id => {
    assert.equal(id, blocker.allocationId);
    if (mode === 'unavailable') throw new Error(hostile);
    if (mode === 'missing') return undefined;
    return { ...read(id)!, ...(mode === 'relative' ? { evidenceDirectory: 'relative' } : mode === 'wrong-identity' ? { allocationId: 'ABCDEF00-0000-4000-8000-000000000099' } : mode === 'not-blocking' ? { hostCreationBlocked: false } : {}) };
  };
  try {
    const result = refused(await allocator.prepare(f.request('blocked')), mode === 'valid' ? 'HOST_CREATION_UNRESOLVED' : 'STORE_UNAVAILABLE');
    assert.equal(result.blockingAllocationId, blocker.allocationId); assert.equal(result.acceptance, 'no');
    assert.equal(result.evidenceDirectory, mode === 'valid' ? record.evidenceDirectory : undefined);
    assert.equal(JSON.stringify(result).includes(hostile), false);
  } finally { f.admission.readAllocation = read; }
  assert.deepEqual(effects(x), before); assert.deepEqual(await fs.readFile(join(f.store, 'admission.sqlite')), bytes);
  assert.equal(read(blocker.allocationId)!.hostCreationBlocked, true); assert.equal(read(blocker.allocationId)!.capacityHeld, true);
});

test('required diagnostic publication failure quarantines a settled known install refusal', async t => {
  let blocked = false;
  const x: Allocation = await appiumAllocator(t, { nativeStderr: hostile, nativeExit: command => {
    if (command.kind !== 'ios-install') return undefined;
    if (!blocked) { blocked = true; mkdirSync(join(x.f.admission.readAllocationForAction('allocate-one')!.evidenceDirectory, 'source-diagnostics.json'), { mode: 0o700 }); }
    return 1;
  } });
  const { f, allocator } = x;
  const result = snapshot(await allocator.prepare(f.request())); assert.equal(result.state, 'quarantined'); assert.equal(result.outcome, 'uncertain');
  assert.equal(result.reason, 'PREPARATION_UNCONFIRMED'); assert.equal(result.authority, 'committed'); assert.equal(result.reservation.capacityHeld, true);
  assert.equal(result.device?.udid, fixtureDevice); assert.equal(JSON.stringify(result).includes(hostile), false);
  assert.ok(!result.evidenceRefs.some(ref => ref.endsWith('/source-diagnostics.json'))); assert.deepEqual(effects(x).natives, ['ios-boot', 'ios-install']);
  const stored = f.admission.readAllocation(result.allocationId); await fs.rmdir(join(stored!.evidenceDirectory, 'source-diagnostics.json'));
  const before = effects(x); await allocator.close(); assert.deepEqual(f.admission.readAllocation(result.allocationId), stored); assert.deepEqual(await allocator.get(result.allocationId), result);
  assert.deepEqual(effects(x), before); assert.equal(f.admission.inspect(result.device!.udid)?.state, 'quarantined');
});

for (const operation of ['cancel', 'retire'] as const) test(`busy ${operation} returns verified action context and explicit action cancellation direction`, async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  const ready = snapshot(await allocator.prepare(f.request())); assert.equal(allocator.consume(binding({ allocationId: ready.allocationId, actionId: ready.actionId }, f)).kind, 'consumed');
  const stored = f.admission.readAllocation(ready.allocationId); const bytes = await fs.readFile(join(f.store, 'admission.sqlite')); const before = effects(x);
  const result = refused(await allocator[operation](ready.allocationId.toLowerCase()), 'ALLOCATION_BUSY');
  assert.equal(result.actionId, ready.actionId); assert.equal((result as unknown as { state: string }).state, 'executing');
  assert.equal(result.evidenceDirectory, stored!.evidenceDirectory); assert.match(result.message, /action cancellation/); assert.match(result.message, /cancel_observed_action/); assert.match(result.message, /observed-cancel/); assert.equal(result.acceptance, 'yes');
  assert.deepEqual(f.admission.readAllocation(ready.allocationId), stored); assert.deepEqual(await fs.readFile(join(f.store, 'admission.sqlite')), bytes); assert.deepEqual(effects(x), before);
});

async function historicalFixture(f: Awaited<ReturnType<typeof allocationFixture>>, outcome: ImportedObservedAction['outcome'], excluded = false) {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex'); const device = 'ABCDEF00-0000-4000-8000-000000000099';
  const journal = join(f.root, 'historical'); const directory = join(journal, hash(device)); await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const identity = { deviceId: device, actionId: 'historical', intent: { tap: 'old' } };
  const paths = [join(directory, hash(identity.actionId) + '.intent.json'), join(directory, hash(identity.actionId) + '.result.json')];
  await fs.writeFile(paths[0]!, JSON.stringify({ ...identity, status: 'in-flight' }), { mode: 0o600 });
  await fs.writeFile(paths[1]!, JSON.stringify({ ...identity, status: 'completed', result: { status: outcome, actionAttempted: outcome === 'outcome_observed', actionAcknowledged: outcome === 'outcome_observed', observations: 2 } }), { mode: 0o600 });
  const store = join(f.root, 'imported-store'); migrateAdmissionForTesting({ version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
    additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: excluded ? [device] : [] }, { root: store, backend: 'fake', defaultRoots: { journal, leases: join(f.root, 'historical-leases') } });
  const admission = Admission.forTesting({ root: store, backend: 'fake', initialize: false });
  const allocator = new ObservedAllocator({ admission, runsDir: f.runsDir, fakeBackend: { process: f.source, runner: f.runner, window: f.window, host: f.host } });
  return { admission, allocator, store, paths, imported: admission.readImportedAction(identity.actionId)! };
}

for (const outcome of ['outcome_observed', 'already_satisfied', 'refused', 'inconclusive'] as const) test(`historical ${outcome} allocation get cancel retire is immutable read-only retrieval`, async () => {
  const f = await allocationFixture(); const h = await historicalFixture(f, outcome);
  try {
    const bytes = await fs.readFile(join(h.store, 'admission.sqlite')); const originals = await Promise.all(h.paths.map(path => fs.readFile(path)));
    const result = snapshot(await h.allocator.get(h.imported.allocationId.toLowerCase()));
    assert.equal(result.allocationId, h.imported.allocationId); assert.equal(result.actionId, h.imported.actionId); assert.equal(result.device!.udid, h.imported.device);
    assert.equal((result as unknown as { readOnly: boolean }).readOnly, true); assert.equal((result as unknown as { historicalOutcome: string }).historicalOutcome, outcome);
    assert.equal(result.phase, 'terminal'); assert.equal(result.state, outcome === 'inconclusive' ? 'quarantined' : 'retained');
    assert.equal(result.outcome, outcome === 'inconclusive' ? 'uncertain' : outcome === 'refused' ? 'refused' : 'action_completed'); assert.equal(result.reason, null);
    assert.equal(result.authority, 'committed'); assert.equal(result.cancellationRequested, false); assert.equal(result.hostCreationBlocked, false);
    assert.deepEqual(result.reservation, { bytes: 0, capacityHeld: false }); assert.deepEqual(result.readinessEvidence, []);
    assert.deepEqual(result.evidenceRefs, h.imported.records.map(record => record.path));
    assert.deepEqual(await h.allocator.cancel(result.allocationId), result); assert.deepEqual(await h.allocator.retire(result.allocationId), result);
    assert.deepEqual(await h.allocator.get(result.allocationId, { waitMs: 1 }), result); assert.deepEqual(f.calls, []);
    refused(await h.allocator.get(result.allocationId, { waitMs: 1, signal: AbortSignal.abort() }), 'WAIT_CANCELLED');
    assert.deepEqual(await fs.readFile(join(h.store, 'admission.sqlite')), bytes); assert.deepEqual(await Promise.all(h.paths.map(path => fs.readFile(path))), originals);
    f.configure({ version: 2 }); refused(await h.allocator.prepare(f.request('historical')), 'ACTION_ID_CONFLICT'); assert.deepEqual(f.calls, []);
    const consumed = h.allocator.consume(binding({ allocationId: result.allocationId, actionId: result.actionId }, f)); assert.equal(consumed.kind, 'refused');
    assert.deepEqual(await fs.readFile(join(h.store, 'admission.sqlite')), bytes);
  } finally { await h.allocator.close(); await f.cleanup(); }
});

test('historical exclusion retains current quarantine independently of zero new allocation capacity', async () => {
  const f = await allocationFixture(); const h = await historicalFixture(f, 'outcome_observed', true);
  try {
    assert.equal(h.imported.outcome, 'outcome_observed'); const bytes = await fs.readFile(join(h.store, 'admission.sqlite'));
    const result = snapshot(await h.allocator.get(h.imported.allocationId)); assert.equal(result.state, 'quarantined'); assert.equal(result.outcome, 'uncertain');
    assert.equal(result.readOnly, true); assert.equal(result.historicalOutcome, 'outcome_observed'); assert.equal(result.reason, null);
    assert.deepEqual(result.reservation, { bytes: 0, capacityHeld: false }); assert.deepEqual(h.admission.readAllocationCapacity(), { heldAllocations: 0, reservedBytes: 0 });
    assert.deepEqual(await h.allocator.cancel(result.allocationId), result); assert.deepEqual(await h.allocator.retire(result.allocationId), result);
    assert.deepEqual(await fs.readFile(join(h.store, 'admission.sqlite')), bytes);
    const denied = h.admission.acquire({ device: h.imported.device, attempt: { kind: 'legacy', id: 'blocked-legacy' }, digest: 'later', intent: {} });
    assert.equal(denied.kind, 'refused'); if (denied.kind !== 'refused') assert.fail(); assert.equal(denied.reason, 'DEVICE_QUARANTINED');
    assert.deepEqual(f.calls, []); assert.deepEqual(await fs.readFile(join(h.store, 'admission.sqlite')), bytes);
  } finally { await h.allocator.close(); await f.cleanup(); }
});

for (const current of ['active', 'quarantined'] as const) test(`historical original success preserves outcome with current ${current} disposition`, async () => {
  const f = await allocationFixture(); const h = await historicalFixture(f, 'outcome_observed');
  try {
    const acquired = h.admission.acquire({ device: h.imported.device, attempt: { kind: 'legacy', id: 'later' }, digest: 'later', intent: {} });
    assert.equal(acquired.kind, 'acquired'); if (acquired.kind !== 'acquired') assert.fail();
    if (current === 'quarantined') assert.equal(acquired.claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] }).authority, 'committed');
    const bytes = await fs.readFile(join(h.store, 'admission.sqlite')); const result = snapshot(await h.allocator.get(h.imported.allocationId));
    assert.equal((result as unknown as { historicalOutcome: string }).historicalOutcome, 'outcome_observed');
    assert.equal(result.state, current === 'quarantined' ? 'quarantined' : 'retained'); assert.equal(result.outcome, current === 'quarantined' ? 'uncertain' : 'action_completed');
    assert.equal(result.reason, null); assert.deepEqual(await h.allocator.cancel(result.allocationId), result); assert.deepEqual(await h.allocator.retire(result.allocationId), result);
    assert.deepEqual(await fs.readFile(join(h.store, 'admission.sqlite')), bytes); assert.deepEqual(f.calls, []);
  } finally { await h.allocator.close(); await f.cleanup(); }
});

test('historical allocation retrieval survives a fresh process and changed cwd without effects or mutations', async () => {
  const f = await allocationFixture(); const h = await historicalFixture(f, 'already_satisfied');
  try {
    const result = snapshot(await h.allocator.get(h.imported.allocationId)); await h.allocator.close(); const bytes = await fs.readFile(join(h.store, 'admission.sqlite'));
    const child = await isolatedChild(`
      import assert from 'node:assert/strict';import {ObservedAllocator} from ${JSON.stringify(new URL('../src/observed/allocation.ts', import.meta.url).href)};
      import {Admission} from ${JSON.stringify(new URL('../src/device/admission.ts', import.meta.url).href)};
      import {allocationFixture} from ${JSON.stringify(new URL('./fixtures/observed-allocation-backend.ts', import.meta.url).href)};
      const [root,id,cwd]=process.argv.slice(1);const f=await allocationFixture();process.chdir(cwd);const a=new ObservedAllocator({admission:Admission.forTesting({root,backend:'fake',initialize:false}),runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
      try{const result=await a.get(id);assert.deepEqual(await a.cancel(id),result);assert.deepEqual(await a.retire(id),result);assert.deepEqual(f.calls,[]);console.log(JSON.stringify(result));}finally{await a.close();await f.cleanup();}
    `, [h.store, h.imported.allocationId, f.root]);
    assert.equal(child.code, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), result); assert.deepEqual(await fs.readFile(join(h.store, 'admission.sqlite')), bytes); assert.deepEqual(f.calls, []);
  } finally { await h.allocator.close(); await f.cleanup(); }
});

for (const mode of ['unavailable', 'missing', 'wrong-identity', 'missing-disposition', 'relative-evidence', 'invalid-device', 'wrong-disposition-device', 'invalid-disposition', 'not-read-only', 'invalid-outcome', 'empty-evidence'] as const) test(`historical ${mode} consistent disposition refuses without invented committed authority`, async () => {
  const f = await allocationFixture(); const h = await historicalFixture(f, 'outcome_observed'); const read = h.admission.readAction.bind(h.admission);
  h.admission.readAction = id => {
    if (mode === 'unavailable') throw new Error(hostile); if (mode === 'missing') return undefined;
    const view = read(id)!; if (view.kind !== 'imported') assert.fail();
    if (mode === 'missing-disposition') return { ...view, admission: null };
    if (mode === 'wrong-disposition-device') return { ...view, admission: { ...view.admission!, device: 'ABCDEF00-0000-4000-8000-000000000088' } };
    if (mode === 'invalid-disposition') return { ...view, admission: { ...view.admission!, state: 'invalid' as never } };
    return { ...view, action: { ...view.action, ...(mode === 'wrong-identity' ? { allocationId: 'ABCDEF00-0000-4000-8000-000000000099' }
      : mode === 'relative-evidence' ? { records: [{ ...view.action.records[0]!, path: 'relative' }] }
      : mode === 'invalid-device' ? { device: 'invalid' } : mode === 'not-read-only' ? { readOnly: false as never }
      : mode === 'invalid-outcome' ? { outcome: 'invalid' as never } : { records: [] }) } };
  };
  try {
    const bytes = await fs.readFile(join(h.store, 'admission.sqlite'));
    for (const operation of ['get', 'cancel', 'retire'] as const) { const error = refused(await h.allocator[operation](h.imported.allocationId), 'STORE_UNAVAILABLE'); assert.equal(error.acceptance, 'unknown'); assert.equal(JSON.stringify(error).includes(hostile), false); }
    assert.deepEqual(f.calls, []); assert.deepEqual(await fs.readFile(join(h.store, 'admission.sqlite')), bytes);
  } finally { h.admission.readAction = read; await h.allocator.close(); await f.cleanup(); }
});

for (const mode of ['unavailable', 'missing', 'wrong-identity', 'wrong-state', 'preparing-state', 'invalid-action', 'relative-evidence'] as const) test(`busy ${mode} context cannot fabricate an action cancellation target`, async t => {
  const x = await appiumAllocator(t); const { f, allocator } = x;
  const ready = snapshot(await allocator.prepare(f.request())); assert.equal(allocator.consume(binding({ allocationId: ready.allocationId, actionId: ready.actionId }, f)).kind, 'consumed');
  const read = f.admission.readAllocation.bind(f.admission); const bytes = await fs.readFile(join(f.store, 'admission.sqlite')); const before = effects(x); let reads = 0;
  f.admission.readAllocation = id => {
    if (++reads !== 2) return read(id);
    if (mode === 'unavailable') throw new Error(hostile); if (mode === 'missing') return undefined;
    return { ...read(id)!, ...(mode === 'wrong-identity' ? { allocationId: 'ABCDEF00-0000-4000-8000-000000000099' }
      : mode === 'wrong-state' ? { state: 'retained' as const } : mode === 'preparing-state' ? { state: 'preparing' as const } : mode === 'invalid-action' ? { actionId: hostile } : { evidenceDirectory: 'relative' }) };
  };
  try { const result = refused(await allocator.cancel(ready.allocationId), 'STORE_UNAVAILABLE'); assert.equal(result.acceptance, 'unknown'); assert.equal(result.actionId, undefined); assert.equal(JSON.stringify(result).includes(hostile), false); }
  finally { f.admission.readAllocation = read; }
  assert.deepEqual(await fs.readFile(join(f.store, 'admission.sqlite')), bytes); assert.deepEqual(effects(x), before); assert.equal(read(ready.allocationId)!.state, 'executing');
});

for (const mode of ['valid', 'unavailable', 'missing', 'wrong-identity', 'wrong-state', 'invalid-action', 'relative-evidence'] as const) test(`preparing retirement ${mode} returns only verified preparation context and preserves its job`, async t => {
  const x = await appiumAllocator(t, { nativeHeld: command => command.kind === 'ios-boot' }); const { f, w, allocator } = x;
  const preparing = allocator.prepare(f.request()); const read = f.admission.readAllocation.bind(f.admission);
  try {
    await Promise.race([until(() => w.native.calls.length === 1, 'boot reached'), preparing.then(result => { assert.fail(`Preparation finished before pending boot: ${JSON.stringify(result)}`); })]);
    const record = f.admission.readAllocationForAction('allocate-one')!; assert.equal(record.state, 'preparing');
    const bytes = await fs.readFile(join(f.store, 'admission.sqlite')); const before = effects(x); let reads = 0;
    f.admission.readAllocation = id => {
      if (++reads !== 2 || mode === 'valid') return read(id);
      if (mode === 'unavailable') throw new Error(hostile); if (mode === 'missing') return undefined;
      return { ...read(id)!, ...(mode === 'wrong-identity' ? { allocationId: 'ABCDEF00-0000-4000-8000-000000000099' }
        : mode === 'wrong-state' ? { state: 'retained' as const } : mode === 'invalid-action' ? { actionId: hostile } : { evidenceDirectory: 'relative' }) };
    };
    try {
      const result = refused(await allocator.retire(record.allocationId.toLowerCase()), mode === 'valid' ? 'ALLOCATION_BUSY' : 'STORE_UNAVAILABLE');
      assert.equal(result.allocationId, record.allocationId); assert.equal(result.acceptance, mode === 'valid' ? 'yes' : 'unknown');
      assert.equal(result.actionId, mode === 'valid' ? record.actionId : undefined); assert.equal(result.state, mode === 'valid' ? 'preparing' : undefined);
      assert.equal(result.evidenceDirectory, mode === 'valid' ? record.evidenceDirectory : undefined); assert.equal(JSON.stringify(result).includes(hostile), false);
      if (mode === 'valid') {
        assert.match(result.message, /preparation is active/); assert.match(result.message, /allocation cancellation/);
        assert.match(result.message, /cancel_observed_allocation/); assert.match(result.message, /observed-allocation-cancel/);
        assert.doesNotMatch(result.message, /executing|action cancellation|cancel_observed_action/);
      }
    } finally { f.admission.readAllocation = read; }
    assert.deepEqual(read(record.allocationId), record); assert.equal(read(record.allocationId)!.cancellationRequested, false);
    assert.deepEqual(await fs.readFile(join(f.store, 'admission.sqlite')), bytes); assert.deepEqual(effects(x), before);
    exit(x, 'ios-boot'); const ready = snapshot(await preparing); assert.equal(ready.state, 'ready'); assert.equal(ready.outcome, 'prepared'); assert.equal(ready.cancellationRequested, false);
    assert.deepEqual([effects(x).source, effects(x).natives], [['create'], prepared]);
  } finally { exit(x, 'ios-boot'); f.admission.readAllocation = read; await preparing.catch(() => {}); }
});
