import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DeviceDriver, JevJudge, Judgment, Scenario, Snapshot } from '../src/contracts/index.js';
import { createRunLog, readRunEvents } from '../src/log/index.js';
import { buildReport } from '../src/report/index.js';
import { BridgeService } from '../src/service.js';
import { startWatchServer } from '../src/watch/index.js';

const execute = promisify(execFile);
const scenario: Scenario = {
  goal: 'Home is visible', app: { bundleId: 'com.example.app' },
  assertions: [{ id: 'visible', claim: 'Home is visible' }], values: {},
};
const snapshot: Snapshot = {
  deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
  sequence: 1, elements: [], truncated: false,
};
const success: Judgment = {
  choice: 'stop-goal', confidence: 1, probabilities: { 'stop-goal': 1 }, goalReached: 1,
  assertions: { visible: 1 }, inputTokens: 3, latencyMs: 1, model: 'fixture',
};

function fakeDriver(overrides: Partial<DeviceDriver> = {}): DeviceDriver {
  return {
    async prepare() {}, async observe() { return snapshot; }, async act() { assert.fail('Unexpected action'); }, async close() {},
    ...overrides,
  };
}

const judge: JevJudge = { async judge() { return success; } };

async function finished(service: BridgeService, runId: string): Promise<Awaited<ReturnType<BridgeService['status']>>> {
  for (let i = 0; i < 100; i++) {
    const status = await service.status(runId);
    if (status.state !== 'running') return status;
    await new Promise(done => setTimeout(done, 5));
  }
  throw new Error('Run did not finish');
}

test('simultaneous starts keep distinct logs and share one watch server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-two-starts-'));
  const service = new BridgeService({ baseDir: root, createDriver: () => fakeDriver(), createJudge: () => judge });
  try {
    const [left, right] = await Promise.all([service.start(scenario), service.start(scenario)]);
    assert.notEqual(left.runId, right.runId);
    assert.equal(new URL(left.watchUrl).port, new URL(right.watchUrl).port);
    const [a, b] = await Promise.all([finished(service, left.runId), finished(service, right.runId)]);
    assert.equal(a.report.verdict, 'passed');
    assert.equal(b.report.verdict, 'passed');
    assert.equal((await readRunEvents(root, left.runId)).at(-1)?.type, 'verdict');
    assert.equal((await readRunEvents(root, right.runId)).at(-1)?.type, 'verdict');
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('cancel waits for cleanup and leaves a recoverable inconclusive report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-cancel-'));
  let closed = false;
  const pending: JevJudge = { judge: async (_scenario, _observation, signal) => new Promise<Judgment>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) };
  const service = new BridgeService({ baseDir: root, createDriver: () => fakeDriver({ async close() { closed = true; } }), createJudge: () => pending });
  try {
    const { runId } = await service.start(scenario);
    await service.cancel(runId);
    const status = await service.status(runId);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(closed, true);
    assert.equal(status.report.events.at(-1)?.type, 'verdict');
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('failed prepare and failed cleanup each record an inconclusive verdict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-errors-'));
  let prepareClosed = false;
  const service = new BridgeService({ baseDir: root,
    createDriver: (selected) => selected.goal === 'Prepare fails'
      ? fakeDriver({ async prepare() { throw new Error('launch failed'); }, async close() { prepareClosed = true; } })
      : fakeDriver({ async close() { throw new Error('stop failed'); } }),
    createJudge: () => judge,
  });
  try {
    const prepare = await service.start({ ...scenario, goal: 'Prepare fails' });
    const cleanup = await service.start({ ...scenario, goal: 'Cleanup fails' });
    const [a, b] = await Promise.all([finished(service, prepare.runId), finished(service, cleanup.runId)]);
    assert.equal(prepareClosed, true);
    assert.equal(a.report.verdict, 'inconclusive');
    assert.equal(b.report.verdict, 'inconclusive');
    assert.match(a.report.reason, /launch failed/);
    assert.match(b.report.reason, /cleanup failed/);
    assert.ok(a.report.events.some(event => event.type === 'error'));
    assert.ok(b.report.events.some(event => event.type === 'error'));
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('a failed screenshot copy does not poison later error and verdict appends', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-bad-shot-'));
  try {
    const log = await createRunLog(root, 'bad-shot');
    await log.append('started', { goal: 'Try screenshot' });
    await assert.rejects(log.append('step', { screenshotPath: join(root, 'missing.jpg') }));
    await log.append('error', { message: 'Screenshot unavailable' });
    await log.append('verdict', { verdict: 'inconclusive', reason: 'Screenshot unavailable', steps: 1, inputTokens: 0, durationMs: 1 });
    assert.deepEqual((await log.read()).map(event => event.type), ['started', 'error', 'verdict']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('service preserves the run handle and inconclusive verdict when screenshot copy fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-bad-shot-'));
  const service = new BridgeService({ baseDir: root,
    createDriver: () => fakeDriver({ async observe() { return { ...snapshot, screenshotPath: join(root, 'missing.jpg') }; } }),
    createJudge: () => judge,
  });
  try {
    const { runId } = await service.start(scenario);
    const status = await finished(service, runId);
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.events.at(-1)?.type, 'verdict');
    assert.ok(status.report.events.some(event => event.type === 'error'));
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('partial final JSONL record cannot turn an interrupted run into a pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-partial-'));
  try {
    const log = await createRunLog(root, 'partial');
    await log.append('started', { goal: 'Incomplete' });
    await appendFile(join(root, 'partial', 'run.jsonl'), '{"version":1,"runId":"partial","sequence":2');
    const events = await readRunEvents(root, 'partial');
    assert.equal(events.length, 1);
    assert.equal(buildReport(events).verdict, 'inconclusive');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('corrupt middle JSONL record is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-corrupt-'));
  try {
    const log = await createRunLog(root, 'corrupt');
    await log.append('started', { goal: 'Corrupt' });
    await appendFile(join(root, 'corrupt', 'run.jsonl'), 'not-json\n{"version":1,"runId":"corrupt","sequence":2,"at":"now","type":"verdict","data":{"verdict":"passed"}}\n');
    await assert.rejects(readRunEvents(root, 'corrupt'), /Corrupt run log/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('private values are redacted in recorded and served evidence; HTML remains text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-evidence-'));
  const privateValue = 'TopSecret-42';
  const html = '<img src=x onerror=alert(1)>';
  let watch: Awaited<ReturnType<typeof startWatchServer>> | undefined;
  try {
    const log = await createRunLog(root, 'safe', { values: [privateValue] });
    await log.append('started', { goal: 'Safe' });
    await log.append('step', { step: 1, observationSummary: `${html} ${privateValue}` });
    await log.append('verdict', { verdict: 'inconclusive', reason: privateValue, steps: 1, inputTokens: 0, durationMs: 1 });
    const report = buildReport(await readRunEvents(root, 'safe'));
    assert.ok(!JSON.stringify(report).includes(privateValue));
    watch = await startWatchServer(root);
    const url = new URL(watch.url);
    const response = await fetch(`${url.origin}/events?run=safe`, { headers: { Authorization: `Bearer ${url.searchParams.get('token')}` } });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes(privateValue));
    assert.ok(body.includes('[REDACTED]'));
    const script = await (await fetch(`${url.origin}/app.js`)).text();
    assert.ok(script.includes('text.textContent'));
    assert.ok(!script.includes('innerHTML'));
  } finally { await watch?.close(); await rm(root, { recursive: true, force: true }); }
});

