import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { ScriptedJudge, ScriptedScenario } from '../spikes/scripted/contracts.js';
import { StaleSnapshotError } from '../src/device/index.js';
import { assertScreenGuard, resolveActionTarget, ScriptSelectionError } from '../spikes/scripted/select.js';
import { runScriptedScenario } from '../spikes/scripted/run.js';
import { buildScriptedReport, renderScriptedReport } from '../spikes/scripted/report.js';

function snapshot(elements: Element[], truncated = false): Snapshot {
  return { deviceId: 'sim', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: 1, elements, truncated, screenHash: 'screen-a' };
}

const apple: Element = { ref: 'e1', role: 'button', label: 'Add Apple', identifier: 'choose.apple',
  frame: { x: 20, y: 100, width: 200, height: 60 }, state: { enabled: true, visible: true }, actions: ['tap'] };

test('selector resolves one physical target across contained vendor aliases', () => {
  const alias: Element = { ...apple, ref: 'e2', frame: { x: 25, y: 105, width: 190, height: 50 } };
  const captured = snapshot([apple, alias]);
  assert.equal(resolveActionTarget(captured, { identifier: 'choose.apple' }, 'tap').ref, 'e1');
  assert.doesNotThrow(() => assertScreenGuard(captured, { present: [{ identifier: 'choose.apple' }] }));
});

