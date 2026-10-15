import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { mkdir, symlink, writeFile, mkdtemp, realpath, readFile, readdir, lstat, chmod, rm, cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Admission } from '../src/device/admission.js';
import { parseObservedAction, observedActionDigest } from '../src/observed/schema.js';
import { allocation, snapshot, actionSnapshot, operationError, errorCode, replyKind, publicAuthority, publicPolicy } from './fixtures/public-contention.js';
import { hostFixture, actionRequest } from './fixtures/observed-host/harness.js';

for (const transport of ['cli', 'mcp'] as const) {
  test(`H03.01 ${transport} concurrent preparation has complete closed authority`, { timeout: 20000 }, async t => {
    const f = await hostFixture(t); const request = f.request('one'); const path = await f.requestFile(request);
    const cwd = join(f.root, 'unrelated'); await mkdir(cwd); const alias = join(f.root, 'alias'); await symlink(cwd, alias);
    const actors = await Promise.all([cwd, alias].map(async directory => ({ directory, owner: transport === 'mcp' ? await f.mcp({ cwd: directory, projectDir: directory }) : undefined })));
    const observations = await Promise.all(actors.map(async ({ directory, owner }) => ({ request, reply: (owner ? await owner.call('prepare_observed_allocation', request) : await f.cli('observed-allocate', path, { cwd: directory, projectDir: directory })).reply })));
    publicPolicy({ observations: observations.map(o => ({ ...o, operation: transport === 'mcp' ? 'prepare_observed_allocation' : 'observed-allocate' })) });
    const { events } = await f.closeOwners();
    publicAuthority({ observations: f.observations, admission: f.admission(), requests: observations.map(o => o.request), events });
  });
  test(`H03.01 ${transport} concurrent action has complete closed authority`, { timeout: 20000 }, async t => {
    const f = await hostFixture(t); const prepared = await f.prepare(); const baseline = f.admission().readAllocation(prepared.allocationId)!;
    const request = actionRequest(prepared.allocationId); const path = await f.requestFile(request, 'action.json');
    const actors = await Promise.all([0,1].map(async () => ({ owner: transport === 'mcp' ? await f.mcp() : undefined })));
    const observations = await Promise.all(actors.map(async ({ owner }) => ({ request, reply: (owner ? await owner.call('start_observed_action', request) : await f.cli('observed-action', path)).reply })));
    publicPolicy({ observations: observations.map(o => ({ ...o, operation: transport === 'mcp' ? 'start_observed_action' : 'observed-action' })) });
    for (const { owner } of actors) if (owner) await owner.call('get_observed_action', { actionId: 'one', waitMs: 5000 });
    const { events } = await f.closeOwners();
    publicAuthority({ observations: f.observations, admission: f.admission(), requests: [f.request('one')], baseline, action: request, events });
  });
  test(`H03.01 ${transport} ordered aliases duplicate useful preparation and action without replay`, { timeout: 20000 }, async t => {
    const f = await hostFixture(t); const request = f.request('one'); const path = await f.requestFile(request);
    const cwd = join(f.root, 'unrelated'); await mkdir(cwd); const alias = join(f.root, 'alias'); await symlink(cwd, alias);
    const first = transport === 'mcp' ? await f.mcp({ cwd, projectDir: cwd }) : undefined;
    const second = transport === 'mcp' ? await f.mcp({ cwd: alias, projectDir: alias }) : undefined;
    const prepared = allocation((first ? await first.call('prepare_observed_allocation', request) : await f.cli('observed-allocate', path, { cwd, projectDir: cwd })).reply); assert.equal(prepared.state, 'ready'); assert.equal(prepared.outcome, 'prepared');
    const duplicate = allocation((second ? await second.call('prepare_observed_allocation', request) : await f.cli('observed-allocate', path, { cwd: alias, projectDir: alias })).reply); assert.deepEqual(duplicate, prepared);
    for (const operation of ['create','boot','install','launch-app']) assert.equal(f.calls().filter(op => op === operation).length, 1, operation);
    const baseline = f.admission().readAllocation(prepared.allocationId)!; const input = actionRequest(prepared.allocationId.toLowerCase()); const actionPath = await f.requestFile(input, 'action.json');
    const started = actionSnapshot((first ? await first.call('start_observed_action', input) : await f.cli('observed-action', actionPath, { cwd })).reply); assert.equal(started.disposition, 'started');
    const terminal = first ? actionSnapshot((await first.call('get_observed_action', { actionId: 'one', waitMs: 5000 })).reply) : started; assert.equal(terminal.outcome, 'outcome_observed'); assert.equal(terminal.authority, 'committed');
    const repeated = actionSnapshot((second ? await second.call('start_observed_action', input) : await f.cli('observed-action', actionPath, { cwd: alias })).reply); assert.equal(repeated.disposition, 'retrieved'); assert.equal(repeated.outcome, 'outcome_observed');
    assert.equal(f.calls().filter(op => op === 'touch').length, 1); assert.equal(f.calls().filter(op => op === 'snapshot-ui').length - 1, 2);
    const calls = f.calls(); const bytes = await f.database(); const binding = f.admission().readAllocation(prepared.allocationId); assert.equal(binding?.outcome, 'action_completed', 'Committed useful outcome before close'); assert.equal(f.admission().readAction('one')?.kind, 'allocation');
    const changed = { ...input, timeoutMs: 6000 }; const conflict = first ? await first.call('start_observed_action', changed) : await f.cli('observed-action', await f.requestFile(changed, 'conflict.json')); assert.equal(errorCode(conflict.reply), 'ACTION_ID_CONFLICT');
    const disabled = await f.mcp({ enabled: '0', cwd: alias }); assert.equal(actionSnapshot((await disabled.call('get_observed_action', { actionId: 'one' })).reply).outcome, 'outcome_observed');
    assert.deepEqual(f.calls(), calls); assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.admission().readAllocation(prepared.allocationId), binding);
    const { events } = await f.closeOwners(); publicAuthority({ observations: f.observations, admission: f.admission(), requests: [request], baseline, action: input, events, requireOutcome: 'action_completed' });
  });
}

