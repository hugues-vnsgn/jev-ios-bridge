import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, realpathSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runObservedExperiment, observedExperimentSchema, readObservedExperiment } from '../src/experimental/observed-run.js';

const raw = { experimental: 'observed-tap-v1', actionId: 'one', deviceId: 'abcdef00-0000-4000-8000-000000000001',
  app: { bundleId: 'dev.fixture' }, selector: { identifier: 'go' }, before: { present: [{ identifier: 'go' }] },
  after: { present: [{ identifier: 'done' }] }, timeoutMs: 100 };
test('original experiment spelling remains strict and normalizes the device without allocation adoption', () => {
  assert.equal(observedExperimentSchema.parse(raw).deviceId, raw.deviceId.toUpperCase());
  assert.throws(() => observedExperimentSchema.parse({ ...raw, allocationId: 'arbitrary' }));
  assert.throws(() => observedExperimentSchema.parse({ ...raw, experimental: 'other' }));
});
test('standalone raw-device execution refuses safely with no evidence or preparation', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-run-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const evidence = join(root, 'evidence');
  await assert.rejects(runObservedExperiment(raw, evidence, { cwd: root }), { code: 'MIGRATION_REQUIRED' });
  assert.equal(existsSync(evidence), false);
});

test('experiment file reader enforces byte size and reports invalid JSON safely', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-file-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'request.json'); writeFileSync(path, JSON.stringify(raw), { mode: 0o600 });
  assert.deepEqual(await readObservedExperiment(path), raw);
  writeFileSync(path, 'secret-invalid-json'); await assert.rejects(readObservedExperiment(path), { code: 'INVALID_REQUEST' });
  writeFileSync(path, 'x'.repeat(65537)); await assert.rejects(readObservedExperiment(path), { code: 'INVALID_REQUEST' });
  await assert.rejects(runObservedExperiment({ ...raw, extra: 'secret' }, '/unused', { cwd: root }), { code: 'INVALID_REQUEST' });
  const circular: Record<string, unknown> = { ...raw }; circular.self = circular;
  await assert.rejects(runObservedExperiment(circular, '/unused', { cwd: root }), { code: 'INVALID_REQUEST' });
  await assert.rejects(runObservedExperiment(undefined, '/unused', { cwd: root }), { code: 'INVALID_REQUEST' });
});
test('spike uses the approved flag and refuses before opening admission when it is off', () => {
  const child = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', import.meta.resolve('tsx'),
    fileURLToPath(new URL('../spikes/observed-ui/cli.ts', import.meta.url)), '/not-read/request.json', '/not-written/evidence'],
    { encoding: 'utf8', env: { ...process.env, JEV_EXPERIMENTAL_OBSERVED: '0', JEV_OBSERVED_ACTIONS: '1' } });
  assert.equal(child.status, 2, child.stderr); assert.equal(child.stdout, '');
  const error = JSON.parse(child.stderr); assert.equal(error.code, 'OBSERVED_DISABLED'); assert.equal(error.acceptance, 'no');
});