test('same identity at distant frames remains ambiguous', () => {
  const separate: Element = { ...apple, ref: 'e3', frame: { x: 20, y: 300, width: 200, height: 60 } };
  const captured = snapshot([apple, separate]);
  assert.throws(() => resolveActionTarget(captured, { identifier: 'choose.apple' }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_AMBIGUOUS');
  assert.throws(() => assertScreenGuard(captured, { present: [{ identifier: 'choose.apple' }] }),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'GUARD_AMBIGUOUS');
});

test('Nolan same-frame button aliases resolve one tap target without a vendor identifier', () => {
  // The pinned MobileBuild capture 1gps7nb exposes these two refs for one Nolan photo button.
  const label = 'Contact photo for Nolan Ames';
  const nolan: Element = { ref: 'e30', role: 'button', label,
    frame: { x: 22, y: 112, width: 40, height: 40 },
    state: { enabled: true, visible: true }, actions: ['tap', 'longPress', 'touch'] };
  const alias: Element = { ...nolan, ref: 'e117' };
  const captured = snapshot([alias, nolan]);
  assert.throws(() => resolveActionTarget(captured, { role: 'button', label }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_AMBIGUOUS');
  assert.throws(() => assertScreenGuard(captured, { present: [{ role: 'button', label }] }),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'GUARD_AMBIGUOUS');
  const pinned = { tapAliasRule: 'mobilebuildmcp-2.7.1' } as const;
  assert.equal(resolveActionTarget(captured, { role: 'button', label }, 'tap', pinned).ref, 'e30');
  assert.doesNotThrow(() => assertScreenGuard(captured,
    { present: [{ role: 'button', label }] }, pinned));
});

test('unidentified tap buttons with different frames or actions remain ambiguous', () => {
  const label = 'Contact photo for Nolan Ames';
  const nolan: Element = { ref: 'e30', role: 'button', label,
    frame: { x: 22, y: 112, width: 40, height: 40 },
    state: { enabled: true, visible: true }, actions: ['tap', 'longPress', 'touch'] };
  const differentFrame: Element = { ...nolan, ref: 'e117', frame: { x: 22, y: 172, width: 40, height: 40 } };
  const differentActions: Element = { ...nolan, ref: 'e117', actions: ['tap', 'touch'] };
  const differentValue: Element = { ...nolan, ref: 'e117', value: 'different' };
  const pinned = { tapAliasRule: 'mobilebuildmcp-2.7.1' } as const;
  for (const other of [differentFrame, differentActions, differentValue]) {
    const captured = snapshot([nolan, other]);
    assert.throws(() => resolveActionTarget(captured, { role: 'button', label }, 'tap', pinned),
      (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_AMBIGUOUS');
    assert.throws(() => assertScreenGuard(captured,
      { present: [{ role: 'button', label }] }, pinned),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'GUARD_AMBIGUOUS');
  }
});

test('same-frame no-identifier aliases are not generalized to typing or swiping', () => {
  const frame = { x: 22, y: 112, width: 40, height: 40 };
  const state = { enabled: true, visible: true };
  const field: Element = { ref: 'e30', role: 'text-field', label: 'Email', frame, state,
    actions: ['tap', 'typeText'] };
  const scroll: Element = { ref: 'e30', role: 'scroll-view', label: 'List', frame, state,
    actions: ['swipeWithin'] };
  assert.throws(() => resolveActionTarget(snapshot([field, { ...field, ref: 'e117' }]),
    { role: 'text-field', label: 'Email' }, 'typeText', { tapAliasRule: 'mobilebuildmcp-2.7.1' }),
  (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_AMBIGUOUS');
  assert.throws(() => resolveActionTarget(snapshot([scroll, { ...scroll, ref: 'e117' }]),
    { role: 'scroll-view', label: 'List' }, 'swipeWithin', { tapAliasRule: 'mobilebuildmcp-2.7.1' }),
  (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_AMBIGUOUS');
});

test('missing, disabled, offscreen, and truncated targets fail before action', () => {
  const { frame: _frame, state: _state, ...missingMetadata } = apple;
  assert.throws(() => resolveActionTarget(snapshot([apple]), { identifier: 'missing' }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_MISSING');
  assert.throws(() => resolveActionTarget(snapshot([{ ...apple, state: { enabled: false, visible: true } }]),
    { identifier: 'choose.apple' }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_UNAVAILABLE');
  assert.throws(() => resolveActionTarget(snapshot([{ ...apple, frame: { x: 20, y: 100, width: 0, height: 60 } }]),
    { identifier: 'choose.apple' }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_UNAVAILABLE');
  assert.throws(() => resolveActionTarget(snapshot([apple], true), { identifier: 'choose.apple' }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'SNAPSHOT_TRUNCATED');
  assert.throws(() => resolveActionTarget(snapshot([missingMetadata]),
    { identifier: 'choose.apple' }, 'tap'),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'TARGET_UNAVAILABLE');
  assert.throws(() => assertScreenGuard(snapshot([missingMetadata]),
    { present: [{ identifier: 'choose.apple' }] }),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'GUARD_MISSING');
});

test('screen guards require unique present anchors and zero forbidden anchors', () => {
  const captured = snapshot([apple]);
  assert.throws(() => assertScreenGuard(captured, { present: [{ identifier: 'missing' }] }),
    (error: unknown) => error instanceof ScriptSelectionError && error.code === 'GUARD_MISSING');
  assert.throws(() => assertScreenGuard(captured, { present: [{ identifier: 'choose.apple' }],
    absent: [{ label: 'Add Apple' }] }),
  (error: unknown) => error instanceof ScriptSelectionError && error.code === 'GUARD_FORBIDDEN');
});

test('selector treats an empty value as an exact field, not as an omitted filter', () => {
  const empty: Element = { ...apple, ref: 'empty', value: '', actions: ['typeText'] };
  const filled: Element = { ...apple, ref: 'filled', value: 'London', actions: ['typeText'],
    frame: { x: 20, y: 300, width: 200, height: 60 } };
  assert.equal(resolveActionTarget(snapshot([empty, filled]),
    { identifier: 'choose.apple', value: '' }, 'typeText').ref, 'empty');
});

function memoryLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'scripted-1', sequence: events.length + 1,
      at: new Date().toISOString(), type, data }); },
    async read() { return events; },
  };
}

test('one submitted script prepares once, acts on a unique target, and passes a Noul-only checkpoint', async () => {
  const initial = snapshot([apple, { ref: 'title', role: 'text', label: 'Sample Shop', actions: [],
    frame: { x: 20, y: 20, width: 200, height: 30 }, state: { enabled: true, visible: true } }]);
  const selected = snapshot([{ ref: 'selection', role: 'text', label: 'Selected: Apple', actions: [],
    frame: { x: 20, y: 20, width: 200, height: 30 }, state: { enabled: true, visible: true } }]);
  const scripted: ScriptedScenario = {
    app: { bundleId: 'dev.jevbridge.diagnostic' }, values: {}, steps: [
      { id: 'addApple', kind: 'action', guard: { present: [{ label: 'Sample Shop' }] },
        action: { kind: 'tap', selector: { identifier: 'choose.apple' } } },
      { id: 'selected', kind: 'checkpoint', guard: { present: [{ label: 'Selected: Apple' }] },
        assertions: [{ id: 'apple', claim: 'Selected: Apple is visible' }] },
    ],
  };
  let prepares = 0;
  let closes = 0;
  let observes = 0;
  const actions: string[] = [];
  const driver: DeviceDriver = {
    async prepare() { prepares++; },
    async observe() { observes++; return observes === 1 ? initial : selected; },
    async act(action) { assert.equal(action.kind, 'tap'); if (action.kind === 'tap') actions.push(action.targetRef); },
    async close() { closes++; },
  };
  const judge: ScriptedJudge = { async judge(assertions, state) {
    assert.deepEqual(assertions, [{ id: 'apple', claim: 'Selected: Apple is visible' }]);
    assert.ok(state.includes('Selected: Apple'));
    assert.ok(!state.includes('Add Apple'));
    return { probabilities: { apple: 0.97 }, inputTokens: 21, latencyMs: 4, model: 'jev-1.13.0' };
  } };
  const log = memoryLog();
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, driver, judge, log });
  assert.equal(report.verdict, 'passed');
  assert.equal(report.inputTokens, 21);
  assert.equal(prepares, 1);
  assert.equal(closes, 1);
  assert.equal(observes, 2);
  assert.deepEqual(actions, ['e1']);
  assert.deepEqual(log.events.map(event => event.type),
    ['started', 'prepared', 'step', 'action', 'step', 'judgment', 'checkpoint', 'verdict']);
});

test('ambiguous targets stop inconclusively before any device action', async () => {
  const heading: Element = { ref: 'h', role: 'text', label: 'Form', actions: [],
    frame: { x: 0, y: 0, width: 200, height: 30 }, state: { enabled: true, visible: true } };
  const { identifier: _identifier, ...buttonWithoutId } = apple;
  const first: Element = { ...buttonWithoutId, ref: 'a', label: 'Submit' };
  const second: Element = { ...first, ref: 'b', frame: { x: 20, y: 300, width: 200, height: 60 } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'submit', kind: 'action', guard: { present: [{ label: 'Form' }] },
      action: { kind: 'tap', selector: { label: 'Submit' } } },
    { id: 'result', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done is visible' }] },
  ] };
  let acts = 0;
  let closes = 0;
  const log = memoryLog();
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log,
    driver: { async prepare() {}, async observe() { return snapshot([heading, first, second]); },
      async act() { acts++; }, async close() { closes++; } },
    judge: { async judge() { assert.fail('A missing target must not query Jev'); } } });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'TARGET_AMBIGUOUS');
  assert.equal(acts, 0);
  assert.equal(closes, 1);
  assert.equal(log.events.find(event => event.type === 'error')?.data.code, 'TARGET_AMBIGUOUS');
});

test('checkpoint false fails and uncertain abstains with recorded probabilities', async () => {
  const marker: Element = { ref: 'm', role: 'text', label: 'Order complete', actions: [],
    frame: { x: 0, y: 0, width: 200, height: 30 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'total', kind: 'checkpoint', guard: { present: [{ label: 'Order complete' }] },
      assertions: [{ id: 'correct', claim: 'Total is $5' }] },
  ] };
  for (const [probability, expected] of [[0.05, 'failed'], [0.5, 'inconclusive']] as const) {
    const log = memoryLog();
    const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log,
      driver: { async prepare() {}, async observe() { return snapshot([marker]); },
        async act() { assert.fail('No action in this script'); }, async close() {} },
      judge: { async judge() { return { probabilities: { correct: probability }, inputTokens: 12,
        latencyMs: 2, model: 'jev-1.13.0' }; } } });
    assert.equal(report.verdict, expected);
    assert.equal(report.checkpoints[0]?.status, expected);
    assert.equal(report.checkpoints[0]?.assertions[0]?.probability, probability);
  }
});

test('checkpoint refuses an assertion judgment from a different model', async () => {
  const marker: Element = { ref: 'm', role: 'text', label: 'Ready', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'ready', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'ready', claim: 'Ready is visible' }] },
  ] };
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    driver: { async prepare() {}, async observe() { return snapshot([marker]); }, async act() {}, async close() {} },
    judge: { async judge() { return { probabilities: { ready: 0.99 }, inputTokens: 1, latencyMs: 1, model: 'other-model' }; } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'INVALID_JUDGMENT');
});