test('H03.01 MCP lost consume acknowledgement retains owner and duplicates never replay input', async t => {
  const f = await hostFixture(t); const prepared = await f.prepare(); const baseline = f.admission().readAllocation(prepared.allocationId)!; const request = actionRequest(prepared.allocationId);
  const owner = await f.mcp({ fault: 'afterCommit:consumeAllocation' }); const first = await owner.call('start_observed_action', request);
  assert.equal(actionSnapshot(first.reply).outcome, null); const committed = f.admission().readAction('one');
  const duplicate = await f.mcp(); const retrieved = await duplicate.call('start_observed_action', request); assert.equal(actionSnapshot(retrieved.reply).disposition, 'retrieved'); assert.equal(actionSnapshot(retrieved.reply).outcome, null);
  const { events } = await f.closeOwners(); assert.deepEqual(f.admission().readAction('one'), committed); assert.equal(f.calls().filter(op => op === 'touch').length, 0);
  publicAuthority({ observations: f.observations, admission: f.admission(), requests: [f.request('one')], baseline, action: request, events });
});

for (const point of ['beforeCommit','afterCommit'] as const) test(`H03.01 MCP ${point} reserve uncertainty resolves every requested identity without replay`, async t => {
  const f = await hostFixture(t); const request = f.request('one'); const owner = await f.mcp({ fault: point + ':reserveAllocation' });
  const result = await owner.call('prepare_observed_allocation', request); publicPolicy({ observations: [{ operation: 'prepare_observed_allocation', request, reply: result.reply }] });
  const { events } = await f.closeOwners(); const record = publicAuthority({ observations: f.observations, admission: f.admission(), requests: [request], events });
  assert.equal(record === undefined, point === 'beforeCommit'); assert.equal(f.calls().filter(op => op === 'create').length, 0);
});

