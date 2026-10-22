import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { Admission } from '../src/device/admission.js';

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-admission-batch-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission: Admission.forTesting({ root, backend: 'fake', durability: 'full' }) };
}

test('merge rule 1 owner killed after shared declaration/command commit leaves the unsent start outstanding', { timeout: 15000 }, t => {
  const { root, admission } = fixture(t);
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'),
    fileURLToPath(new URL('./fixtures/admission-batch-worker.ts', import.meta.url)), root, 'declaration'],
  { timeout: 10000, encoding: 'utf8', env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(existsSync(join(root, 'sent')), false);
  const attempt = admission.readAttempt({ kind: 'legacy', id: 'declaration' });
  assert.ok(attempt);
  const generation = admission.readGeneration(attempt.owner);
  assert.deepEqual(generation.components.map(component => [component.id, component.kind]), [['adb-start', 'adb-command'], ['agent', 'android-agent']]);
  assert.deepEqual(generation.commands.map(command => [command.componentId, command.state]), [['adb-start', 'outstanding']]);
  assert.equal(admission.inspect({ category: 'android-phone', value: 'fake-hardware' })?.state, 'active');
});

test('merge rule 3 owner killed after settlement/next commit leaves only the next unsent command outstanding', { timeout: 15000 }, t => {
  const { root, admission } = fixture(t);
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'),
    fileURLToPath(new URL('./fixtures/admission-batch-worker.ts', import.meta.url)), root, 'sequence'],
  { timeout: 10000, encoding: 'utf8', env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(existsSync(join(root, 'sent-0')), true);
  assert.equal(existsSync(join(root, 'sent-1')), false);
  const attempt = admission.readAttempt({ kind: 'legacy', id: 'sequence' });
  assert.ok(attempt);
  assert.deepEqual(admission.readGeneration(attempt.owner).commands.map(command => [command.operation, command.state]),
    [['first', 'settled'], ['second', 'outstanding']]);
});

test('a read group uses two commits, records every outcome and sends no read after a failure', async t => {
  const { root } = fixture(t);
  const commits: string[] = [];
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'full', initialize: false,
    fault: (point, operation) => { if (point === 'afterCommit') commits.push(operation); } });
  const acquired = admission.acquire({ category: 'android-phone', device: 'fake-hardware',
    attempt: { kind: 'legacy', id: 'outcomes' }, digest: 'outcomes', intent: {} });
  if (acquired.kind !== 'acquired') assert.fail('Expected admission');
  const session = acquired.claim.bindDriver('fake');
  commits.length = 0;
  const sent: number[] = [];
  await assert.rejects(session.dispatchReads([0, 1, 2].map(index => ({ operation: `read-${index}`, read: async () => {
    sent.push(index);
    assert.deepEqual(admission.readGeneration(acquired.claim.identity).commands.map(command => command.state), ['outstanding', 'outstanding', 'outstanding']);
    if (index === 1) throw new Error('second read failed');
    return index;
  } }))), /second read failed/);
  assert.deepEqual(sent, [0, 1]);
  assert.deepEqual(commits, ['authorizeReads', 'settleReads']);
  assert.deepEqual(admission.readGeneration(acquired.claim.identity).commands.map(command => command.state), ['settled', 'uncertain', 'uncertain']);
  assert.throws(() => session.dispatch('later', async () => assert.fail('no later send')), { code: 'DISPATCH_CLOSED' });
});

test('merge rule 2 owner killed after the group commit leaves every unsent read outstanding', { timeout: 15000 }, t => {
  const { root, admission } = fixture(t);
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'),
    fileURLToPath(new URL('./fixtures/admission-batch-worker.ts', import.meta.url)), root, 'reads'],
  { timeout: 10000, encoding: 'utf8', env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(existsSync(join(root, 'sent')), false);
  const attempt = admission.readAttempt({ kind: 'legacy', id: 'reads' });
  assert.ok(attempt);
  const generation = admission.readGeneration(attempt.owner);
  assert.deepEqual(generation.commands.map(command => [command.operation, command.state]),
    [['identity-name', 'outstanding'], ['identity-id', 'outstanding'], ['identity-path', 'outstanding']]);
  assert.equal(generation.components.length, 3);
});
