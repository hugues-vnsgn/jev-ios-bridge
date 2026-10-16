import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, readFileSync, statSync, writeFileSync, symlinkSync, mkdirSync, chmodSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileObservedEvidence } from '../src/observed/evidence.js';
import { parseObservedAction } from '../src/observed/schema.js';
import type { Snapshot } from '../src/contracts/index.js';
import type { ObservedActionSnapshot } from '../src/observed/report.js';
import { ObservedAllocator } from '../src/observed/allocation.js';
import { ObservedActionService } from '../src/observed/service.js';
import { createObservedDriver } from '../src/device/factory.js';
import type { CliRunner } from '../src/device/index.js';
import { allocationFixture } from './fixtures/observed-allocation-backend.js';

const request = parseObservedAction({ version: 1, actionId: 'one', allocationId: 'ABCDEF00-0000-4000-8000-000000000001',
  app: { bundleId: 'dev.fixture' }, action: { kind: 'tap', selector: { identifier: 'go' } },
  before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 100 });
function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-evidence-')));
  t.after(() => rmSync(root, { recursive: true, force: true })); return { root, directory: join(root, 'observed', 'one'), evidence: new FileObservedEvidence() };
}
const snapshot = (screenshotPath?: string): Snapshot => ({ deviceId: request.allocationId, sequence: 1,
  capturedAt: 1, expiresAt: 2, elements: [], truncated: false, ...(screenshotPath ? { screenshotPath } : {}) });
