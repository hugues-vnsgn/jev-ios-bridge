import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { createRunLog } from '../src/log/index.js';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { ScriptedJevError } from '../src/scripted/jev.js';
import { buildScriptedReport, renderScriptedReport } from '../src/scripted/report.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { resolveActionTarget, ScriptSelectionError } from '../src/scripted/select.js';
import { startWatchServer } from '../src/watch/index.js';

const visible = { visible: true, enabled: true };
const frame = { x: 20, y: 20, width: 200, height: 30 };
const element = (ref: string, role: string, label: string, actions: string[] = []): Element =>
  ({ ref, role, label, frame, state: visible, actions });
const snapshot = (elements: Element[]): Snapshot => ({ deviceId: 'sim', capturedAt: Date.now(),
  expiresAt: Date.now() + 60_000, sequence: 1, elements, truncated: false });

function memoryLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events, async append(type, data) { events.push({ version: 1, runId: 'production',
    sequence: events.length + 1, at: new Date().toISOString(), type, data }); },
  async read() { return events; } };
}

test('production selector keeps unidentified button aliases opt-in and rejects distinct buttons', () => {
  const first = element('e1', 'button', 'Nolan', ['tap']);
  const alias = { ...first, ref: 'e2' };
  assert.throws(() => resolveActionTarget(snapshot([first, alias]), { role: 'button', label: 'Nolan' }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_AMBIGUOUS');
  assert.equal(resolveActionTarget(snapshot([first, alias]), { role: 'button', label: 'Nolan' }, 'tap',
    { tapAliasRule: 'mobilebuildmcp-2.7.1' }).ref, 'e1');
  assert.throws(() => resolveActionTarget(snapshot([first, { ...alias, frame: { ...frame, y: 90 } }]),
    { role: 'button', label: 'Nolan' }, 'tap', { tapAliasRule: 'mobilebuildmcp-2.7.1' }),
  (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_AMBIGUOUS');
});

test('runner uses narrow device contexts and retains full checkpoint observation without changing Jev text', async () => {
  const rows = Array.from({ length: 70 }, (_, index) => element(`noise-${index}`, 'other', '', []));
  const screen = snapshot([...rows, element('choice', 'button', 'Distance km selected', ['tap'])]);
  const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: { query: 'private-value' },
    steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'button', label: 'Distance km selected' }] },
      assertions: [{ id: 'claim', claim: 'Distance km is selected.' }] }] };
  const log = memoryLog();
  let prepared: unknown;
  let judged = '';
  const driver: DeviceDriver = { async prepare(context) { prepared = context; }, async observe() { return screen; },
    async act() { throw new Error('unexpected action'); }, async close() {} };
  const report = await runScriptedScenario({ runId: 'production', scenario, driver, log,
    judge: { async judge(_assertions, observation) { judged = observation;
      return { probabilities: { claim: 0.99 }, inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } } });
  assert.deepEqual(prepared, { app: scenario.app });
  assert.equal(report.verdict, 'passed');
  const step = log.events.find(event => event.type === 'step');
  assert.equal(step?.data.assertionObservation, judged);
  assert.match(String(step?.data.observationSummary), /Distance km selected/);
  assert.match(judged, /Distance km selected/);
  assert.match(renderScriptedReport(report), /Distance km selected/);
  assert.match(renderScriptedReport(report), /run.jsonl/);
});