test('stale reference retries only after a same-screen guard and unique selector refresh', async () => {
  const heading: Element = { ref: 'heading', role: 'text', label: 'Shop', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 30 }, state: { enabled: true, visible: true } };
  const before = snapshot([heading, apple]);
  const refreshed = snapshot([heading, { ...apple, ref: 'e2' }]);
  const done = snapshot([{ ...heading, label: 'Done' }]);
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.shop' }, values: {}, steps: [
    { id: 'add', kind: 'action', guard: { present: [{ label: 'Shop' }] },
      action: { kind: 'tap', selector: { identifier: 'choose.apple' } } },
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  let observes = 0;
  const refs: string[] = [];
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    driver: { async prepare() {}, async observe() { observes++; return observes === 1 ? before : observes === 2 ? refreshed : done; },
      async act(action) { if (action.kind === 'tap') refs.push(action.targetRef); if (refs.length === 1) throw new StaleSnapshotError(); },
      async close() {} },
    judge: { async judge() { return { probabilities: { done: 0.98 }, inputTokens: 8, latencyMs: 1, model: 'jev-1.13.0' }; } },
  });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(refs, ['e1', 'e2']);
  assert.equal(observes, 3);
});

test('phase timings include stale retry work, wait polling, and checkpoint judgment', async () => {
  const visible = (label: string): Element => ({ ref: label, role: 'text', label, actions: [],
    frame: { x: 0, y: 0, width: 100, height: 30 }, state: { enabled: true, visible: true } });
  const initial = snapshot([visible('Shop'), apple]);
  const refreshed = snapshot([visible('Shop'), { ...apple, ref: 'e2' }]);
  const loading = snapshot([visible('Loading')]);
  const done = snapshot([visible('Done')]);
  const script: ScriptedScenario = { app: { bundleId: 'com.example.shop' }, values: {}, steps: [
    { id: 'add', kind: 'action', guard: { present: [{ label: 'Shop' }] },
      action: { kind: 'tap', selector: { identifier: 'choose.apple' } } },
    { id: 'load', kind: 'wait', guard: { present: [{ label: 'Loading' }] },
      until: { present: [{ label: 'Done' }] }, timeoutMs: 100 },
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'ready', claim: 'Done is visible' }] },
  ] };
  let captures = 0;
  let actions = 0;
  const log = memoryLog();
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: script, log,
    limits: { pollIntervalMs: 8 },
    driver: {
      async prepare() { await delay(8); },
      async observe() { await delay(8); captures++; return [initial, refreshed, loading, done, done][captures - 1]!; },
      async act() { await delay(8); actions++; if (actions === 1) throw new StaleSnapshotError(); },
      async close() { await delay(8); },
    },
    judge: { async judge() { await delay(8); return { probabilities: { ready: 0.99 },
      inputTokens: 3, latencyMs: 2, model: 'jev-1.13.0' }; } },
  });
  assert.equal(report.verdict, 'passed');
  const totals = report.events.at(-1)?.data.phaseTimingsMs as Record<string, number>;
  for (const phase of ['prepareMs', 'observeMs', 'decideMs', 'actMs', 'waitMs', 'cleanupMs']) {
    assert.ok(Number.isFinite(totals[phase]) && totals[phase]! >= 0, phase);
  }
  assert.ok(totals.prepareMs! >= 5);
  assert.ok(totals.observeMs! >= 30, 'all five captures, including stale retry and wait poll, count');
  assert.ok(totals.actMs! >= 12, 'both attempted actions count');
  assert.ok(totals.waitMs! >= 5);
  assert.ok(totals.decideMs! >= 5);
  assert.ok(totals.cleanupMs! >= 5);
  assert.equal(log.events.filter(event => event.type === 'step').length, 5);
  assert.ok(log.events.filter(event => event.type === 'step').every(event =>
    typeof event.data.observeDurationMs === 'number'));
  const acted = log.events.find(event => event.type === 'action' && event.data.stepId === 'add');
  assert.ok((acted?.data.actDurationMs as number) >= 12);
  assert.ok((acted?.data.stepDurationMs as number) >= totals.actMs!);
  assert.ok((log.events.find(event => event.type === 'judgment')?.data.decideDurationMs as number) >= 5);
});

