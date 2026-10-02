/**
 * The watch page for driven runs (Issue 10): it shows Jev's decisions, the target search, each hand-back with Claude's
 * answer and wait, the preflight, the start mode, and a paused run's needs_claude state; its title names the run's
 * platform. The page's script runs against a minimal fake DOM, over a real watch server reading a recorded log.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { RunEvent } from '../src/contracts/index.js';
import { createRunLog } from '../src/log/index.js';
import { startWatchServer } from '../src/watch/index.js';

interface FakeNode { tag: string; textContent: string; className: string; children: FakeNode[]; append(...nodes: FakeNode[]): void }

function node(tag: string): FakeNode {
  const created: FakeNode = { tag, textContent: '', className: '', children: [],
    append(...nodes) { created.children.push(...nodes); } };
  return created;
}

function texts(root: FakeNode): string[] {
  return [root.textContent, ...root.children.flatMap(texts)].filter(Boolean);
}

/** Runs the page's script once against the watch server, and returns what it rendered. */
async function renderPage(entries: Array<[RunEvent['type'], Record<string, unknown>]>) {
  const root = await mkdtemp(join(tmpdir(), 'jev-watch-driven-'));
  const watch = await startWatchServer(root);
  try {
    const log = await createRunLog(root, 'driven-watch');
    for (const [type, data] of entries) await log.append(type, data);
    const url = new URL(watch.urlFor('driven-watch'));
    const script = await (await fetch(new URL('/app.js', url))).text();
    const status = node('p');
    const heading = node('h1');
    const timeline = node('section');
    const document = { title: 'Verification run',
      querySelector: (selector: string) => ({ '#status': status, '#timeline': timeline, h1: heading })[selector],
      createElement: node };
    let rendered!: () => void;
    const done = new Promise<void>(resolve => { rendered = resolve; });
    const run = new Function('document', 'location', 'fetch', 'setTimeout', 'URL', script);
    run(document, { search: url.search }, (path: string, init: RequestInit) => fetch(new URL(path, url), init),
      () => rendered(), { createObjectURL: () => 'blob:fake' });
    await done;
    return { title: document.title, heading: heading.textContent, status: status.textContent,
      cards: timeline.children.map(card => texts(card).join('\n')) };
  } finally { await watch.close(); await rm(root, { recursive: true, force: true }); }
}

const started = (extra: Record<string, unknown> = {}): [RunEvent['type'], Record<string, unknown>] => ['started', {
  mode: 'scripted', bundleId: 'com.example.app', bridgeVersion: '1.3.0', jevModel: 'jev-1.13.0',
  plannedSteps: [{ id: 'signIn', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }], ...extra }];

test('a paused driven run shows its decisions, search, hand-back, and that it waits for Claude', async () => {
  const page = await renderPage([
    started({ platform: 'android', package: 'com.example.android', bundleId: null, start: 'attach' }),
    ['preflight', { status: 'failed', exitCode: 3, failure: 'exit', durationMs: 12 }],
    ['decision', { step: 1, stepId: 'signIn', decision: 1, options: 6, choice: 'none_fits', confidence: 0.62, done: 0.04,
      inputTokens: 400, latencyMs: 300 }],
    ['search', { step: 1, stepId: 'signIn', direction: 'down', attempt: 1, changed: false, actDurationMs: 40 }],
    ['handback', { step: 1, stepId: 'signIn', reason: 'NONE_FITS', pauseId: 'p-1' }],
  ]);
  assert.equal(page.title, 'Android verification run');
  assert.equal(page.heading, 'Android verification run');
  assert.equal(page.status, 'Waiting for Claude (needs_claude): step signIn, NONE_FITS.');
  const all = page.cards.join('\n---\n');
  assert.match(all, /Start: attach/);
  assert.match(all, /Preflight failed, exit code 3 \(exit\)\./);
  assert.match(all, /Jev decision 1: none_fits, confidence 62%; step done 4%\./);
  assert.match(all, /Scrolled down \(attempt 1\): no change\./);
  assert.match(all, /Step signIn handed back to Claude: NONE_FITS\./);
});

test('an answered hand-back shows Claude\'s answer kind and wait, and each action who decided it', async () => {
  const page = await renderPage([
    started(),
    ['handback', { step: 1, stepId: 'signIn', reason: 'LOCAL_ONLY_STEP', pauseId: 'p-1' }],
    ['handback_answer', { step: 1, stepId: 'signIn', pauseId: 'p-1', kind: 'tap' }],
    ['action', { step: 1, stepId: 'signIn', action: 'tap', resolvedRef: 'b1', decidedBy: 'claude', actDurationMs: 4 }],
    ['action', { step: 1, stepId: 'signIn', action: 'type', resolvedRef: 'f1', valueKey: 'email', decidedBy: 'jev',
      key: 'type:f1:email', confidence: 0.95, actDurationMs: 4 }],
    ['verdict', { verdict: 'passed', reason: 'ALL_CHECKPOINTS_PASSED', steps: 2, inputTokens: 10, durationMs: 9 }],
  ]);
  assert.equal(page.title, 'iOS verification run');
  assert.equal(page.status, 'passed: ALL_CHECKPOINTS_PASSED');
  const all = page.cards.join('\n---\n');
  assert.match(all, /Claude answered tap after \d+ s\./);
  assert.match(all, /Step 1: tap on b1, decided by Claude\./);
  assert.match(all, /Step 1: type on f1, decided by Jev \(confidence 95%\)\./);
});

test('a version 1 run\'s actions read as before, with no decider', async () => {
  const page = await renderPage([
    started({ plannedSteps: [{ id: 'open', kind: 'action' }] }),
    ['action', { step: 1, stepId: 'open', action: 'tap', resolvedRef: 'o1', actDurationMs: 4 }],
  ]);
  assert.ok(page.cards.some(card => card.includes('Step 1: tap on o1\n')), page.cards.join('\n'));
  assert.doesNotMatch(page.cards.join('\n'), /decided by/);
});
