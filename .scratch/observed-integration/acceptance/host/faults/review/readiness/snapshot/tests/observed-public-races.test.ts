import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { mkdir, symlink, writeFile, mkdtemp, realpath, readFile, readdir, lstat, chmod, rm, cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Admission } from '../src/device/admission.js';
import { hostFixture, actionRequest } from './fixtures/observed-host/harness.js';

test('H03.01 public concurrent preparation/start bind exactly one executor across cwd/project aliases', { timeout: 20000 }, async t => {
  const f = await hostFixture(t); const path = await f.requestFile(f.request('one'));
  const cwd = join(f.root, 'unrelated'); await mkdir(cwd); const alias = join(f.root, 'alias'); await symlink(cwd, alias);
  const prepared = await Promise.all([f.cli('observed-allocate', path, { cwd, projectDir: cwd }), f.cli('observed-allocate', path, { cwd: alias, projectDir: alias })]);
  assert.equal(prepared[0].reply.allocationId, prepared[1].reply.allocationId);
  const allocationId = prepared[0].reply.allocationId;
  const read = await f.cli('observed-allocation', allocationId.toLowerCase()); assert.equal(read.reply.state, 'ready');
  for (const op of ['create', 'boot', 'install', 'launch-app']) assert.equal(f.calls().filter(value => value === op).length, 1, op);
  const request = actionRequest(allocationId.toLowerCase()); const actionPath = await f.requestFile(request, 'action.json');
  const results = await Promise.all([f.cli('observed-action', actionPath, { cwd }), f.cli('observed-action', actionPath, { cwd: alias })]);
  assert.deepEqual(results.map(r => r.reply.disposition).sort(), ['retrieved', 'started']);
  assert.ok(results.every(r => r.reply.outcome === 'outcome_observed')); assert.equal(f.calls().filter(op => op === 'touch').length, 1);
  const calls = f.calls(); const bytes = await f.database();
  const conflict = await f.cli('observed-action', await f.requestFile({ ...request, timeoutMs: 6000 }, 'conflict.json'));
  assert.equal(conflict.code, 3); assert.equal(conflict.reply.code, 'ACTION_ID_CONFLICT'); assert.deepEqual(f.calls(), calls); assert.deepEqual(await f.database(), bytes);
  const mcp = await f.mcp({ enabled: '0', cwd: alias });
  const retrieved = await mcp.call('get_observed_action', { actionId: 'one' }); assert.equal(retrieved.reply.outcome, 'outcome_observed');
  assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), calls); await mcp.close();
});

test('H03.02 normal public allocation exit leaves durable parked ownership for a different transport', async t => {
  const f = await hostFixture(t); const allocation = await f.prepare();
  const record = f.admission().readAllocation(allocation.allocationId)!; assert.equal(record.owner.process.pid, 0); assert.equal(record.owner.process.incarnation, 'parked');
  const calls = f.calls(); const server = await f.mcp();
  await server.call('start_observed_action', actionRequest(allocation.allocationId.toLowerCase()));
  const terminal = await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 });
  assert.equal(terminal.reply.outcome, 'outcome_observed'); assert.equal(terminal.reply.device.udid, record.device);
  const added = f.calls().slice(calls.length); assert.equal(added.filter(op => op === 'touch').length, 1);
  assert.ok(added.every(op => !['create', 'boot', 'install', 'launch-app', 'window'].includes(op))); await server.close();
});