test('failed prepare still records elapsed phase totals and cleanup', async () => {
  const script: ScriptedScenario = { app: { bundleId: 'com.example.shop' }, values: {}, steps: [
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'ready', claim: 'Done is visible' }] },
  ] };
  const failed = await runScriptedScenario({ runId: 'scripted-1', scenario: script, log: memoryLog(),
    driver: { async prepare() { await delay(8); throw new Error('prepare failed'); },
      async observe() { assert.fail('No capture after failed prepare'); }, async act() {},
      async close() { await delay(8); } },
    judge: { async judge() { assert.fail('No judgment after failed prepare'); } },
  });
  assert.equal(failed.verdict, 'inconclusive');
  const totals = failed.events.at(-1)?.data.phaseTimingsMs as Record<string, number>;
  assert.ok(totals.prepareMs! >= 5);
  assert.ok(totals.cleanupMs! >= 5);
  assert.equal(totals.observeMs, 0);
  assert.equal(totals.decideMs, 0);
});

test('failed action records its elapsed duration and failed step', async () => {
  const script: ScriptedScenario = { app: { bundleId: 'com.example.shop' }, values: {}, steps: [
    { id: 'add', kind: 'action', guard: { present: [{ identifier: 'choose.apple' }] },
      action: { kind: 'tap', selector: { identifier: 'choose.apple' } } },
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'ready', claim: 'Done is visible' }] },
  ] };
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: script, log: memoryLog(),
    driver: { async prepare() {}, async observe() { return snapshot([apple]); },
      async act() { await delay(8); throw new Error('action failed'); }, async close() {} },
    judge: { async judge() { assert.fail('No judgment after failed action'); } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'EXECUTION_ERROR');
  const totals = report.events.at(-1)?.data.phaseTimingsMs as Record<string, number>;
  assert.ok(totals.actMs! >= 5);
  const error = report.events.find(event => event.type === 'error');
  assert.equal(error?.data.phase, 'act');
  assert.ok((error?.data.stepDurationMs as number) >= totals.actMs!);
});