test('H03.02 normal public allocation exit leaves durable parked ownership for a different transport', async t => {
  const f = await hostFixture(t); const allocation = await f.prepare();
  const record = f.admission().readAllocation(allocation.allocationId)!; assert.equal(record.owner.process.pid, 0); assert.equal(record.owner.process.incarnation, 'parked');
  const calls = f.calls(); const server = await f.mcp();
  await server.call('start_observed_action', actionRequest(allocation.allocationId.toLowerCase()));
  const terminal = await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 });
  assert.equal(snapshot(terminal.reply).outcome, 'outcome_observed'); assert.equal(actionSnapshot(terminal.reply).device.udid, record.device);
  const added = f.calls().slice(calls.length); assert.equal(added.filter(op => op === 'touch').length, 1);
  assert.ok(added.every(op => !['create', 'boot', 'install', 'launch-app', 'window'].includes(op))); await server.close();
});

test('H03.03 root aliases fail closed and cannot establish an alternate authority domain', async t => {
  const f = await hostFixture(t); await f.prepare(); const bytes = await f.database(); const alias = join(f.root, 'store-link'); await symlink(f.store, alias);
  for (const root of [alias, f.store + '/.', f.store + '/../store']) assert.throws(() => Admission.forTesting({ root, backend: 'fake', initialize: false }), { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(await f.database(), bytes);
});

for (const transport of ['cli', 'mcp'] as const) {
  for (const [gate, authorizedAfterBarrier] of [
    ['afterCommit:reserveAllocation:1', []],
    ['afterCommit:stageAllocation:1', []],
    ['afterCommit:startCreation:1', ['create']],
    ['afterCommit:recordCreation:1', []],
    ['afterCommit:attach:1', []],
    ['backend:boot:1', []],
    ['backend:list:1', []],
    ['backend:install:1', []],
    ['backend:launch-app:1', []],
    ['backend:list:2', []],
    ['backend:snapshot-ui:1', []],
    ['backend:screenshot:1', []],
  ] as const) test(`H05.01 ${transport} durable external preparation cancel at ${gate} fences successors`, { timeout: 15000 }, async t => {
    const f = await hostFixture(t); const request = f.request('one');
    const server = transport === 'mcp' ? await f.mcp({ gate }) : undefined;
    const owner = server ?? f.spawnOwner('cli', 'observed-allocate', await f.requestFile(request), { gate });
    const result = server ? server.begin('prepare_observed_allocation', request) : undefined;
    await f.milestone(gate, owner.child.pid); const record = f.admission().readAllocationForAction('one')!;
    const before = f.calls(); const bytes = await f.database();
    const notReady = await f.cli('observed-action', await f.requestFile(actionRequest(record.allocationId), 'action.json'));
    assert.equal(errorCode(notReady.reply), 'ALLOCATION_NOT_READY'); assert.equal(f.admission().readAllocation(record.allocationId)!.actionDigest, null); assert.deepEqual(await f.database(), bytes);
    const cancel = await f.cli('observed-allocation-cancel', record.allocationId, { enabled: '0' }); assert.equal(snapshot(cancel.reply).cancellationRequested, true);
    await f.release();
    const final = server ? (await result!).reply : JSON.parse((await owner.exited).stdout);
    assert.equal(final.cancellationRequested, true); assert.notEqual(final.state, 'ready'); assert.notEqual(final.outcome, 'prepared');
    assert.equal(final.reservation.capacityHeld, !['afterCommit:reserveAllocation:1', 'afterCommit:stageAllocation:1'].includes(gate));
    assert.deepEqual(f.calls(), [...before, ...authorizedAfterBarrier], 'Only creation already durably authorized before cancellation may dispatch');
    for (const op of ['create', 'boot', 'install', 'launch-app']) assert.ok(f.calls().filter(value => value === op).length <= 1, op);
    assert.equal(f.calls().filter(op => op === 'touch').length, 0); if (server) await server.close();
    assert.deepEqual(f.calls(), [...before, ...authorizedAfterBarrier], 'Owner exit cannot add list/capture/presentation/cleanup/successor calls');
  });

  for (const [gate, touches] of [['afterCommit:consumeAllocation:1', 0], ['durable:tap-authorized:1', 1], ['backend:touch:1', 1], ['evidence:provisional:1', 1]] as const) {
    test(`H05.02 ${transport} durable external action cancel at ${gate} permits at most authorized input`, { timeout: 15000 }, async t => {
      const f = await hostFixture(t); const allocation = await f.prepare(); const request = actionRequest(allocation.allocationId);
      const server = transport === 'mcp' ? await f.mcp({ gate }) : undefined;
      const owner = server ?? f.spawnOwner('cli', 'observed-action', await f.requestFile(request), { gate });
      if (server) void server.begin('start_observed_action', request).catch(() => {});
      await f.milestone(gate, owner.child.pid);
      const before = f.calls();
      const busy = await f.cli('observed-retire', allocation.allocationId); assert.equal(errorCode(busy.reply), 'ALLOCATION_BUSY');
      const cancel = await f.cli('observed-cancel', 'one', { enabled: '0' }); assert.equal(snapshot(cancel.reply).cancellationRequested, true);
      await f.release();
      const final = server ? (await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 })).reply : JSON.parse((await owner.exited).stdout);
      assert.equal(final.outcome, 'inconclusive'); assert.equal(final.admission, 'quarantined'); assert.equal(final.cancellationRequested, true);
      assert.equal(f.calls().filter(op => op === 'touch').length, touches);
      const expected = [...before, ...(gate === 'durable:tap-authorized:1' ? ['touch'] : [])];
      assert.deepEqual(f.calls(), expected, 'Only the tap authorized before cancellation may issue after this barrier');
      const calls = f.calls(); const duplicate = await f.cli('observed-action', await f.requestFile(request, 'duplicate.json'));
      assert.equal(snapshot(duplicate.reply).outcome, 'inconclusive'); assert.equal(actionSnapshot(duplicate.reply).disposition, 'retrieved'); assert.deepEqual(f.calls(), calls);
      if (server) await server.close();
      assert.deepEqual(f.calls(), expected, 'Duplicate retrieval and owner exit cannot authorize any additional backend call');
    });
  }
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  test(`H05.03 public ${signal} is bounded by 5000ms and production exits ${code}`, { timeout: 15000 }, async t => {
    const f = await hostFixture(t); const allocation = await f.prepare();
    const path = await f.requestFile({ ...actionRequest(allocation.allocationId), timeoutMs: 60000 });
    const owner = f.spawnOwner('cli', 'observed-action', path, { mode: 'pending-resource' });
    await f.milestone('backend:snapshot-ui:1', owner.child.pid);
    // resource-live is the producer's durable backend trace; wait until it exists.
    const end = Date.now() + 5000; while (!f.calls().includes('resource-live')) { assert.ok(Date.now() < end); await new Promise(done => setTimeout(done, 10)); }
    const before = f.calls();
    const started = Date.now(); owner.child.kill(signal); const result = await owner.exited;
    assert.equal(result.code, code); assert.equal(result.signal, null); assert.ok(Date.now() - started < 6500);
    const read = await f.cli('observed-report', 'one'); assert.equal(snapshot(read.reply).cancellationRequested, true); assert.notEqual(actionSnapshot(read.reply).actionAttempted, true); assert.notEqual(actionSnapshot(read.reply).actionAcknowledged, true);
    assert.equal(f.calls().filter(op => op === 'touch').length, 0);
    assert.deepEqual(f.calls(), before, 'Signal finalization and fresh reads cannot issue further backend/presentation/cleanup calls');
  });
}

