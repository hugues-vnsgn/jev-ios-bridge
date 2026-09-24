import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, appendFile, writeFile } from 'node:fs/promises';
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