test('changed screen after stale reference never retries an input', async () => {
  const heading: Element = { ref: 'heading', role: 'text', label: 'Shop', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 30 }, state: { enabled: true, visible: true } };
  const before = snapshot([heading, apple]);
  const changed: Snapshot = { ...snapshot([heading, { ...apple, ref: 'e2' }]), screenHash: 'changed' };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.shop' }, values: {}, steps: [
    { id: 'add', kind: 'action', guard: { present: [{ label: 'Shop' }] },
      action: { kind: 'tap', selector: { identifier: 'choose.apple' } } },
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  let observes = 0;
  let acts = 0;
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    driver: { async prepare() {}, async observe() { observes++; return observes === 1 ? before : changed; },
      async act() { acts++; throw new StaleSnapshotError(); }, async close() {} },
    judge: { async judge() { assert.fail('Changed screen must not be judged'); } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'SCREEN_CHANGED');
  assert.equal(observes, 2);
  assert.equal(acts, 1);
});

test('pre-cancelled script does not dispatch device preparation', async () => {
  const abort = new AbortController();
  abort.abort();
  const marker: Element = { ref: 'm', role: 'text', label: 'Ready', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'ready', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'ready', claim: 'Ready visible' }] },
  ] };
  let prepares = 0;
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, signal: abort.signal, log: memoryLog(),
    driver: { async prepare() { prepares++; }, async observe() { return snapshot([marker]); },
      async act() {}, async close() {} }, judge: { async judge() { assert.fail('No judgment after cancellation'); } } });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(prepares, 0);
});

test('wall deadline ends a non-cooperative device observation', async () => {
  const marker: Element = { ref: 'm', role: 'text', label: 'Ready', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'ready', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'ready', claim: 'Ready visible' }] },
  ] };
  let acknowledge: (() => void) | undefined;
  const run = runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(), limits: { wallTimeMs: 10 },
    driver: { async prepare() {}, async observe() { await new Promise<void>(done => { acknowledge = done; }); return snapshot([marker]); },
      async act() {}, async close() {} }, judge: { async judge() {
        return { probabilities: { ready: 0.99 }, inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' };
      } } });
  try {
    const result = await Promise.race([run, new Promise<null>(done => setTimeout(() => done(null), 60))]);
    assert.ok(result, 'global wall deadline should end an uncooperative observation');
    assert.equal(result.verdict, 'inconclusive');
    assert.equal(result.reason, 'WALL_LIMIT');
  } finally { acknowledge?.(); await run; }
});