test('a parked allocation and its observed action share private evidence without repeating preparation', async () => {
  const f = await allocationFixture();
  const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir,
    fakeBackend: { process: f.source, runner: f.runner, window: f.window, host: f.host } });
  const actionCalls: string[] = [];
  const runner: CliRunner = async args => {
    const operation = args[1]!; actionCalls.push(operation);
    assert.ok(['snapshot-ui', 'screenshot'].includes(operation), 'Already-satisfied actions must not input or prepare');
    return { exitCode: 0, stderr: '', stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.capture-result', schemaVersion: '2',
      data: { artifacts: { simulatorId: 'ABCDEF00-0000-4000-8000-000000000001' }, capture: { type: 'runtime-snapshot', protocol: 'rs/1',
        capturedAtMs: Date.now(), expiresAtMs: Date.now() + 60000, count: 1,
        elements: [{ ref: 'done', role: 'button', identifier: 'done', label: 'Done', frame: { x: 0, y: 0, width: 100, height: 30 },
          actions: ['tap', 'touch'], state: { visible: true, enabled: true } }] } } }) };
  };
  const window = async () => { assert.fail('Ownership transfer must not present a device'); };
  const service = new ObservedActionService({ admission: f.admission, runsDir: f.runsDir, bridgeVersion: 'fixture', backend: 'fake', enabled: true,
    allocator, createDriver: () => createObservedDriver({ cwd: f.root, admission: f.admission, lockRoot: join(f.root, 'leases'),
      capture: 'full', screenshots: true, runner, deviceWindow: window, fakeBackend: { runner, window } }) });
  try {
    const prepared = await allocator.prepare(f.request('one'));
    assert.ok(!('kind' in prepared)); if ('kind' in prepared) throw new Error('Preparation refused');
    assert.equal(prepared.state, 'ready');
    const directory = join(f.runsDir, 'observed', 'one');
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    const readiness = prepared.readinessEvidence.map(path => ({ path, bytes: readFileSync(path) }));
    const preparationCalls = [...f.calls];
    const action = { ...request, allocationId: prepared.allocationId, app: { bundleId: 'org.example.fixture' }, timeoutMs: 5000 };
    await service.start(action);
    const terminal = await service.inspect('one', { waitMs: 5000 });
    assert.equal(terminal.authority, 'committed'); assert.equal(terminal.state, 'terminal');
    assert.equal(terminal.outcome, 'already_satisfied'); assert.equal(terminal.reason, null);
    assert.equal(terminal.actionAttempted, false); assert.equal(terminal.actionAcknowledged, false);
    assert.equal(terminal.observations, 1); assert.equal(terminal.allocationState, 'retained');
    assert.equal(terminal.evidence.exportStatus, 'complete'); assert.equal(terminal.evidence.directory, directory);
    assert.deepEqual(actionCalls, ['snapshot-ui', 'screenshot']); assert.deepEqual(f.calls, preparationCalls);
    for (const capture of readiness) assert.deepEqual(readFileSync(capture.path), capture.bytes);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8')), action);
    await service.start(action); await service.inspect('one'); await service.cancel('one');
    await service.close();
    assert.deepEqual(actionCalls, ['snapshot-ui', 'screenshot']); assert.deepEqual(f.calls, preparationCalls);
    assert.equal(f.admission.readAllocation(prepared.allocationId)?.state, 'retained');
  } finally { await service.close(); await f.cleanup(); }
});
for (const kind of ['file', 'permissive', 'symlink'] as const) {
  test(`an existing ${kind} action path refuses without creating request evidence`, async t => {
    const { root, directory, evidence } = fixture(t);
    const parent = join(root, 'observed'); mkdirSync(parent, { mode: 0o700 });
    const target = join(root, 'target');
    if (kind === 'file') writeFileSync(directory, 'existing-file', { mode: 0o600 });
    else if (kind === 'permissive') { mkdirSync(directory, { mode: 0o700 }); chmodSync(directory, 0o755); }
    else { mkdirSync(target, { mode: 0o700 }); symlinkSync(target, directory); }
    await assert.rejects(evidence.prepare(directory, request), /Unsafe/);
    assert.throws(() => readFileSync(join(kind === 'symlink' ? target : directory, 'request.json')),
      { code: kind === 'file' ? 'ENOTDIR' : 'ENOENT' });
    if (kind === 'file') assert.equal(readFileSync(directory, 'utf8'), 'existing-file');
  });
}
test('an existing request file or symlink is never replaced in a private action directory', async t => {
  const { root, directory, evidence } = fixture(t);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const original = join(root, 'original.json'); writeFileSync(original, 'original-request', { mode: 0o600 });
  symlinkSync(original, join(directory, 'request.json'));
  await assert.rejects(evidence.prepare(directory, request), { code: 'EEXIST' });
  assert.equal(readFileSync(original, 'utf8'), 'original-request');
  assert.equal(statSync(original).mode & 0o777, 0o600);
});
test('request, observation, screenshot and provisional evidence are absolute, private and exclusive', async t => {
  const { root, directory, evidence } = fixture(t); await evidence.prepare(directory, request);
  const source = join(root, 'source.jpg'); writeFileSync(source, Buffer.from([255, 216, 255]), { mode: 0o600 });
  const refs = await evidence.observation(directory, snapshot(source), 1);
  assert.deepEqual(refs, [join(directory, 'observation-1.json'), join(directory, 'observation-1.jpg')]);
  assert.deepEqual(readFileSync(refs[1]!), readFileSync(source));
  assert.equal(JSON.parse(readFileSync(refs[0]!, 'utf8')).screenshotPath, refs[1]);
  await evidence.provisional(directory, { status: 'already_satisfied', reason: null, actionAttempted: false, actionAcknowledged: false, observations: 1 });
  assert.equal(JSON.parse(readFileSync(join(directory, 'provisional-result.json'), 'utf8')).authoritative, false);
  for (const path of [join(directory, 'request.json'), ...refs, join(directory, 'provisional-result.json')]) assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  await assert.rejects(evidence.prepare(directory, request), { code: 'EEXIST' });
  await assert.rejects(evidence.observation(directory, snapshot(), 1), { code: 'EEXIST' });
  await assert.rejects(evidence.observation(directory, snapshot(), 0), /index/);
});
test('terminal exports require committed authority and cannot overwrite a prior projection', async t => {
  const { directory, evidence } = fixture(t); await evidence.prepare(directory, request);
  const value = { authority: 'none', state: 'terminal', outcome: 'already_satisfied' } as ObservedActionSnapshot;
  await assert.rejects(evidence.terminal(directory, value), /committed/);
  const committed = { ...value, authority: 'committed' as const };
  const path = await evidence.terminal(directory, committed); assert.equal(path, join(directory, 'terminal.json'));
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), committed);
  await assert.rejects(evidence.terminal(directory, committed), { code: 'EEXIST' }); assert.equal(statSync(path).mode & 0o777, 0o600);
});
test('relative paths, symlink directories and permissive parents cannot become evidence authority', async t => {
  const { root, evidence } = fixture(t); await assert.rejects(evidence.prepare('relative', request), /absolute/);
  mkdirSync(join(root, 'target'), { mode: 0o700 }); symlinkSync(join(root, 'target'), join(root, 'linked'));
  await assert.rejects(evidence.prepare(join(root, 'linked', 'one'), request), /Unsafe/);
  mkdirSync(join(root, 'permissive'), { mode: 0o700 }); chmodSync(join(root, 'permissive'), 0o755);
  await assert.rejects(evidence.prepare(join(root, 'permissive', 'one'), request), /Unsafe/);
});
test('symlink and oversized screenshot sources refuse instead of following or exporting them', async t => {
  const { root, directory, evidence } = fixture(t); await evidence.prepare(directory, request);
  const source = join(root, 'source.jpg'); writeFileSync(source, 'fixture', { mode: 0o600 }); symlinkSync(source, join(root, 'linked.jpg'));
  await assert.rejects(evidence.observation(directory, snapshot(join(root, 'linked.jpg')), 1));
  await assert.rejects(evidence.observation(directory, snapshot(root), 1), /Invalid screenshot/);
  truncateSync(source, 33 * 1024 * 1024); await assert.rejects(evidence.observation(directory, snapshot(source), 1), /Invalid screenshot/);
  await assert.rejects(evidence.observation(directory, snapshot('relative.jpg'), 1), /absolute/);
});