test('H03.03 root aliases fail closed and cannot establish an alternate authority domain', async t => {
  const f = await hostFixture(t); await f.prepare(); const bytes = await f.database(); const alias = join(f.root, 'store-link'); await symlink(f.store, alias);
  for (const root of [alias, f.store + '/.', f.store + '/../store']) assert.throws(() => Admission.forTesting({ root, backend: 'fake', initialize: false }), { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(await f.database(), bytes);
});

for (const transport of ['cli', 'mcp'] as const) {
  for (const [gate, forbidden] of [
    ['afterCommit:reserveAllocation:1', ['create', 'boot', 'install', 'launch-app', 'touch']],
    ['afterCommit:stageAllocation:1', ['create', 'boot', 'install', 'launch-app', 'touch']],
    ['afterCommit:startCreation:1', ['boot', 'install', 'launch-app', 'touch']],
    ['afterCommit:recordCreation:1', ['boot', 'install', 'launch-app', 'touch']],
    ['afterCommit:attach:1', ['boot', 'install', 'launch-app', 'touch']],
    ['backend:boot:1', ['install', 'launch-app', 'touch']],
    ['backend:list:1', ['install', 'launch-app', 'touch']],
    ['backend:install:1', ['launch-app', 'touch']],
    ['backend:launch-app:1', ['touch']],
    ['backend:list:2', ['touch']],
    ['backend:snapshot-ui:1', ['touch']],
    ['backend:screenshot:1', ['touch']],
  ] as const) test(`H05.01 ${transport} durable external preparation cancel at ${gate} fences successors`, { timeout: 15000 }, async t => {
    const f = await hostFixture(t); const request = f.request('one');
    const server = transport === 'mcp' ? await f.mcp({ gate }) : undefined;
    const owner = server ?? f.spawnOwner('cli', 'observed-allocate', await f.requestFile(request), { gate });
    const result = server ? server.begin('prepare_observed_allocation', request) : undefined;
    await f.milestone(gate, owner.child.pid); const record = f.admission().readAllocationForAction('one')!;
    const before = f.calls(); const bytes = await f.database();
    const notReady = await f.cli('observed-action', await f.requestFile(actionRequest(record.allocationId), 'action.json'));
    assert.equal(notReady.reply.code, 'ALLOCATION_NOT_READY'); assert.equal(f.admission().readAllocation(record.allocationId)!.actionDigest, null); assert.deepEqual(await f.database(), bytes);
    const cancel = await f.cli('observed-allocation-cancel', record.allocationId, { enabled: '0' }); assert.equal(cancel.reply.cancellationRequested, true);
    await f.release();
    const final = server ? (await result!).reply : JSON.parse((await owner.exited).stdout);
    assert.equal(final.cancellationRequested, true); assert.notEqual(final.state, 'ready'); assert.notEqual(final.outcome, 'prepared');
    assert.equal(final.reservation.capacityHeld, !['afterCommit:reserveAllocation:1', 'afterCommit:stageAllocation:1'].includes(gate));
    const after = f.calls().slice(before.length); assert.ok(after.every(op => !forbidden.includes(op as never)), JSON.stringify(after));
    for (const op of ['create', 'boot', 'install', 'launch-app']) assert.ok(f.calls().filter(value => value === op).length <= 1, op);
    assert.equal(f.calls().filter(op => op === 'touch').length, 0); if (server) await server.close();
  });

  for (const [gate, touches] of [['afterCommit:consumeAllocation:1', 0], ['durable:tap-authorized:1', 1], ['backend:touch:1', 1], ['evidence:provisional:1', 1]] as const) {
    test(`H05.02 ${transport} durable external action cancel at ${gate} permits at most authorized input`, { timeout: 15000 }, async t => {
      const f = await hostFixture(t); const allocation = await f.prepare(); const request = actionRequest(allocation.allocationId);
      const server = transport === 'mcp' ? await f.mcp({ gate }) : undefined;
      const owner = server ?? f.spawnOwner('cli', 'observed-action', await f.requestFile(request), { gate });
      if (server) void server.begin('start_observed_action', request).catch(() => {});
      await f.milestone(gate, owner.child.pid);
      const busy = await f.cli('observed-retire', allocation.allocationId); assert.equal(busy.reply.code, 'ALLOCATION_BUSY');
      const cancel = await f.cli('observed-cancel', 'one', { enabled: '0' }); assert.equal(cancel.reply.cancellationRequested, true);
      await f.release();
      const final = server ? (await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 })).reply : JSON.parse((await owner.exited).stdout);
      assert.equal(final.outcome, 'inconclusive'); assert.equal(final.admission, 'quarantined'); assert.equal(final.cancellationRequested, true);
      assert.equal(f.calls().filter(op => op === 'touch').length, touches);
      const calls = f.calls(); const duplicate = await f.cli('observed-action', await f.requestFile(request, 'duplicate.json'));
      assert.equal(duplicate.reply.outcome, 'inconclusive'); assert.equal(duplicate.reply.disposition, 'retrieved'); assert.deepEqual(f.calls(), calls);
      if (server) await server.close();
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
    const started = Date.now(); owner.child.kill(signal); const result = await owner.exited;
    assert.equal(result.code, code); assert.equal(result.signal, null); assert.ok(Date.now() - started < 6500);
    const read = await f.cli('observed-report', 'one'); assert.equal(read.reply.cancellationRequested, true); assert.notEqual(read.reply.actionAttempted, true); assert.notEqual(read.reply.actionAcknowledged, true);
    assert.equal(f.calls().filter(op => op === 'touch').length, 0);
  });
}

test('H05.05 concurrent genuine start/retire has one durable winner and no input replay', { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const path = await f.requestFile(actionRequest(allocation.allocationId));
  const [start, retire] = await Promise.all([f.cli('observed-action', path), f.cli('observed-retire', allocation.allocationId)]);
  const record = f.admission().readAllocation(allocation.allocationId)!;
  if (record.actionDigest === null) { assert.equal(start.reply.code, 'ALLOCATION_NOT_READY'); assert.equal(retire.reply.outcome, 'retired_unused'); assert.equal(f.calls().filter(op => op === 'touch').length, 0); }
  else { assert.equal(start.reply.outcome, 'outcome_observed'); assert.ok(retire.reply.code === 'ALLOCATION_BUSY' || retire.reply.outcome === 'action_completed'); assert.equal(f.calls().filter(op => op === 'touch').length, 1); }
  assert.equal(record.capacityHeld, true); assert.ok(!f.calls().some(op => ['delete', 'erase', 'shutdown'].includes(op)));
});

test('H05.11 concurrent MCP start/retire has one durable winner and no input replay', { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const server = await f.mcp();
  const [start, retire] = await Promise.all([server.call('start_observed_action', actionRequest(allocation.allocationId)), server.call('retire_observed_allocation', { allocationId: allocation.allocationId })]);
  const record = f.admission().readAllocation(allocation.allocationId)!;
  if (record.actionDigest === null) { assert.equal(start.reply.code, 'ALLOCATION_NOT_READY'); assert.equal(retire.reply.outcome, 'retired_unused'); assert.equal(f.calls().filter(op => op === 'touch').length, 0); }
  else { const terminal = await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 }); assert.equal(terminal.reply.outcome, 'outcome_observed'); assert.ok(retire.reply.code === 'ALLOCATION_BUSY' || retire.reply.outcome === 'action_completed'); assert.equal(f.calls().filter(op => op === 'touch').length, 1); }
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
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited;
    if (process.env.HOST_EVIDENCE_DIR) { const archive = join(process.env.HOST_EVIDENCE_DIR, 'early-' + phase); await mkdir(archive, { recursive: true, mode: 0o700 }); await writeFile(join(root, 'public-result.json'), JSON.stringify({ stdout, stderr }), { mode: 0o600 }); await cp(root, join(archive, 'public'), { recursive: true }); if (backendRoot) await cp(backendRoot, join(archive, 'backend'), { recursive: true }); }
    async function writable(path: string): Promise<void> { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) return; await chmod(path, 0o700); for (const entry of await readdir(path)) await writable(join(path, entry)); }
    if (backendRoot) { await writable(backendRoot); await rm(backendRoot, { recursive: true, force: true }); } await rm(root, { recursive: true, force: true });
  });
  const end = Date.now() + 5000; while (true) { try { await readFile(join(root, 'milestone.jsonl')); break; } catch { assert.ok(Date.now() < end, 'Early CLI fixture did not reach phase: ' + stderr); await new Promise(done => setTimeout(done, 10)); } }
  const context = JSON.parse(await readFile(join(root, 'context.json'), 'utf8')); backendRoot = context.backendRoot;
  const started = Date.now(); child.kill('SIGTERM'); const result = await exited; assert.equal(result.code, 143); assert.equal(result.signal, null); assert.ok(Date.now() - started < 6500);
  assert.equal(stdout.trim().split('\n').length, 1); assert.notEqual(JSON.parse(stdout).outcome, 'prepared');
  const admission = Admission.forTesting({ root: context.store, backend: 'fake', initialize: false }); const record = admission.readAllocationForAction('allocate-one');
  if (phase === 'artifact-staging') { assert.ok(record); assert.equal(record.cancellationRequested, true); assert.equal(record.capacityHeld, false); } else assert.equal(record, undefined);
  const calls = JSON.parse(await readFile(join(root, 'calls.json'), 'utf8')) as string[]; assert.ok(calls.every(call => call === 'plist'));
});

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) test(`H05.06 ${signal} racing durable ready commit preserves parked allocation`, { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const gate = 'afterCommit:parkAllocation:1';
  const owner = f.spawnOwner('cli', 'observed-allocate', await f.requestFile(f.request('one')), { gate });
  await f.milestone(gate, owner.child.pid); const bytes = await f.database(); owner.child.kill(signal); await f.release();
  const result = await owner.exited;
  // If ordinary completion wins before the signal event is delivered, zero is
  // valid. Signal handling, when it wins, must use the production 130/143 exit.
  assert.ok(result.code === 0 || result.code === code); assert.equal(result.signal, null);
  const allocation = f.admission().readAllocationForAction('one')!; assert.equal(allocation.state, 'ready'); assert.equal(allocation.cancellationRequested, false);
  assert.equal(allocation.owner.process.pid, 0); assert.deepEqual(await f.database(), bytes); assert.equal(f.calls().filter(op => op === 'touch').length, 0);
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
  const waiting = server.rpc('tools/call', { name: 'get_observed_action', arguments: { actionId: 'one', waitMs: 45000 } }); void waiting.result.catch(() => {});
  await f.milestone('public:inspect:2', server.child.pid);
  server.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: waiting.id } }) + '\n');
  assert.deepEqual((await server.call('get_observed_action', { actionId: 'one' })).reply, initial); assert.deepEqual(await f.database(), bytes); assert.equal(initial.cancellationRequested, false);
  await f.release(); await owner.exited; await server.close();
});

test('H05.10 MCP transport-cancelled preparation wait preserves durable cancellation and active owner', { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const gate = 'backend:boot:1'; const owner = f.spawnOwner('cli', 'observed-allocate', await f.requestFile(f.request('one')), { gate });
  await f.milestone(gate, owner.child.pid); const allocationId = f.admission().readAllocationForAction('one')!.allocationId;
  const server = await f.mcp(); const initial = (await server.call('get_observed_allocation', { allocationId })).reply; const bytes = await f.database();
  const waiting = server.rpc('tools/call', { name: 'get_observed_allocation', arguments: { allocationId, waitMs: 45000 } }); void waiting.result.catch(() => {});
  await f.milestone('public:get-allocation:2', server.child.pid);
  server.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: waiting.id } }) + '\n');
  assert.deepEqual((await server.call('get_observed_allocation', { allocationId })).reply, initial); assert.deepEqual(await f.database(), bytes); assert.equal(initial.cancellationRequested, false);
  await f.release(); assert.equal((await owner.exited).code, 0); await server.close();
});
