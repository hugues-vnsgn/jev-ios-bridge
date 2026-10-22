import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { Admission } from '../src/device/admission.js';
import { AndroidOwnership } from '../src/device/android/ownership.js';
import { hostIdentityFixture } from './fixtures/identity-read-group.js';

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-identity-groups-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission: Admission.forTesting({ root, backend: 'fake', durability: 'full' }) };
}

for (const recovery of [false, true]) test(`default host identity groups precommit and settle once during ${recovery ? 'recovery' : 'ownership'}`, async t => {
  const { root } = fixture(t);
  const commits: string[] = [];
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'full', initialize: false,
    fault: (point, operation) => { if (point === 'afterCommit') commits.push(operation); } });
  const acquired = admission.acquire({ category: 'android-phone', device: 'hardware', attempt: { kind: 'legacy', id: 'identity' }, digest: 'identity', intent: {} });
  if (acquired.kind !== 'acquired') assert.fail('Expected admission');
  const ownership = new AndroidOwnership(admission, acquired.claim, 'emulator-5554', 'fake');
  if (recovery) ownership.beginCleanup(true);
  const outstanding: number[] = [];
  const host = hostIdentityFixture(root, (file, args) => {
    const pending = ownership.view().commands.filter(command => command.state === 'outstanding');
    assert.ok(pending.some(command => command.operation === JSON.stringify({ kind: 'identity-probe', file, args })), 'every send already has its own committed row');
    outstanding.push(pending.length);
  });
  commits.length = 0;
  const rows = await host.probe.withRecorder!(ownership.probe).android(AbortSignal.timeout(5000), 'emulator-5554');
  assert.equal(rows[0]?.value, host.avd);
  assert.deepEqual(outstanding, [1, 1, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3]);
  assert.equal(commits.filter(operation => operation === 'authorizeReads').length, 3);
  assert.equal(commits.filter(operation => operation === 'settleReads').length, 3);
  assert.equal(commits.length, 12);
  assert.equal(ownership.view().commands.length, 12);
  assert.ok(ownership.view().commands.every(command => command.state === 'settled'));
});

test('the final grouped host read refuses a changed console PID without querying that replacement', async t => {
  const { root, admission } = fixture(t);
  const acquired = admission.acquire({ category: 'android-phone', device: 'hardware', attempt: { kind: 'legacy', id: 'changed' }, digest: 'changed', intent: {} });
  if (acquired.kind !== 'acquired') assert.fail('Expected admission');
  const ownership = new AndroidOwnership(admission, acquired.claim, 'emulator-5554', 'fake');
  const host = hostIdentityFixture(root, undefined, true);
  await assert.rejects(host.probe.withRecorder!(ownership.probe).android(AbortSignal.timeout(5000), 'emulator-5554'),
    { code: 'DEVICE_IDENTITY_CONFLICT', reason: 'TRANSPORT_CHANGED' });
  assert.ok(host.calls.filter(call => call.file === '/bin/ps').every(call => call.args.at(-1) === '123'));
});

for (const [mode, sentCount] of [['identity-start', 2], ['identity-final', 9]] as const) {
  test(`${mode} kill after extended group commit leaves all three unsent reads outstanding`, { timeout: 15000 }, t => {
    const { root, admission } = fixture(t);
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'),
      fileURLToPath(new URL('./fixtures/admission-batch-worker.ts', import.meta.url)), root, mode],
    { timeout: 10000, encoding: 'utf8', env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    const sent = readFileSync(join(root, 'probe-sent.jsonl'), 'utf8').trim().split('\n');
    assert.equal(sent.length, sentCount);
    const attempt = admission.readAttempt({ kind: 'legacy', id: mode }); assert.ok(attempt);
    const commands = admission.readGeneration(attempt.owner).commands;
    assert.equal(commands.filter(command => command.state === 'settled').length, sentCount);
    const pending = commands.filter(command => command.state === 'outstanding');
    assert.equal(pending.length, 3);
    assert.deepEqual(pending.map(command => JSON.parse(command.operation).args), mode === 'identity-start'
      ? [['-o', 'lstart=', '-p', '123'], ['-s', 'emulator-5554', 'emu', 'avd', 'name'], ['-nP', '-a', '-p', '123', '-d', 'txt', '-Fn']]
      : [['-s', 'emulator-5554', 'emu', 'avd', 'id'], ['-nP', '-a', '-iTCP:5554', '-sTCP:LISTEN', '-Fpun'], ['-o', 'lstart=', '-p', '123']]);
  });
}