test('wrong-screen guard records the fresh capture before stopping', async () => {
  const unexpected: Element = { ref: 'u', role: 'text', label: 'Unexpected screen', actions: [],
    frame: { x: 0, y: 0, width: 200, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'ready', kind: 'checkpoint', guard: { present: [{ label: 'Ready' }] },
      assertions: [{ id: 'ready', claim: 'Ready visible' }] },
  ] };
  const log = memoryLog();
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log,
    driver: { async prepare() {}, async observe() { return snapshot([unexpected]); },
      async act() {}, async close() {} }, judge: { async judge() { assert.fail('Wrong screen must not be judged'); } } });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'GUARD_MISSING');
  assert.equal(log.events.find(event => event.type === 'step')?.data.observationSummary, 'text Unexpected screen');
  assert.match(renderScriptedReport(report), /Execution problem: GUARD_MISSING during observe/);
  assert.match(renderScriptedReport(report), /Last observed screen:\ntext Unexpected screen/);
});

test('wait stops on an unexpected third screen instead of polling until timeout', async () => {
  const element = (label: string): Element => ({ ref: label, role: 'text', label, actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } });
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'loading', kind: 'wait', guard: { present: [{ label: 'Loading' }] },
      until: { present: [{ label: 'Done' }] }, timeoutMs: 50 },
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  let observes = 0;
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    limits: { pollIntervalMs: 1 },
    driver: { async prepare() {}, async observe() { observes++; return snapshot([element(observes === 1 ? 'Loading' : 'Error')]); },
      async act() {}, async close() {} }, judge: { async judge() { assert.fail('Unexpected screen must not be judged'); } } });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'GUARD_MISSING');
  assert.equal(observes, 2);
});

test('global step budget stops before an unexecuted checkpoint', async () => {
  const title: Element = { ref: 'title', role: 'text', label: 'Shop', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.shop' }, values: {}, steps: [
    { id: 'add', kind: 'action', guard: { present: [{ label: 'Shop' }] },
      action: { kind: 'tap', selector: { identifier: 'choose.apple' } } },
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  let observes = 0;
  let acts = 0;
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    limits: { maxSteps: 1 },
    driver: { async prepare() {}, async observe() { observes++; return snapshot([title, apple]); },
      async act() { acts++; }, async close() {} },
    judge: { async judge() { assert.fail('The checkpoint lies beyond the global budget'); } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'STEP_LIMIT');
  assert.equal(report.steps, 1);
  assert.equal(observes, 1);
  assert.equal(acts, 1);
});

test('bounded wait observes the desired screen before the next checkpoint', async () => {
  const element = (label: string): Element => ({ ref: label, role: 'text', label, actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } });
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'loading', kind: 'wait', guard: { present: [{ label: 'Loading' }] },
      until: { present: [{ label: 'Done' }] }, timeoutMs: 100 },
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  let observes = 0;
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    limits: { pollIntervalMs: 1 },
    driver: { async prepare() {}, async observe() { observes++; return snapshot([element(observes === 1 ? 'Loading' : 'Done')]); },
      async act() {}, async close() {} },
    judge: { async judge() { return { probabilities: { done: 0.99 }, inputTokens: 2, latencyMs: 1, model: 'jev-1.13.0' }; } },
  });
  assert.equal(report.verdict, 'passed');
  assert.equal(observes, 3);
  assert.equal(report.steps, 2);
  assert.ok(report.events.some(event => event.type === 'step' && event.data.poll === 1));
});

test('wait timeout remains inconclusive and does not query Jev', async () => {
  const loading: Element = { ref: 'loading', role: 'text', label: 'Loading', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'loading', kind: 'wait', guard: { present: [{ label: 'Loading' }] },
      until: { present: [{ label: 'Done' }] }, timeoutMs: 5 },
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    limits: { pollIntervalMs: 1 },
    driver: { async prepare() {}, async observe() { return snapshot([loading]); }, async act() {}, async close() {} },
    judge: { async judge() { assert.fail('Timed-out wait must not query Jev'); } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'WAIT_TIMEOUT');
});

