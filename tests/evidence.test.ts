import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunLog, readRunEvents, redact } from '../src/log/index.js';
import { buildScriptedReport, renderScriptedReport } from '../src/scripted/report.js';
import { startWatchServer } from '../src/watch/index.js';

test('events are ordered, private values redacted, and report uses recorded verdict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-evidence-'));
  try {
    const log = await createRunLog(root, 'test', { values: ['private-value', 'failed', 'goal', 'input'] });
    await Promise.all([log.append('started', { goal: 'Type private-value' }), log.append('prepared', {})]);
    await log.append('judgment', { probabilities: { 'type:e1:private-value': 1 }, assertions: { password: 0.02 } });
    await log.append('verdict', { verdict: 'failed', reason: 'Assertion false', steps: 1, inputTokens: 50, durationMs: 100 });
    const events = await log.read();
    assert.deepEqual(events.map(event => event.sequence), [1, 2, 3, 4]);
    assert.equal(events[0]?.data.goal, 'Type [REDACTED]');
    assert.deepEqual(events[2]?.data.assertions, { password: 0.02 });
    assert.equal(buildScriptedReport(events).verdict, 'failed');
    assert.equal(buildScriptedReport(events).inputTokens, 50);
    assert.match(renderScriptedReport(buildScriptedReport(events)), /Assertion false/);
    assert.doesNotMatch(await readFile(join(root, 'test/run.jsonl'), 'utf8'), /private-value/);
    await assert.rejects(createRunLog(root, 'test'));
    await assert.rejects(readRunEvents(root, '../test'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('short typed values redact screen evidence without breaking scripted event structure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-structural-redaction-'));
  try {
    const log = await createRunLog(root, 'scripted', { values: ['a', 'e'] });
    await log.append('started', { mode: 'scripted', bundleId: 'dev.example.app',
      plannedSteps: [{ id: 'tap', kind: 'action' }, { id: 'verify', kind: 'checkpoint' }] });
    await log.append('step', { step: 1, stepId: 'tap', kind: 'action',
      observationSummary: 'a e', selector: { label: 'a' } });
    await log.append('action', { step: 1, stepId: 'tap', action: 'tap', resolvedRef: 'e1' });
    await log.append('judgment', { step: 2, stepId: 'verify', model: 'jev-1.13.0',
      probabilities: { claim: 0.04 } });
    await log.append('checkpoint', { step: 2, stepId: 'verify', status: 'failed',
      assertions: [{ id: 'claim', claim: 'a e', probability: 0.04 }] });
    await log.append('verdict', { verdict: 'failed', reason: 'ASSERTION_FALSE', steps: 2 });
    const events = await log.read();
    assert.equal(events[0]?.data.mode, 'scripted');
    assert.notEqual(events[0]?.data.bundleId, 'dev.example.app');
    const planned = events[0]?.data.plannedSteps as Array<{ id: string; kind: string }>;
    assert.deepEqual(planned.map(step => step.kind), ['action', 'checkpoint']);
    assert.match(planned[0]!.id, /^redacted_[a-f0-9]{32}$/);
    assert.match(planned[1]!.id, /^redacted_[a-f0-9]{32}$/);
    assert.notEqual(planned[0]!.id, planned[1]!.id);
    assert.equal(events[1]?.data.kind, 'action');
    assert.equal(events[1]?.data.stepId, planned[0]!.id);
    assert.equal(events[2]?.data.action, 'tap');
    assert.equal(events[2]?.data.stepId, planned[0]!.id);
    assert.equal(events[3]?.data.stepId, planned[1]!.id);
    assert.equal(events[3]?.data.model, 'jev-1.13.0');
    assert.equal(events[4]?.data.stepId, planned[1]!.id);
    const assertion = (events[4]?.data.assertions as Array<{ id: string; claim: string; probability: number }>)[0]!;
    assert.match(assertion.id, /^redacted_[a-f0-9]{32}$/);
    assert.deepEqual(events[3]?.data.probabilities, { [assertion.id]: 0.04 });
    assert.equal(assertion.claim, '[REDACTED] [REDACTED]');
    assert.equal(assertion.probability, 0.04);
    assert.equal(events[1]?.data.observationSummary, '[REDACTED] [REDACTED]');
    assert.deepEqual(events[1]?.data.selector, { label: '[REDACTED]' });
    const report = buildScriptedReport(events);
    assert.equal(report.verdict, 'failed');
    assert.equal(report.checkpoints[0]?.stepId, planned[1]!.id);
    assert.equal(report.checkpoints[0]?.assertions[0]?.id, assertion.id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('two sensitive assertion IDs stay distinct and correlate with Noul answers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-id-redaction-'));
  try {
    const log = await createRunLog(root, 'ids', { values: ['a', 'b'] });
    await log.append('started', { mode: 'scripted' });
    await log.append('judgment', { stepId: 'verify', probabilities: { a: 0.99, b: 0.01 } });
    await log.append('checkpoint', { stepId: 'verify', status: 'failed', assertions: [
      { id: 'a', claim: 'a is visible', probability: 0.99 },
      { id: 'b', claim: 'b is visible', probability: 0.01 },
    ] });
    await log.append('verdict', { verdict: 'failed', reason: 'ASSERTION_FALSE', steps: 1 });
    const events = await log.read();
    const assertions = events[2]?.data.assertions as Array<{ id: string; claim: string; probability: number }>;
    assert.equal(new Set(assertions.map(item => item.id)).size, 2);
    assert.ok(assertions.every(item => /^redacted_[a-f0-9]{32}$/.test(item.id)));
    assert.deepEqual(Object.keys(events[1]?.data.probabilities as object), assertions.map(item => item.id));
    assert.deepEqual(Object.values(events[1]?.data.probabilities as object), [0.99, 0.01]);
    assert.ok(assertions.every(item => item.claim.includes('[REDACTED]')));
    assert.equal(buildScriptedReport(events).checkpoints[0]?.assertions.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unknown protocol-looking strings and regex characters remain literal-redacted', () => {
  assert.deepEqual(redact({ kind: 'a+b', action: 'a+b', status: 'a+b', code: 'a+b',
    model: 'a+b', claim: 'a+b and a.b', observationSummary: 'E' }, ['a+b', 'a.b', 'E']), {
    kind: '[REDACTED]', action: '[REDACTED]', status: '[REDACTED]',
    code: '[REDACTED]', model: '[REDACTED]',
    claim: '[REDACTED] and [REDACTED]', observationSummary: '[REDACTED]',
  });
});

test('interrupted final JSONL write remains readable without inventing a pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-evidence-'));
  try {
    const log = await createRunLog(root, 'interrupted');
    await log.append('started', {});
    await appendFile(join(root, 'interrupted/run.jsonl'), '{"version":');
    assert.equal(buildScriptedReport(await readRunEvents(root, 'interrupted')).verdict, 'inconclusive');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('watch serves evidence only with token and renders screen text as text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-watch-'));
  const log = await createRunLog(root, 'watch');
  await log.append('started', { goal: '<script>alert(1)</script>' });
  const watch = await startWatchServer(root);
  try {
    const url = new URL(watch.urlFor('watch'));
    assert.equal(url.hostname, '127.0.0.1');
    const endpoint = new URL('/events?run=watch', url);
    assert.equal((await fetch(endpoint)).status, 401);
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${url.searchParams.get('token')}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).events[0].data.goal, '<script>alert(1)</script>');
    const js = await (await fetch(new URL('/app.js', url))).text();
    assert.match(js, /textContent/); assert.doesNotMatch(js, /innerHTML/);
  } finally { await watch.close(); await rm(root, { recursive: true, force: true }); }
});

test('the evidence root carries a .gitignore that keeps every run out of git, and an existing one is kept', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-evidence-gitignore-'));
  try {
    await createRunLog(root, 'first');
    const written = await readFile(join(root, '.gitignore'), 'utf8');
    assert.match(written, /^\*$/m);
    await writeFile(join(root, '.gitignore'), 'custom\n');
    await createRunLog(root, 'second');
    assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), 'custom\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('device-layer processes never receive the TypeSafe API key', async () => {
  const { deviceEnvironment } = await import('../src/device/index.js');
  const environment = deviceEnvironment({ TYPESAFE_API_KEY: 'secret-key', PATH: '/usr/bin', JEV_DEVICE_UDID: 'x' });
  assert.equal(environment.TYPESAFE_API_KEY, undefined);
  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.MOBILEBUILDMCP_SENTRY_DISABLED, 'true');
});