test('action context contains values and local checkpoint evidence redacts typed values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-evidence-'));
  try {
    const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: { query: 'private-value' },
      steps: [
        { id: 'tap', kind: 'action', guard: { present: [{ identifier: 'go' }] },
          action: { kind: 'tap', selector: { identifier: 'go' } } },
        { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'private-value' }] },
          assertions: [{ id: 'claim', claim: 'The private value is visible.' }] },
      ] };
    const first = snapshot([{ ...element('go-ref', 'button', 'Go', ['tap']), identifier: 'go' }]);
    const second = snapshot([element('secret', 'text', 'private-value')]);
    let observations = 0;
    let actionContext: unknown;
    const driver: DeviceDriver = { async prepare() {}, async observe() { return observations++ === 0 ? first : second; },
      async act(_action, _snapshot, context) { actionContext = context; }, async close() {} };
    const log = await createRunLog(root, 'redacted', { values: Object.values(scenario.values) });
    const report = await runScriptedScenario({ runId: 'redacted', scenario, driver, log,
      judge: { async judge() { return { probabilities: { claim: 0.99 }, inputTokens: 1,
        latencyMs: 1, model: 'jev-1.13.0' }; } } });
    assert.deepEqual(actionContext, { app: scenario.app, values: scenario.values });
    assert.equal(report.verdict, 'passed');
    const raw = await readFile(join(root, 'redacted', 'run.jsonl'), 'utf8');
    assert.doesNotMatch(raw, /private-value/);
    assert.match(raw, /\[REDACTED\]/);
    assert.match(renderScriptedReport(report), /Full redacted assertion observation: run\.jsonl/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('interrupted wait reports the script step number rather than poll captures', () => {
  const events: RunEvent[] = [
    { version: 1, runId: 'wait', sequence: 1, at: '', type: 'started', data: { mode: 'scripted' } },
    { version: 1, runId: 'wait', sequence: 2, at: '', type: 'step', data: { step: 1, stepId: 'wait', poll: 0 } },
    { version: 1, runId: 'wait', sequence: 3, at: '', type: 'step', data: { step: 1, stepId: 'wait', poll: 1 } },
    { version: 1, runId: 'wait', sequence: 4, at: '', type: 'step', data: { step: 1, stepId: 'wait', poll: 2 } },
  ];
  const report = buildScriptedReport(events);
  assert.equal(report.steps, 1);
  assert.equal(report.verdict, 'inconclusive');
});

test('a wait target captured after its timeout cannot advance to the checkpoint', async () => {
  const loading = element('loading', 'text', 'Loading');
  const done = element('done', 'text', 'Done');
  const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: {}, steps: [
    { id: 'wait', kind: 'wait', guard: { present: [{ label: 'Loading' }] },
      until: { present: [{ label: 'Done' }] }, timeoutMs: 2 },
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'claim', claim: 'Done is visible.' }] },
  ] };
  let observations = 0;
  let judgments = 0;
  const report = await runScriptedScenario({ runId: 'late-wait', scenario, log: memoryLog(),
    limits: { pollIntervalMs: 1 },
    driver: { async prepare() {}, async observe() {
      if (observations++ === 0) return snapshot([loading]);
      await new Promise(doneDelay => setTimeout(doneDelay, 12));
      return snapshot([done]);
    }, async act() {}, async close() {} },
    judge: { async judge() { judgments++; return { probabilities: { claim: 0.99 },
      inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'WAIT_TIMEOUT');
  assert.equal(judgments, 0);
});

test('cancellation during final judgment or checkpoint logging cannot yield a pass', async () => {
  const ready = element('ready', 'text', 'Ready');
  const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: {}, steps: [
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'claim', claim: 'Ready is visible.' }] },
  ] };
  for (const boundary of ['judgment', 'checkpoint'] as const) {
    const abort = new AbortController();
    const stored = memoryLog();
    const log: RunLog = { async append(type, data) {
      if (type === boundary) abort.abort();
      await stored.append(type, data);
    }, read: () => stored.read() };
    let closed = false;
    const report = await runScriptedScenario({ runId: 'late-cancel', scenario, log,
      signal: abort.signal,
      driver: { async prepare() {}, async observe() { return snapshot([ready]); },
        async act() {}, async close() { closed = true; } },
      judge: { async judge() { return { probabilities: { claim: 0.99 }, inputTokens: 1,
        latencyMs: 1, model: 'jev-1.13.0' }; } },
    });
    assert.equal(report.verdict, 'inconclusive', `abort at ${boundary}`);
    assert.equal(report.reason, 'CANCELLED');
    assert.equal(closed, true);
  }
});