test('injected host metadata allows all four independent console reads in one group', async t => {
  const { FakeAdb } = await import('./fixtures/android-device.js');
  const { root } = fixture(t);
  const commits: string[] = [];
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'full', initialize: false,
    fault: (point, operation) => { if (point === 'afterCommit') commits.push(operation); } });
  const acquired = admission.acquire({ category: 'android-phone', device: 'hardware', attempt: { kind: 'legacy', id: 'injected' }, digest: 'injected', intent: {} });
  if (acquired.kind !== 'acquired') assert.fail('Expected admission');
  const ownership = new AndroidOwnership(admission, acquired.claim, 'emulator-5554', 'fake');
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'Pixel' });
  commits.length = 0;
  await adb.identityProbe.withRecorder!(ownership.probe).android(AbortSignal.timeout(5000), 'emulator-5554');
  assert.equal(ownership.view().commands.length, 6);
  assert.equal(commits.filter(operation => operation === 'authorizeReads').length, 1);
  assert.equal(commits.length, 6);
});

test('adjacent adb property reads precommit together and retain both individual replies', async t => {
  const { root } = fixture(t);
  const commits: string[] = [];
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'full', initialize: false,
    fault: (point, operation) => { if (point === 'afterCommit') commits.push(operation); } });
  const acquired = admission.acquire({ category: 'android-phone', device: 'hardware', attempt: { kind: 'legacy', id: 'properties' }, digest: 'properties', intent: {} });
  if (acquired.kind !== 'acquired') assert.fail('Expected admission');
  const ownership = new AndroidOwnership(admission, acquired.claim, 'emulator-5554', 'fake');
  const replies = ['34\n', '1\n'].map(stdout => ({ exitCode: 0, stdout, stderr: '' }));
  let sent = 0;
  commits.length = 0;
  const returned = await ownership.adbReads([['shell', 'sdk'], ['shell', 'boot']], async () => {
    assert.deepEqual(ownership.view().commands.map(command => command.state), ['outstanding', 'outstanding']);
    return replies[sent++]!;
  }, AbortSignal.timeout(5000));
  assert.deepEqual(returned, replies);
  assert.deepEqual(commits, ['authorizeReads', 'settleReads']);
  const view = ownership.view();
  assert.deepEqual(view.componentObservations.map(observation => observation.payload),
    view.commands.map((command, index) => ({ commandId: command.id, result: replies[index] })));
});

test('a repeated structured read group cannot resend a retrieved command', async t => {
  const { admission } = fixture(t);
  const acquired = admission.acquire({ category: 'android-phone', device: 'hardware', attempt: { kind: 'legacy', id: 'duplicate' }, digest: 'duplicate', intent: {} });
  if (acquired.kind !== 'acquired') assert.fail('Expected admission');
  const session = acquired.claim.bindDriver('fake');
  let sent = 0;
  const reads = [{ operation: { requestId: 'read-once', componentId: 'component', operation: 'read', payload: {}, recordResult: true,
    components: [{ id: 'component', kind: 'one-shot' as const, operation: 'read' }] }, read: async () => ++sent }];
  assert.deepEqual(await session.dispatchReads(reads), [1]);
  assert.throws(() => session.dispatchReads(reads), { code: 'DISPATCH_CLOSED' });
  assert.equal(sent, 1);
  assert.equal(admission.readGeneration(acquired.claim.identity).commands.length, 1);
});
