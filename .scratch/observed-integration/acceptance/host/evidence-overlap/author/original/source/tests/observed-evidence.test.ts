import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, readFileSync, statSync, writeFileSync, symlinkSync, mkdirSync, chmodSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileObservedEvidence } from '../src/observed/evidence.js';
import { parseObservedAction } from '../src/observed/schema.js';
import type { Snapshot } from '../src/contracts/index.js';
import type { ObservedActionSnapshot } from '../src/observed/report.js';

const request = parseObservedAction({ version: 1, actionId: 'one', allocationId: 'ABCDEF00-0000-4000-8000-000000000001',
  app: { bundleId: 'dev.fixture' }, action: { kind: 'tap', selector: { identifier: 'go' } },
  before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 100 });
function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-evidence-')));
  t.after(() => rmSync(root, { recursive: true, force: true })); return { root, directory: join(root, 'observed', 'one'), evidence: new FileObservedEvidence() };
}
const snapshot = (screenshotPath?: string): Snapshot => ({ deviceId: request.allocationId, sequence: 1,
  capturedAt: 1, expiresAt: 2, elements: [], truncated: false, ...(screenshotPath ? { screenshotPath } : {}) });
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