test('cancellation during independent cleanup cannot leave a passed verdict', async () => {
  const abort = new AbortController();
  const ready = element('ready', 'text', 'Ready');
  const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: {}, steps: [
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'claim', claim: 'Ready is visible.' }] },
  ] };
  const report = await runScriptedScenario({ runId: 'cleanup-cancel', scenario, log: memoryLog(),
    signal: abort.signal,
    driver: { async prepare() {}, async observe() { return snapshot([ready]); }, async act() {},
      async close() { abort.abort(); } },
    judge: { async judge() { return { probabilities: { claim: 0.99 }, inputTokens: 1,
      latencyMs: 1, model: 'jev-1.13.0' }; } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'CANCELLED');
  assert.equal(report.checkpoints[0]?.status, 'passed');
});

test('cancellation during cleanup makes an earlier failed checkpoint inconclusive without erasing its evidence', async () => {
  const abort = new AbortController();
  const ready = element('ready', 'text', 'Ready');
  const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: {}, steps: [
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'claim', claim: 'Ready is false.' }] },
  ] };
  let enteredClose!: () => void;
  let releaseClose!: () => void;
  const closing = new Promise<void>(resolve => { enteredClose = resolve; });
  const closeBarrier = new Promise<void>(resolve => { releaseClose = resolve; });
  const log = memoryLog();
  const run = runScriptedScenario({ runId: 'failed-cleanup-cancel', scenario, log, signal: abort.signal,
    driver: { async prepare() {}, async observe() { return snapshot([ready]); }, async act() {},
      async close() { enteredClose(); await closeBarrier; } },
    judge: { async judge() { return { probabilities: { claim: 0.04 }, inputTokens: 1,
      latencyMs: 1, model: 'jev-1.13.0' }; } },
  });
  await closing;
  assert.equal(log.events.find(event => event.type === 'checkpoint')?.data.status, 'failed');
  assert.equal(log.events.some(event => event.type === 'verdict'), false);
  abort.abort();
  releaseClose();
  const report = await run;
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'CANCELLED');
  assert.equal(report.checkpoints[0]?.status, 'failed');
  assert.equal(report.checkpoints[0]?.assertions[0]?.probability, 0.04);
  assert.equal(report.events.at(-1)?.data.verdict, 'inconclusive');
  assert.ok(report.events.some(event => event.type === 'error' && event.data.code === 'CANCELLED'));
});

test('cleanup failure remains the terminal reason when cancellation occurs during cleanup', async () => {
  const abort = new AbortController();
  const ready = element('ready', 'text', 'Ready');
  const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: {}, steps: [
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'claim', claim: 'Ready is false.' }] },
  ] };
  let enteredClose!: () => void;
  let releaseClose!: () => void;
  const closing = new Promise<void>(resolve => { enteredClose = resolve; });
  const closeBarrier = new Promise<void>(resolve => { releaseClose = resolve; });
  const run = runScriptedScenario({ runId: 'failed-cleanup-priority', scenario, log: memoryLog(), signal: abort.signal,
    driver: { async prepare() {}, async observe() { return snapshot([ready]); }, async act() {},
      async close() { enteredClose(); await closeBarrier; throw new Error('stop failed'); } },
    judge: { async judge() { return { probabilities: { claim: 0.04 }, inputTokens: 1,
      latencyMs: 1, model: 'jev-1.13.0' }; } },
  });
  await closing;
  abort.abort();
  releaseClose();
  const report = await run;
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'CLEANUP_FAILED');
  assert.equal(report.checkpoints[0]?.status, 'failed');
});

test('typed model failures retain their safe reason in an inconclusive run', async () => {
  const ready = element('ready', 'text', 'Ready');
  const scenario: ScriptedScenario = { version: 1, app: { bundleId: 'dev.example.app' }, values: {}, steps: [
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'claim', claim: 'Ready is visible.' }] },
  ] };
  for (const code of ['MALFORMED_RESPONSE', 'REQUEST_BUDGET', 'AUTH'] as const) {
    const report = await runScriptedScenario({ runId: 'model-error', scenario, log: memoryLog(),
      driver: { async prepare() {}, async observe() { return snapshot([ready]); },
        async act() {}, async close() {} },
      judge: { async judge() { throw new ScriptedJevError(code); } },
    });
    assert.equal(report.verdict, 'inconclusive');
    assert.equal(report.reason, code);
  }
});

