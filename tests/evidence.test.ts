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
    const log = await createRunLog(root, 'test', { values: ['private-value'] });
    await Promise.all([log.append('started', { goal: 'Type private-value' }), log.append('prepared', {})]);
    await log.append('verdict', { verdict: 'failed', reason: 'Assertion false', steps: 1, inputTokens: 50, durationMs: 100 });
    const events = await log.read();
    assert.deepEqual(events.map(event => event.sequence), [1, 2, 3]);
    assert.equal(events[0]?.data.goal, 'Type [REDACTED]');
    assert.equal(buildReport(events).verdict, 'failed');
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
