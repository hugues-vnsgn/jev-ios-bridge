import assert from 'node:assert/strict';
import test from 'node:test';
import { hostFixture, actionRequest } from './fixtures/observed-host/harness.js';
import { AdmissionSqlite } from '../src/device/admission-sqlite.js';

for (const transport of ['cli', 'mcp'] as const) {
  for (const [gate, expectedState, blocked] of [
    ['afterCommit:reserveAllocation:1', 'preparing', false],
    ['afterCommit:startCreation:1', 'preparing', true],
    ['backend:create:1', 'preparing', true],
    ['afterCommit:recordCreation:1', 'preparing', false],
    ['afterCommit:parkAllocation:1', 'ready', false],
  ] as const) test(`H06.01 ${transport} killed public preparation owner at ${gate}`, { timeout: 15000 }, async t => {
    const f = await hostFixture(t); const request = f.request('one');
    const server = transport === 'mcp' ? await f.mcp({ gate }) : undefined;
    const owner = server ?? f.spawnOwner('cli', 'observed-allocate', await f.requestFile(request), { gate });
    if (server) void server.begin('prepare_observed_allocation', request).catch(() => {});
    await f.milestone(gate, owner.child.pid);
    owner.child.kill('SIGKILL'); const stopped = await owner.exited; assert.equal(stopped.signal, 'SIGKILL');
    const record = f.admission().readAllocationForAction('one')!; assert.equal(record.state, expectedState); assert.equal(record.hostCreationBlocked, blocked);
    const bytes = await f.database(); const calls = f.calls();
    const read = await f.cli('observed-allocation', record.allocationId, { enabled: '0' });
    assert.equal(read.reply.state, expectedState); assert.equal(read.reply.hostCreationBlocked, blocked);
    assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), calls);
    if (expectedState === 'ready') {
      assert.equal(record.owner.process.pid, 0);
      const result = await f.cli('observed-action', await f.requestFile(actionRequest(record.allocationId), 'action.json'));
      assert.equal(result.reply.outcome, 'outcome_observed'); assert.equal(f.calls().filter(op => op === 'touch').length, 1);
    } else {
      const noBind = await f.cli('observed-action', await f.requestFile(actionRequest(record.allocationId), 'action.json'));
      assert.equal(noBind.reply.code, 'ALLOCATION_NOT_READY'); assert.equal(f.admission().readAllocationForAction('one')!.actionDigest, null);
      assert.deepEqual(f.calls(), calls);
      assert.equal(f.admission().quarantineAbandonedAllocation(record.owner), true);
      assert.equal(f.admission().readAllocation(record.allocationId)!.state, 'quarantined');
      assert.equal(f.admission().readAllocation(record.allocationId)!.hostCreationBlocked, blocked);
      if (record.device) assert.equal(f.admission().acquire({ device: record.device, attempt: { kind: 'legacy', id: 'successor' }, digest: 'successor', intent: {} }).kind, 'refused');
    }
    assert.ok(!f.calls().some(op => ['shutdown', 'delete', 'erase', 'window'].includes(op)));
  });

  for (const [gate, attempted, acknowledged, committed, touches] of [
    ['afterCommit:consumeAllocation:1', false, false, false, 0],
    ['durable:tap-authorized:1', null, null, false, 0],
    ['backend:touch:1', null, null, false, 1],
    ['afterCommit:recordActionReceipt:1', true, true, false, 1],
    ['beforeCommit:finalize:1', true, true, false, 1],
    ['afterCommit:finalize:1', true, true, true, 1],
    ['evidence:terminal:1', true, true, true, 1],
    ['evidence:exported:1', true, true, true, 1],
  ] as const) test(`H06.02 ${transport} killed public action owner at ${gate}`, { timeout: 15000 }, async t => {
    const f = await hostFixture(t); const allocation = await f.prepare(); const request = actionRequest(allocation.allocationId);
    const server = transport === 'mcp' ? await f.mcp({ gate }) : undefined;
    const owner = server ?? f.spawnOwner('cli', 'observed-action', await f.requestFile(request, 'action.json'), { gate });
    if (server) void server.begin('start_observed_action', request).catch(() => {});
    await f.milestone(gate, owner.child.pid); owner.child.kill('SIGKILL'); assert.equal((await owner.exited).signal, 'SIGKILL');
    const calls = f.calls(); assert.equal(calls.filter(op => op === 'touch').length, touches);
    const bytes = await f.database();
    const read = await f.cli('observed-report', 'one', { enabled: '0' });
    assert.equal(read.reply.actionAttempted, attempted); assert.equal(read.reply.actionAcknowledged, acknowledged);
    assert.equal(read.reply.authority, committed ? 'committed' : 'unconfirmed');
    assert.equal(read.reply.outcome, committed ? 'outcome_observed' : null);
    assert.equal(read.reply.state, committed ? 'terminal' : 'unresolved');
    assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), calls);
    const duplicate = await f.cli('observed-action', await f.requestFile(request, 'duplicate.json'));
    assert.equal(duplicate.reply.disposition, 'retrieved'); assert.equal(duplicate.reply.outcome, read.reply.outcome);
    assert.deepEqual(f.calls(), calls);
    if (!committed) {
      const attempt = f.admission().readAttempt({ kind: 'observed', id: 'one' })!;
      assert.equal(f.admission().quarantineAbandoned(attempt.owner, 'OWNER_LOST'), true);
      const recovered = await f.cli('observed-report', 'one'); assert.equal(recovered.reply.outcome, 'inconclusive'); assert.equal(recovered.reply.admission, 'quarantined');
      assert.equal(recovered.reply.actionAttempted, attempted); assert.equal(recovered.reply.actionAcknowledged, acknowledged);
      const legacy = f.admission().acquire({ device: attempt.device.toLowerCase(), attempt: { kind: 'legacy', id: 'successor' }, digest: 'successor', intent: {} });
      assert.deepEqual(legacy, { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
    }
    assert.deepEqual(f.calls(), calls);
  });
}