test('H05.05 concurrent genuine start/retire has complete closed authority', { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const baseline = f.admission().readAllocation(allocation.allocationId)!; const request = actionRequest(allocation.allocationId); const path = await f.requestFile(request);
  const [start, retire] = await Promise.all([f.cli('observed-action', path), f.cli('observed-retire', allocation.allocationId)]);
  publicPolicy({ observations: [{ operation: 'observed-action', request, reply: start.reply }] });
  publicPolicy({ observations: [{ operation: 'observed-retire', request, reply: retire.reply }] });
  const { events } = await f.closeOwners(); publicAuthority({ observations: f.observations, admission: f.admission(), requests: [f.request('one')], baseline, action: request, retire: true, events });
});
for (const order of ['retire-first','action-first'] as const) test(`H05.05 ordered ${order} preserves useful business outcomes`, async t => {
  const f = await hostFixture(t); const prepared = await f.prepare(); const baseline = f.admission().readAllocation(prepared.allocationId)!; const request = actionRequest(prepared.allocationId); const path = await f.requestFile(request);
  if (order === 'retire-first') { const retired = allocation((await f.cli('observed-retire', prepared.allocationId)).reply); assert.equal(retired.outcome, 'retired_unused'); assert.equal(retired.reason, 'RETAINED_UNUSED'); assert.equal(retired.cancellationRequested, false); assert.equal(errorCode((await f.cli('observed-action', path)).reply), 'ALLOCATION_NOT_READY'); assert.equal(f.calls().filter(op => op === 'touch').length, 0); }
  else { assert.equal(actionSnapshot((await f.cli('observed-action', path)).reply).outcome, 'outcome_observed'); assert.equal(allocation((await f.cli('observed-retire', prepared.allocationId)).reply).outcome, 'action_completed'); assert.equal(f.calls().filter(op => op === 'touch').length, 1); }
  const { events } = await f.closeOwners(); publicAuthority({ observations: f.observations, admission: f.admission(), requests: [f.request('one')], baseline, action: request, retire: true, events, requireOutcome: order === 'retire-first' ? 'retired_unused' : 'action_completed' });
});

