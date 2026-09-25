import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunLog, readRunEvents, redact } from '../src/log/index.js';
import { buildReport, renderReport } from '../src/report/index.js';
import { buildScriptedReport } from '../src/scripted/report.js';
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
    assert.equal(buildReport(events).verdict, 'failed');
    assert.equal(buildReport(events).inputTokens, 50);
    assert.match(renderReport(buildReport(events)), /Assertion false/);
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

test('legacy checkpoint and option IDs are pseudonymized consistently across events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-legacy-id-redaction-'));
  try {
    const log = await createRunLog(root, 'legacy', { values: ['a', 'b'] });
    await log.append('started', { checkpoints: [{ id: 'a', goal: 'b',
      assertions: [{ id: 'b', claim: 'b is visible' }] }] });
    await log.append('judgment', { checkpointId: 'a', judgment: {
      choice: 'type:e1:a', probabilities: { 'type:e1:a': 0.8 }, assertions: { b: 0.01 },
    } });
    const events = await log.read();
    const checkpoint = (events[0]?.data.checkpoints as Array<{ id: string; assertions: Array<{ id: string }> }>)[0]!;
    const judgment = events[1]?.data.judgment as { choice: string; probabilities: Record<string, number>;
      assertions: Record<string, number> };
    assert.equal(events[1]?.data.checkpointId, checkpoint.id);
    assert.match(checkpoint.id, /^redacted_[a-f0-9]{32}$/);
    assert.match(checkpoint.assertions[0]!.id, /^redacted_[a-f0-9]{32}$/);
    assert.equal(judgment.choice, Object.keys(judgment.probabilities)[0]);
    assert.deepEqual(judgment.assertions, { [checkpoint.assertions[0]!.id]: 0.01 });
    assert.doesNotMatch(await readFile(join(root, 'legacy/run.jsonl'), 'utf8'), /type:e1:a|"goal":"b"/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('interrupted final JSONL write remains readable without inventing a pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-evidence-'));
  try {
    const log = await createRunLog(root, 'interrupted');
    await log.append('started', {});
    await appendFile(join(root, 'interrupted/run.jsonl'), '{"version":');
    assert.equal(buildReport(await readRunEvents(root, 'interrupted')).verdict, 'inconclusive');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('watch serves evidence only with token and renders screen text as text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-watch-'));
  const log = await createRunLog(root, 'watch');
  await log.append('started', { goal: '<script>alert(1)</script>' });
  const watch = await startWatchServer(root);
  try {
    const url = new URL(watch.url);
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

test('report keeps assertion evidence ahead of large choice distributions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-report-'));
  try {
    const log = await createRunLog(root, 'diagnosis');
    await log.append('started', { goal: 'Reach checkout', assertions: [{ id: 'total', claim: 'The total is $5' }] });
    await log.append('step', { observationSummary: 'Confirmation screen. Total: $3.' });
    await log.append('judgment', { judgment: {
      choice: 'stop-goal', confidence: 0.99,
      probabilities: Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['long-candidate-option-' + i, 0])),
      goalReached: 0.99, assertions: { total: 0.01 },
    } });
    await log.append('verdict', { verdict: 'failed', reason: 'Assertion false' });
    const text = renderReport(buildReport(await log.read()));
    assert.match(text, /The total is \$5/);
    assert.match(text, /"total":0.01/);
    assert.match(text, /Total: \$3/);
    assert.doesNotMatch(text, /long-candidate-option/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('report names the pending checkpoint when the budget ends between checkpoints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-report-boundary-'));
  try {
    const log = await createRunLog(root, 'boundary');
    await log.append('started', { checkpoints: [
      { id: 'settings', goal: 'Settings visible', assertions: [] },
      { id: 'home', goal: 'Home visible', assertions: [] },
    ] });
    const shot = join(root, 'settings.jpg');
    await writeFile(shot, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await log.append('step', { step: 1, checkpointId: 'settings', observationSummary: 'Settings screen proves °C selected', screenshotPath: shot });
    await log.append('checkpoint', { checkpointId: 'settings', status: 'passed', step: 1,
      snapshotSequence: 41, deviceId: 'sim-test', goalReachedProbability: 0.99,
      assertions: [{ id: 'settings:unit', claim: 'Celsius is selected', probability: 0.98 }],
    });
    await log.append('verdict', { verdict: 'inconclusive', reason: 'Step limit 1 reached' });
    const text = renderReport(buildReport(await log.read()));
    assert.match(text, /Current checkpoint: home: Home visible/);
    assert.doesNotMatch(text, /Current checkpoint: settings/);
    assert.match(text, /Celsius is selected/);
    assert.match(text, /"probability":0.98/);
    assert.match(text, /Settings screen proves °C selected/);
    assert.match(text, /screen-2\.jpg/);
    assert.match(text, /snapshot sequence 41/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('report links each earlier checkpoint to its own screen, not the final detail screen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-report-checkpoints-'));
  try {
    const log = await createRunLog(root, 'weather');
    await log.append('started', { checkpoints: [
      { id: 'settings', goal: 'Settings verified', assertions: [] },
      { id: 'home', goal: 'Home verified', assertions: [] },
      { id: 'detail', goal: 'Detail verified', assertions: [] },
    ] });
    for (const [index, id, summary] of [
      [1, 'settings', `Settings shows Celsius and km. ${'x'.repeat(1_000)}`],
      [2, 'home', 'London Home shows 11 degrees.'],
      [3, 'detail', 'Precipitation detail shows 78 percent.'],
    ] as const) {
      const source = join(root, `${id}.jpg`);
      await writeFile(source, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      await log.append('step', { step: index, checkpointId: id, observationSummary: summary, screenshotPath: source });
      await log.append('checkpoint', { checkpointId: id, status: 'passed', step: index,
        snapshotSequence: 40 + index, deviceId: 'sim-test', goalReachedProbability: 0.99, assertions: [] });
    }
    await log.append('verdict', { verdict: 'passed', reason: 'All checkpoints passed' });
    const text = renderReport(buildReport(await log.read()));
    const settings = text.slice(text.indexOf('Checkpoint settings:'), text.indexOf('Checkpoint home:'));
    const home = text.slice(text.indexOf('Checkpoint home:'), text.indexOf('Checkpoint detail:'));
    const detail = text.slice(text.indexOf('Checkpoint detail:'));
    assert.match(settings, /Settings shows Celsius and km\./);
    assert.match(settings, /screen-2\.jpg/);
    assert.match(settings, /\[truncated; \d+ more characters in the run log\]/);
    assert.match(home, /London Home shows 11 degrees\./);
    assert.match(home, /screen-4\.jpg/);
    assert.match(detail, /Precipitation detail shows 78 percent\./);
    assert.match(detail, /screen-6\.jpg/);
    assert.match(text, /snapshot sequence 41; device sim-test/);
    assert.doesNotMatch(settings, /Precipitation detail/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a long checkpoint report marks its overall output limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-report-bounded-'));
  try {
    const log = await createRunLog(root, 'bounded');
    await log.append('started', { checkpoints: Array.from({ length: 10 }, (_, index) => ({
      id: `stage${index + 1}`, goal: `Stage ${index + 1}`, assertions: [],
    })) });
    for (let step = 1; step <= 10; step++) {
      await log.append('step', { step, checkpointId: `stage${step}`, observationSummary: 'S'.repeat(1_000),
        ...(step === 10 ? { logTails: { app: 'L'.repeat(5_000) } } : {}) });
      await log.append('checkpoint', { checkpointId: `stage${step}`, step, status: 'passed',
        assertions: [{ id: `stage${step}:claim`, claim: 'C'.repeat(1_000), probability: 0.99 }] });
    }
    for (let index = 0; index < 8; index++) await log.append('error', { message: 'E'.repeat(3_000) });
    await log.append('verdict', { verdict: 'passed', reason: 'All stages passed' });
    const text = renderReport(buildReport(await log.read()));
    assert.ok(text.length < 31_000);
    assert.match(text, /\[truncated; \d+ more characters in the run log\]$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