test('large reports keep the decisive final checkpoint within a 24 KB UTF-8 host budget', () => {
  for (const status of ['failed', 'inconclusive'] as const) {
    const events: RunEvent[] = [{ version: 1, runId: 'large', sequence: 1, at: '',
      type: 'started', data: { mode: 'scripted' } }];
    for (let step = 1; step <= 100; step++) {
      const final = step === 100;
      const stepId = final ? 'finalTotal' : `prior${step}`;
      events.push({ version: 1, runId: 'large', sequence: events.length + 1, at: '', type: 'step',
        data: { step, stepId, observationSummary: final ? 'DECISIVE SCREEN: Total $2' : 'older screen',
          assertionObservation: final ? 'Full terminal evidence' : 'Earlier evidence', screenshotPath: `screen-${step}.jpg` } });
      events.push({ version: 1, runId: 'large', sequence: events.length + 1, at: '', type: 'checkpoint',
        data: { step, stepId, status: final ? status : 'passed',
          assertions: Array.from({ length: 20 }, (_, index) => ({ id: `claim${index}`,
            claim: final && index === 19 ? `FINAL WRONG TOTAL ${'é'.repeat(850)}` :
              `Earlier proof ${step} ${'é'.repeat(850)}`,
            probability: final ? (status === 'failed' ? 0.02 : 0.5) : 0.98 })) } });
    }
    events.push({ version: 1, runId: 'large', sequence: events.length + 1, at: '', type: 'verdict',
      data: { verdict: status, reason: status === 'failed' ? 'ASSERTION_FALSE' : 'ASSERTION_UNCERTAIN', steps: 100 } });
    const rendered = renderScriptedReport(buildScriptedReport(events));
    assert.ok(Buffer.byteLength(rendered, 'utf8') <= 24_000);
    assert.match(rendered, new RegExp(`Run large: ${status}`));
    assert.match(rendered, /Checkpoint finalTotal: (failed|inconclusive)/);
    assert.match(rendered, /FINAL WRONG TOTAL/);
    assert.match(rendered, /DECISIVE SCREEN: Total \$2/);
    assert.match(rendered, /run\.jsonl event 200/);
    assert.match(rendered, /\[Report truncated/);
    assert.ok(rendered.indexOf('Checkpoint finalTotal') < rendered.indexOf('Checkpoint prior1'));
  }
});

test('watch serves scripted verdict and progress with token, text rendering, and CSP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-watch-'));
  let watch: Awaited<ReturnType<typeof startWatchServer>> | undefined;
  try {
    const log = await createRunLog(root, 'scripted-watch');
    await log.append('started', { mode: 'scripted', bundleId: 'dev.example.app',
      plannedSteps: [{ id: 'search', kind: 'action' }, { id: 'verify', kind: 'checkpoint' }] });
    await log.append('step', { step: 1, stepId: 'search', kind: 'action', observationSummary: '<b>private text</b>' });
    await log.append('action', { step: 1, stepId: 'search', action: 'tap', resolvedRef: 'e1' });
    await log.append('step', { step: 2, stepId: 'verify', kind: 'checkpoint' });
    await log.append('judgment', { step: 2, stepId: 'verify', probabilities: { claim: 0.98 } });
    await log.append('checkpoint', { step: 2, stepId: 'verify', status: 'passed', assertions: [] });
    await log.append('verdict', { verdict: 'passed', reason: 'ALL_CHECKPOINTS_PASSED', steps: 2 });
    watch = await startWatchServer(root);
    const address = new URL(watch.urlFor('scripted-watch'));
    const headers = { Authorization: `Bearer ${address.searchParams.get('token')}` };
    const denied = await fetch(`${address.origin}/events?run=scripted-watch`);
    assert.equal(denied.status, 401);
    const response = await fetch(`${address.origin}/events?run=scripted-watch`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    const report = await response.json();
    assert.equal(report.verdict, 'passed');
    assert.equal(report.checkpoints[0].stepId, 'verify');
    const app = await (await fetch(`${address.origin}/app.js`)).text();
    assert.match(app, /textContent/);
    assert.match(app, /stepId/);
    assert.match(app, /probabilities/);
  } finally { await watch?.close(); await rm(root, { recursive: true, force: true }); }
});
