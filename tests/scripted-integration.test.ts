import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeviceDriver, Snapshot } from '../src/contracts/index.js';
import { parseIntegrationArgs, runIntegration } from '../spikes/scripted/integration/run.js';

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const otherUdid = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
const script = {
  app: { bundleId: 'dev.example.Sample' }, values: {}, steps: [
    { id: 'open', kind: 'action', guard: { present: [{ role: 'button', label: 'Start' }] },
      action: { kind: 'tap', selector: { role: 'button', label: 'Start' } } },
    { id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Done' }] },
      assertions: [{ id: 'visible', claim: 'Done is visible.' }] },
  ],
};

test('integration CLI requires an explicit dedicated UUID and whole-run bounds', () => {
  const parsed = parseIntegrationArgs(['scenario.json', '--device-udid', udid, '--out', 'results']);
  assert.equal(parsed.deviceUdid, udid);
  assert.equal(parsed.maxSteps, 100);
  assert.equal(parsed.timeoutMs, 900_000);
  assert.throws(() => parseIntegrationArgs(['scenario.json', '--out', 'results']));
  assert.throws(() => parseIntegrationArgs(['scenario.json', '--device-udid', 'booted', '--out', 'results']));
  assert.throws(() => parseIntegrationArgs(['scenario.json', '--device-udid', udid, '--out', 'results', '--max-steps', '101']));
});

test('a scripted run writes private replay, numeric metrics, and exact scenario/source provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-integration-'));
  try {
    const scenarioPath = join(root, 'scenario.json');
    await writeFile(scenarioPath, `${JSON.stringify(script)}\n`);
    let opened = false, prepares = 0, acts = 0, closes = 0;
    const screen = (label: string, role: string, actions: string[]): Snapshot => ({
      deviceId: udid, capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
      sequence: opened ? 2 : 1, truncated: false,
      elements: [{ ref: 'e1', role, label, actions,
        frame: { x: 10, y: 10, width: 100, height: 30 }, state: { enabled: true, visible: true } }],
    });
    const driver: DeviceDriver = {
      async prepare() { prepares++; },
      async observe() { return opened ? screen('Done', 'text', []) : screen('Start', 'button', ['tap']); },
      async act(action) { assert.equal(action.kind, 'tap'); acts++; opened = true; },
      async close() { closes++; },
      metrics() { return { referenceRefreshes: 0, referenceExpiries: 0, nearTtlRefreshes: 0 }; },
    };
    const result = await runIntegration({ scenarioPath, deviceUdid: udid, out: join(root, 'runs'),
      maxSteps: 10, timeoutMs: 10_000 }, {
      createDriver: () => driver,
      createJudge: () => ({ async judge(assertions, state) {
        assert.deepEqual(assertions, [{ id: 'visible', claim: 'Done is visible.' }]);
        assert.match(state, /Done/);
        return { probabilities: { visible: 0.99 }, model: 'jev-1.13.0', inputTokens: 12, latencyMs: 3 };
      } }),
    });
    assert.equal(result.verdict, 'passed');
    assert.deepEqual([prepares, acts, closes], [1, 1, 1]);
    const report = await readFile(result.reportPath, 'utf8');
    assert.match(report, /check: passed/);
    const metrics = JSON.parse(await readFile(result.metricsPath, 'utf8')) as Record<string, unknown>;
    assert.equal(metrics.inputTokens, 12);
    assert.equal(metrics.actionEvents, 1);
    assert.equal(metrics.judgmentEvents, 1);
    assert.equal(metrics.captureEvents, 2);
    assert.equal(metrics.jevLatencyMs, 3);
    const phases = metrics.phaseTimingsMs as Record<string, number>;
    assert.deepEqual(Object.keys(phases), ['prepareMs', 'observeMs', 'decideMs', 'actMs', 'waitMs', 'cleanupMs']);
    assert.ok(Object.values(phases).every(value => Number.isFinite(value) && value >= 0));
    const provenance = JSON.parse(await readFile(result.provenancePath, 'utf8')) as Record<string, unknown>;
    assert.equal(provenance.deviceUdid, udid);
    assert.equal(provenance.mobileBuildMcpVersion, '2.7.1');
    assert.equal(typeof provenance.assertionImplementationSha256, 'string');
    assert.equal(provenance.assertionExperimentSha256, undefined);
    assert.equal(typeof provenance.scriptedRuntimeSha256, 'string');
    assert.equal(typeof provenance.scenarioSha256, 'string');
    assert.match(await readFile(join(result.runDirectory, 'run.jsonl'), 'utf8'), /"type":"verdict"/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing key and a mismatched script device fail before driver creation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-no-key-'));
  const previous = process.env.TYPESAFE_API_KEY;
  try {
    const scenarioPath = join(root, 'scenario.json');
    await writeFile(scenarioPath, JSON.stringify(script));
    delete process.env.TYPESAFE_API_KEY;
    let drivers = 0;
    const args = { scenarioPath, deviceUdid: udid, out: join(root, 'runs'), maxSteps: 10, timeoutMs: 10_000 };
    await assert.rejects(runIntegration(args, { createDriver: () => { drivers++; throw new Error('device touched'); } }));
    assert.equal(drivers, 0);
    await writeFile(scenarioPath, JSON.stringify({ ...script, device: { udid: otherUdid } }));
    await assert.rejects(runIntegration(args, { createDriver: () => { drivers++; throw new Error('device touched'); } }),
      /DEVICE_MISMATCH/);
    assert.equal(drivers, 0);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('an integration cancellation reaches runner cleanup and persists an inconclusive report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-integration-cancel-'));
  try {
    const scenarioPath = join(root, 'wait.json');
    await writeFile(scenarioPath, JSON.stringify({ app: script.app, values: {}, steps: [
      { id: 'waitForDone', kind: 'wait', guard: { present: [{ role: 'text', label: 'Ready' }] },
        until: { present: [{ role: 'text', label: 'Done' }] }, timeoutMs: 5_000 },
      { id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Done' }] },
        assertions: [{ id: 'visible', claim: 'Done is visible.' }] },
    ] }));
    let closes = 0;
    const driver: DeviceDriver = {
      async prepare() {},
      async observe() { return { deviceId: udid, capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
        sequence: 1, truncated: false, elements: [{ ref: 'e1', role: 'text', label: 'Ready', actions: [],
          frame: { x: 0, y: 0, width: 100, height: 30 }, state: { enabled: true, visible: true } }] }; },
      async act() { throw new Error('No action expected'); },
      async close() { closes++; },
    };
    const abort = new AbortController();
    const pending = runIntegration({ scenarioPath, deviceUdid: udid, out: join(root, 'runs'),
      maxSteps: 10, timeoutMs: 10_000 }, { signal: abort.signal, createDriver: () => driver,
      createJudge: () => ({ async judge() { throw new Error('No judgment expected'); } }) });
    setTimeout(() => abort.abort(), 20);
    const result = await pending;
    assert.equal(result.verdict, 'inconclusive');
    assert.equal(closes, 1);
    const metrics = JSON.parse(await readFile(result.metricsPath, 'utf8')) as Record<string, unknown>;
    assert.equal(metrics.verdict, 'inconclusive');
    assert.equal(metrics.errorEvents, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