test('H05.11 concurrent MCP start/retire has one durable winner and no input replay', { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const server = await f.mcp();
  const [start, retire] = await Promise.all([server.call('start_observed_action', actionRequest(allocation.allocationId)), server.call('retire_observed_allocation', { allocationId: allocation.allocationId })]);
  const record = f.admission().readAllocation(allocation.allocationId)!;
  if (record.actionDigest === null) { assert.equal(errorCode(start.reply), 'ALLOCATION_NOT_READY'); assert.equal(snapshot(retire.reply).outcome, 'retired_unused'); assert.equal(f.calls().filter(op => op === 'touch').length, 0); }
  else { const terminal = await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 }); assert.equal(snapshot(terminal.reply).outcome, 'outcome_observed'); assert.ok(errorCode(retire.reply) === 'ALLOCATION_BUSY' || snapshot(retire.reply).outcome === 'action_completed'); assert.equal(f.calls().filter(op => op === 'touch').length, 1); }
  assert.equal(record.capacityHeld, true); await server.close();
});

for (const phase of ['configuration', 'host-proof', 'artifact-inspection', 'artifact-staging'] as const) test(`H05.12 genuine CLI SIGTERM during ${phase} fences ignored-abort preparation`, { timeout: 15000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'jev-early-cli-')));
  const env: NodeJS.ProcessEnv = { ...process.env }; delete env.TYPESAFE_API_KEY;
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./fixtures/observed-host/early-cli.ts', import.meta.url)), root, phase], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(done => child.once('close', (code, signal) => done({ code, signal })));
  let backendRoot: string | undefined;
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); const finalExit = await exited;
    if (process.env.HOST_EVIDENCE_DIR) { const archive = join(process.env.HOST_EVIDENCE_DIR, 'early-' + phase); await mkdir(archive, { recursive: true, mode: 0o700 }); await writeFile(join(root, 'public-result.json'), JSON.stringify({ pid: child.pid, code: finalExit.code, signal: finalExit.signal, stdout, stderr }), { mode: 0o600 }); await cp(root, join(archive, 'public'), { recursive: true }); if (backendRoot) await cp(backendRoot, join(archive, 'backend'), { recursive: true }); }
    async function writable(path: string): Promise<void> { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) return; await chmod(path, 0o700); for (const entry of await readdir(path)) await writable(join(path, entry)); }
    if (backendRoot) { await writable(backendRoot); await rm(backendRoot, { recursive: true, force: true }); } await rm(root, { recursive: true, force: true });
  });
  let milestone: string | undefined;
  const end = Date.now() + 5000;
  while (true) {
    try { milestone = await readFile(join(root, 'milestone.jsonl'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (milestone?.endsWith('\n')) break;
    assert.ok(Date.now() < end, 'Early CLI fixture did not reach phase: ' + stderr); await new Promise(done => setTimeout(done, 10));
  }
  assert.deepEqual(JSON.parse(milestone.trim()), { phase, pid: child.pid });
  const backendTrace = async () => {
    const raw = await readFile(join(root, 'backend-attempts.jsonl'), 'utf8');
    assert.ok(!raw || raw.endsWith('\n'), 'Exit/barrier trace must contain only complete records');
    const events = raw ? raw.trim().split('\n').map(line => JSON.parse(line)) : [];
    for (const event of events) assert.equal(event.pid, child.pid);
    return events;
  };
  const before = (await backendTrace()).filter(event => event.kind === 'attempt');
  if (phase === 'configuration') assert.equal(before.length, 0); else assert.ok(before.length > 0);
  assert.ok(before.every(event => event.backend === 'source' && event.operation === 'plist' && event.executable === '/usr/bin/plutil'));
  const context = JSON.parse(await readFile(join(root, 'context.json'), 'utf8')); backendRoot = context.backendRoot;
  const started = Date.now(); child.kill('SIGTERM'); const result = await exited; assert.equal(result.code, 143); assert.equal(result.signal, null); assert.ok(Date.now() - started < 6500);
  assert.equal(stdout.trim().split('\n').length, 1); assert.notEqual(JSON.parse(stdout).outcome, 'prepared');
  const admission = Admission.forTesting({ root: context.store, backend: 'fake', initialize: false }); const record = admission.readAllocationForAction('allocate-one');
  if (phase === 'artifact-staging') { assert.ok(record); assert.equal(record.cancellationRequested, true); assert.equal(record.capacityHeld, false); } else assert.equal(record, undefined);
  const events = await backendTrace(); const attempts = events.filter(event => event.kind === 'attempt');
  assert.deepEqual(attempts, before, 'No source, runner or window attempt may follow the held phase or signal');
  assert.deepEqual(events.filter(event => event.kind === 'process-exit'), [{ pid: child.pid, kind: 'process-exit', exitCode: 143 }]);
  assert.equal(events.at(-1)?.kind, 'process-exit'); assert.equal(events.filter(event => event.kind === 'error').length, 0);
});

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) test(`H05.06 ${signal} racing durable ready commit preserves parked allocation`, { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const gate = 'afterCommit:parkAllocation:1';
  const owner = f.spawnOwner('cli', 'observed-allocate', await f.requestFile(f.request('one')), { gate });
  await f.milestone(gate, owner.child.pid); const bytes = await f.database(); const before = f.calls(); owner.child.kill(signal); await f.release();
  const result = await owner.exited;
  // If ordinary completion wins before the signal event is delivered, zero is
  // valid. Signal handling, when it wins, must use the production 130/143 exit.
  assert.ok(result.code === 0 || result.code === code); assert.equal(result.signal, null);
  const allocation = f.admission().readAllocationForAction('one')!; assert.equal(allocation.state, 'ready'); assert.equal(allocation.cancellationRequested, false);
  assert.equal(allocation.owner.process.pid, 0); assert.deepEqual(await f.database(), bytes); assert.equal(f.calls().filter(op => op === 'touch').length, 0);
  assert.deepEqual(f.calls(), before, 'Parked ready ownership survives signal/exit with no further backend/presentation/cleanup calls');
});

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) test(`H05.07 public read-wait ${signal} leaves the active action untouched`, { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const gate = 'backend:snapshot-ui:1';
  const owner = f.spawnOwner('cli', 'observed-action', await f.requestFile(actionRequest(allocation.allocationId)), { gate });
  await f.milestone(gate, owner.child.pid); const initial = (await f.cli('observed-report', 'one')).reply; const bytes = await f.database(); const calls = f.calls();
  const waiting = f.spawnOwner('cli', 'observed-report', 'one', { waitMs: 45000 }); await f.milestone('public:inspect:1', waiting.child.pid);
  waiting.child.kill(signal); const stopped = await waiting.exited; assert.equal(stopped.code, code); assert.equal(JSON.parse(stopped.stdout).code, 'WAIT_CANCELLED');
  assert.deepEqual((await f.cli('observed-report', 'one')).reply, initial); assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), calls); assert.equal(owner.child.exitCode, null);
  await f.release(); assert.equal((await owner.exited).code, 0);
});

