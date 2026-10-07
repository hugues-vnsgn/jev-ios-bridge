import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Snapshot } from '../src/contracts/index.js';
import { ObservedActionJournal } from '../src/experimental/observed-journal.js';
import { observedExperimentSchema, runObservedExperiment } from '../src/experimental/observed-run.js';

const deviceId = '12345678-1234-4234-8234-123456789ABC';
const config = { experimental: 'observed-tap-v1', actionId: 'open-details', deviceId,
  app: { bundleId: 'test.fixture' }, selector: { identifier: 'details.button' },
  before: { present: [{ identifier: 'home.heading' }] },
  after: { present: [{ identifier: 'details.heading' }] }, timeoutMs: 1000 };
function snapshot(done: boolean): Snapshot {
  return { deviceId, capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: done ? 2 : 1,
    truncated: false, elements: [{ ref: 'heading', role: 'text', identifier: done ? 'details.heading' : 'home.heading',
      frame: { x: 0, y: 0, width: 100, height: 20 }, actions: [], state: { enabled: true, visible: true } },
    { ref: 'button', role: 'button', identifier: 'details.button', frame: { x: 0, y: 30, width: 100, height: 20 }, actions: ['tap'], state: { enabled: true, visible: true } }] };
}

test('experiment rejects implicit device, empty guards and unknown options', () => {
  assert.equal(observedExperimentSchema.safeParse({ ...config, deviceId: 'booted' }).success, false);
  assert.equal(observedExperimentSchema.safeParse({ ...config, after: { present: [] } }).success, false);
  assert.equal(observedExperimentSchema.safeParse({ ...config, retry: true }).success, false);
});

test('runnable experiment writes actual snapshots and never prepares a repeated attempt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-run-'));
  try {
    let taps = 0, prepares = 0, closes = 0;
    const driver = { async prepare() { prepares++; }, async observe() { return snapshot(taps > 0); },
      async tapOnce() { taps++; }, async close() { closes++; } };
    const options = { cwd: root, journalRoot: join(root, 'journal'), driver };
    const result = await runObservedExperiment(config, join(root, 'evidence'), options);
    assert.equal(result.status, 'outcome_observed');
    assert.equal(taps, 1); assert.equal(prepares, 1); assert.equal(closes, 1);
    assert.equal(JSON.parse(await readFile(join(root, 'evidence', 'result.json'), 'utf8')).result.status, 'outcome_observed');
    const artifact = JSON.parse(await readFile(join(root, 'evidence', 'result.json'), 'utf8'));
    assert.equal(artifact.authoritative, false);
    assert.equal(artifact.finalization, 'consult-journal');
    assert.equal(artifact.terminalRecord.actionId, config.actionId);
    const repeated = await runObservedExperiment(config, join(root, 'repeat'), options).catch(() => undefined);
    assert.notEqual(repeated?.status, 'outcome_observed');
    assert.equal(taps, 1); assert.equal(prepares, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('lost tap acknowledgement survives a new runner and blocks new action IDs on the device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-run-'));
  try {
    let taps = 0, prepares = 0, closes = 0;
    const driver = { async prepare() { prepares++; }, async observe() { return snapshot(false); },
      async tapOnce() { taps++; throw new Error('lost reply'); }, async close() { closes++; } };
    const options = { cwd: root, journalRoot: join(root, 'journal'), driver };
    const result = await runObservedExperiment(config, join(root, 'evidence'), options);
    assert.equal(result.status, 'inconclusive');
    const next = await runObservedExperiment({ ...config, actionId: 'different-id' }, join(root, 'next'), options).catch(() => undefined);
    assert.notEqual(next?.status, 'outcome_observed');
    assert.equal(taps, 1); assert.equal(prepares, 1); assert.equal(closes, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const failure of ['initial-screenshot', 'final-result'] as const) {
  test(`${failure} persistence failure quarantines the real journal`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'observed-write-'));
    try {
      let taps = 0, prepares = 0;
      const evidence = join(root, 'evidence');
      const driver = { async prepare() { prepares++; }, async observe() {
        const value = snapshot(taps > 0);
        if (failure === 'initial-screenshot') value.screenshotPath = join(root, 'missing.jpg');
        return value;
      }, async tapOnce() { taps++; await mkdir(join(evidence, 'result.json')); }, async close() {} };
      const options = { cwd: root, journalRoot: join(root, 'journal'), driver };
      const result = await runObservedExperiment(config, evidence, options);
      assert.equal(result.status, 'inconclusive');
      assert.equal(await new ObservedActionJournal(options.journalRoot).deviceStatus(deviceId), 'quarantined');
      await assert.rejects(runObservedExperiment({ ...config, actionId: 'successor' }, join(root, 'next'), options));
      assert.equal(prepares, 1);
      assert.equal(taps, failure === 'initial-screenshot' ? 0 : 1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