test('cleanup failure prevents a pass even after assertion proof was recorded', async () => {
  const done: Element = { ref: 'done', role: 'text', label: 'Done', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  const report = await runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(),
    driver: { async prepare() {}, async observe() { return snapshot([done]); }, async act() {},
      async close() { throw new Error('stop failed'); } },
    judge: { async judge() { return { probabilities: { done: 0.99 }, inputTokens: 2, latencyMs: 1, model: 'jev-1.13.0' }; } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'CLEANUP_FAILED');
  assert.equal(report.checkpoints[0]?.status, 'passed');
});

test('cancellation waits for pending action acknowledgement before cleanup completes', { timeout: 2_000 }, async () => {
  const title: Element = { ref: 'title', role: 'text', label: 'Shop', actions: [],
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true } };
  const scripted: ScriptedScenario = { app: { bundleId: 'com.example.shop' }, values: {}, steps: [
    { id: 'add', kind: 'action', guard: { present: [{ label: 'Shop' }] },
      action: { kind: 'tap', selector: { identifier: 'choose.apple' } } },
    { id: 'done', kind: 'checkpoint', guard: { present: [{ label: 'Done' }] },
      assertions: [{ id: 'done', claim: 'Done visible' }] },
  ] };
  const abort = new AbortController();
  let actionStarted!: () => void;
  const started = new Promise<void>(done => { actionStarted = done; });
  let acknowledge!: () => void;
  const acknowledged = new Promise<void>(done => { acknowledge = done; });
  let closed = false;
  const run = runScriptedScenario({ runId: 'scripted-1', scenario: scripted, log: memoryLog(), signal: abort.signal,
    driver: { async prepare() {}, async observe() { return snapshot([title, apple]); },
      async act() { actionStarted(); await acknowledged; },
      async close() { await acknowledged; closed = true; } },
    judge: { async judge() { assert.fail('Cancelled action cannot reach checkpoint'); } },
  });
  try {
    await started;
    abort.abort();
    await new Promise(done => setTimeout(done, 5));
    assert.equal(closed, false);
  } finally { acknowledge(); }
  const report = await run;
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'CANCELLED');
  assert.equal(closed, true);
  assert.equal(report.events.some(event => event.type === 'action'), false);
  const totals = report.events.at(-1)?.data.phaseTimingsMs as Record<string, number>;
  assert.ok(totals.actMs! > 0, 'aborted action time is retained');
  assert.ok(totals.cleanupMs! >= 0);
  assert.ok((report.events.find(event => event.type === 'error')?.data.stepDurationMs as number) > 0);
});

test('report shows the wrong total beside the expected claim and never passes an interrupted journal', () => {
  const base = { version: 1 as const, runId: 'diagnostic', at: '2026-09-24T00:00:00Z' };
  const events: RunEvent[] = [
    { ...base, sequence: 1, type: 'started', data: { mode: 'scripted', bundleId: 'dev.jevbridge.diagnostic' } },
    { ...base, sequence: 2, type: 'step', data: { step: 1, stepId: 'total',
      observationSummary: 'Order complete\nApple: $2\nBread: $3\nTotal: $3', screenshotPath: 'screen-2.jpg' } },
    { ...base, sequence: 3, type: 'checkpoint', data: { step: 1, stepId: 'total', status: 'failed',
      assertions: [{ id: 'expected_total', claim: 'The total is $5.', probability: 0.02 }] } },
    { ...base, sequence: 4, type: 'verdict', data: { verdict: 'failed', reason: 'ASSERTION_FALSE', steps: 1,
      inputTokens: 9, durationMs: 20 } },
  ];
  const rendered = renderScriptedReport(buildScriptedReport(events));
  assert.match(rendered, /The total is \$5/);
  assert.match(rendered, /Total: \$3/);
  assert.match(rendered, /screen-2\.jpg/);
  const interrupted = buildScriptedReport(events.slice(0, 3));
  assert.equal(interrupted.verdict, 'inconclusive');
  assert.match(renderScriptedReport(interrupted), /No final verdict recorded/);
});