test('H05.08 MCP transport-cancelled action wait preserves durable cancellation and active owner', { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const gate = 'backend:snapshot-ui:1';
  const owner = f.spawnOwner('cli', 'observed-action', await f.requestFile(actionRequest(allocation.allocationId)), { gate }); await f.milestone(gate, owner.child.pid);
  const server = await f.mcp(); const bytes = await f.database(); const initial = (await server.call('get_observed_action', { actionId: 'one' })).reply;
  const calls = f.calls(); const waiting = server.rpc('tools/call', { name: 'get_observed_action', arguments: { actionId: 'one', waitMs: 45000 } }); let received = false; void waiting.result.then(() => { received = true; }, () => {});
  await f.milestone('public:inspect:2', server.child.pid);
  server.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: waiting.id } }) + '\n');
  await f.milestone('public:inspect-settled:2', server.child.pid);
  const settled = (await readFile(join(f.root, 'public-waits.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)).find(value => value.pid === server.child.pid && value.waitMs === 45000);
  assert.equal(settled.operation, 'inspect'); assert.equal(settled.signalAborted, true); assert.equal(settled.errorCode, 'WAIT_CANCELLED'); assert.equal(settled.result, undefined); assert.equal(received, false); assert.equal(owner.child.exitCode, null); assert.deepEqual(f.calls(), calls);
  assert.deepEqual((await server.call('get_observed_action', { actionId: 'one' })).reply, initial); assert.deepEqual(await f.database(), bytes); assert.equal(snapshot(initial).cancellationRequested, false);
  assert.equal(received, false, 'SDK suppresses cancelled reply after a synchronized public get while owner is still held');
  await f.release(); await owner.exited; await server.close();
});

test('H05.10 MCP transport-cancelled preparation wait preserves durable cancellation and active owner', { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const gate = 'backend:boot:1'; const owner = f.spawnOwner('cli', 'observed-allocate', await f.requestFile(f.request('one')), { gate });
  await f.milestone(gate, owner.child.pid); const allocationId = f.admission().readAllocationForAction('one')!.allocationId;
  const server = await f.mcp(); const initial = (await server.call('get_observed_allocation', { allocationId })).reply; const bytes = await f.database();
  const calls = f.calls(); const waiting = server.rpc('tools/call', { name: 'get_observed_allocation', arguments: { allocationId, waitMs: 45000 } }); let received = false; void waiting.result.then(() => { received = true; }, () => {});
  await f.milestone('public:get-allocation:2', server.child.pid);
  server.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: waiting.id } }) + '\n');
  await f.milestone('public:get-allocation-settled:2', server.child.pid);
  const settled = (await readFile(join(f.root, 'public-waits.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)).find(value => value.pid === server.child.pid && value.waitMs === 45000);
  assert.equal(settled.operation, 'get-allocation'); assert.equal(settled.signalAborted, true); assert.equal(settled.result.code, 'WAIT_CANCELLED'); assert.equal(settled.result.acceptance, 'unknown'); assert.equal(received, false); assert.equal(owner.child.exitCode, null); assert.deepEqual(f.calls(), calls);
  assert.deepEqual((await server.call('get_observed_allocation', { allocationId })).reply, initial); assert.deepEqual(await f.database(), bytes); assert.equal(snapshot(initial).cancellationRequested, false);
  assert.equal(received, false, 'SDK suppresses cancelled reply after a synchronized public get while owner is still held');
  await f.release(); assert.equal((await owner.exited).code, 0); await server.close();
});