for (const point of ['beforeCommit', 'afterCommit'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H06.03 genuine ${transport} ${point} finalization response fault preserves authority`, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const calls = f.calls();
  const server = transport === 'mcp' ? await f.mcp({ fault: `${point}:finalize` }) : undefined;
  if (server) await server.call('start_observed_action', actionRequest(allocation.allocationId));
  const result = server ? await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 }) : await f.cli('observed-action', await f.requestFile(actionRequest(allocation.allocationId)), { fault: `${point}:finalize` });
  assert.equal(result.reply.authority, point === 'afterCommit' ? 'committed' : 'unconfirmed');
  if (server && point === 'beforeCommit') {
    const bytes = await f.database(); const alive = await f.cli('observed-report', 'one');
    assert.equal(alive.reply.state, 'finalizing'); assert.equal(alive.reply.outcome, null);
    assert.deepEqual(await f.database(), bytes);
  }
  if (server) await server.close();
  const read = await f.cli('observed-report', 'one');
  assert.equal(read.reply.outcome, point === 'afterCommit' ? 'outcome_observed' : null);
  assert.equal(read.reply.state, point === 'afterCommit' ? 'terminal' : 'unresolved');
  assert.equal(f.calls().slice(calls.length).filter(op => op === 'touch').length, 1);
});

test('H06.04 duplicate finalization and stale token cannot change a genuine public committed result', async t => {
  const f = await hostFixture(t); const allocation = await f.prepare();
  const result = await f.cli('observed-action', await f.requestFile(actionRequest(allocation.allocationId))); assert.equal(result.reply.outcome, 'outcome_observed');
  const attempt = f.admission().readAttempt({ kind: 'observed', id: 'one' })!; const bytes = await f.database();
  // Supplemental primitive checks use the exact identity/terminal produced by
  // the public owner; they do not replace any owner-kill case above.
  const store = new AdmissionSqlite({ root: f.store, mode: 'test' });
  assert.deepEqual(store.finalize(attempt.owner, attempt.terminal!), attempt);
  assert.throws(() => store.finalize({ ...attempt.owner, token: 'stale-token' }, attempt.terminal!), { code: 'STALE_OWNER' });
  assert.throws(() => store.authorize(attempt.owner, 'tap'), { code: 'STALE_OWNER' });
  assert.deepEqual(await f.database(), bytes); const read = await f.cli('observed-report', 'one'); assert.equal(read.reply.outcome, 'outcome_observed'); assert.equal(f.calls().filter(op => op === 'touch').length, 1);
});

test('H06.05 genuine MCP owner late abort-ignoring touch reply cannot promote quarantined outcome', { timeout: 20000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const server = await f.mcp({ gate: 'async:backend:touch:1' });
  await server.call('start_observed_action', actionRequest(allocation.allocationId)); await f.milestone('waiting:touch:1', server.child.pid);
  const before = f.calls(); assert.equal(before.filter(op => op === 'touch').length, 1);
  const cancelled = await server.call('cancel_observed_action', { actionId: 'one' });
  assert.equal(cancelled.reply.cancellationRequested, true);
  const terminal = await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 });
  assert.equal(terminal.reply.outcome, 'inconclusive'); assert.equal(terminal.reply.admission, 'quarantined');
  assert.equal(terminal.reply.actionAttempted, null); assert.equal(terminal.reply.actionAcknowledged, null);
  assert.deepEqual(f.calls(), before, 'Cancellation cannot dispatch any successor to the already-issued touch');
  await f.release(); await f.milestone('late:touch:1', server.child.pid);
  const after = await server.call('get_observed_action', { actionId: 'one' }); assert.deepEqual(after.reply, terminal.reply);
  assert.equal(f.calls().filter(op => op === 'touch').length, 1);
  const legacy = f.admission().acquire({ device: terminal.reply.device.udid, attempt: { kind: 'legacy', id: 'late-successor' }, digest: 'late-successor', intent: {} });
  assert.deepEqual(legacy, { kind: 'refused', reason: 'DEVICE_QUARANTINED' }); await server.close();
  assert.deepEqual(f.calls(), before, 'Late reply, reads, refused legacy successor and owner exit cannot add any backend/presentation/cleanup call');
});

test('H06.06 genuine CLI owner late abort-ignoring touch reply cannot promote quarantined outcome', { timeout: 20000 }, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const owner = f.spawnOwner('cli', 'observed-action', await f.requestFile(actionRequest(allocation.allocationId)), { gate: 'async:backend:touch:1' });
  await f.milestone('waiting:touch:1', owner.child.pid);
  const before = f.calls(); assert.equal(before.filter(op => op === 'touch').length, 1);
  const cancel = await f.cli('observed-cancel', 'one'); assert.equal(cancel.reply.cancellationRequested, true);
  const terminal = await f.cli('observed-report', 'one', { waitMs: 45000 }); assert.equal(terminal.reply.outcome, 'inconclusive'); assert.equal(terminal.reply.admission, 'quarantined');
  assert.equal(terminal.reply.actionAttempted, null); assert.equal(terminal.reply.actionAcknowledged, null);
  assert.deepEqual(f.calls(), before, 'Cancellation cannot dispatch any successor to the already-issued touch');
  await f.release(); await f.milestone('late:touch:1', owner.child.pid); const result = await owner.exited; assert.equal(result.code, 2);
  const after = await f.cli('observed-report', 'one');
  for (const field of ['outcome', 'authority', 'admission', 'actionAttempted', 'actionAcknowledged']) assert.equal(after.reply[field], terminal.reply[field], field);
  assert.equal(f.calls().filter(op => op === 'touch').length, 1);
  assert.deepEqual(f.calls(), before, 'Late reply, owner exit and fresh reads cannot add any backend/presentation/cleanup call');
});