test('watch serves copied images only with its token and a safe basename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-watch-image-'));
  let watch: Awaited<ReturnType<typeof startWatchServer>> | undefined;
  try {
    const source = join(root, 'source.jpg');
    await writeFile(source, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const log = await createRunLog(root, 'image');
    await log.append('started', {});
    await log.append('step', { step: 1, screenshotPath: source });
    const stored = (await log.read())[1]?.data.screenshotPath;
    assert.equal(stored, 'screen-2.jpg');
    watch = await startWatchServer(root);
    const url = new URL(watch.url);
    const endpoint = `${url.origin}/image?run=image&name=${stored}`;
    assert.equal((await fetch(endpoint)).status, 401);
    const headers = { Authorization: `Bearer ${url.searchParams.get('token')}` };
    const image = await fetch(endpoint, { headers });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    assert.equal((await fetch(`${url.origin}/image?run=image&name=..%2Fsource.jpg`, { headers })).status, 400);
    assert.equal((await fetch(`${url.origin}/image?run=image&name=screen-99.jpg`, { headers })).status, 404);
  } finally { await watch?.close(); await rm(root, { recursive: true, force: true }); }
});

test('service close racing with start prevents a job from escaping shutdown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-close-race-'));
  let closing: Promise<void> | undefined;
  let service: BridgeService;
  service = new BridgeService({ baseDir: root,
    createDriver: () => { closing = service.close(); return fakeDriver(); },
    createJudge: () => judge,
  });
  try {
    await assert.rejects(service.start(scenario), /shutting down/);
    await closing;
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('CLI report reads persisted evidence without a device or key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-cli-report-'));
  try {
    const log = await createRunLog(root, 'offline');
    await log.append('started', { goal: 'Offline' });
    await log.append('verdict', { verdict: 'failed', reason: 'Assertion false', steps: 1, inputTokens: 5, durationMs: 4 });
    const env: NodeJS.ProcessEnv = { ...process.env, JEV_RUNS_DIR: root };
    delete env.TYPESAFE_API_KEY;
    const result = await execute(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'report', 'offline'], { cwd: process.cwd(), env });
    assert.match(result.stdout, /Status: finished/);
    assert.match(result.stdout, /Run offline: failed/);
    assert.equal(result.stderr, '');
    assert.equal((await readFile(join(root, 'offline', 'run.jsonl'), 'utf8')).split('\n').length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});
