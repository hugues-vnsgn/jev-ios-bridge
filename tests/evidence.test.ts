import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunLog, readRunEvents } from '../src/log/index.js';
import { buildReport, renderReport } from '../src/report/index.js';
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
    await log.append('step', { step: 1, checkpointId: 'settings', observationSummary: 'Settings visible' });
    await log.append('checkpoint', { checkpointId: 'settings', status: 'passed', step: 1,
      goalReachedProbability: 0.99,
      assertions: [{ id: 'settings:unit', claim: 'Fahrenheit is selected', probability: 0.98 }],
    });
    await log.append('verdict', { verdict: 'inconclusive', reason: 'Step limit 1 reached' });
    const text = renderReport(buildReport(await log.read()));
    assert.match(text, /Current checkpoint: home: Home visible/);
    assert.doesNotMatch(text, /Current checkpoint: settings/);
    assert.match(text, /Fahrenheit is selected/);
    assert.match(text, /"probability":0.98/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
