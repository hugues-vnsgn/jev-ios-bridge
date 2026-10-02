/**
 * Fixes from Codex review round 4 (Issue 18, `.worktrees/handoffs/jev-drives/codex-review-round4.md`), one
 * regression per finding, each reproducing the review's probe: (1) the pause text never prints a rejected number
 * rounded up to its threshold, and says whether each threshold was met; (2) a DECISION_BUDGET hand-back keeps the
 * decision Jev made on the paused screen; (3) a `do` step whose first observation failed is listed in the report.
 * Fakes only: no device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { createHandbackGate, renderPause } from '../src/driven/handback.js';
import { DECISIONS_PER_STEP, type HandbackAnswer, type HandbackPacket } from '../src/driven/step.js';
import { buildScriptedReport, renderScriptedReport } from '../src/scripted/report.js';
import { buildReportJson } from '../src/scripted/report-json.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeDrivenJudge, type FakeStep } from './fixtures/driven-judge.js';

// ---------- fakes ----------

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const button = (ref: string, label: string) => el(ref, 'button', { label });
const text = (ref: string, label: string) => el(ref, 'text', { label, actions: [] });
const list = (ref: string) => el(ref, 'scroll-view', { label: 'List', actions: ['swipeWithin'] });

function actionKey(action: Action): string {
  switch (action.kind) {
    case 'tap': return `tap:${action.targetRef}`;
    case 'type': return `type:${action.targetRef}:${action.valueKey}`;
    case 'swipe': return `swipe:${action.targetRef}:${action.direction}`;
    case 'scroll': return `scroll:${action.direction}`;
    case 'back': return 'back';
    case 'tapAt': return `tapAt:${action.x},${action.y}`;
  }
}

/** Named screens; `moves['screen key']` is where an action leads. `failObserve` throws on that capture number. */
function graphDriver(screens: Record<string, Element[]>, start: string, moves: Record<string, string> = {},
  failObserve?: number) {
  let current = start;
  let sequence = 0;
  const acts: string[] = [];
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current,
    screenshotPath: `screen-${sequence}.jpg` });
  const driver: DeviceDriver & { acts: string[] } = {
    acts,
    async prepare() {},
    async observe() {
      if (sequence + 1 === failObserve) throw new Error('capture failed');
      return shot();
    },
    async act(action) {
      const key = actionKey(action);
      acts.push(`${current} ${key}`);
      current = moves[`${current} ${key}`] ?? current;
      return shot();
    },
    async close() {},
  };
  return driver;
}

function fakeHandback(answers: HandbackAnswer[]) {
  const packets: HandbackPacket[] = [];
  const handback = async (packet: HandbackPacket) => {
    packets.push(packet);
    const answer = answers.shift();
    if (!answer) throw new Error(`fake hand-back: no answer scripted for pause ${packets.length}`);
    return answer;
  };
  return Object.assign(handback, { packets });
}

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'driven', sequence: events.length + 1,
      at: new Date().toISOString(), type, data: structuredClone(data) }); },
    async read() { return events; },
  };
}

const doStep = (extra: Record<string, unknown> = {}) => ({ id: 'signIn', kind: 'do', intent: 'Sign in',
  doneWhen: 'The home screen shows', effect: 'none', ...extra });
const checkpoint = (label = 'Home') => ({ id: 'verify', kind: 'checkpoint',
  guard: { present: [{ role: 'text', label }] }, assertions: [{ id: 'shown', claim: `${label} is shown.` }] });

const passingJudge = { async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
    model: 'jev-1.13.0' };
} };

async function run(input: { driver: DeviceDriver; judge: FakeStep[]; handback?: HandbackAnswer[]; steps?: unknown[] }) {
  const log = recordingLog();
  const handback = fakeHandback(input.handback ?? []);
  const report = await runScriptedScenario({ runId: 'driven', log,
    scenario: parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.app' },
      values: {}, steps: input.steps ?? [doStep(), checkpoint()] }),
    driver: input.driver, judge: passingJudge,
    driven: { judge: fakeDrivenJudge(input.judge), handback, testWritesAllowed: false } });
  return { report, log, handback };
}

// ---------- 1. the pause text never rounds a rejected number up to its threshold ----------

const gateScenario = parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.app' },
  values: {}, steps: [doStep(), checkpoint()] });

function packet(jevDecision: HandbackPacket['jevDecision'], confidenceFloor: number | null = 0.8): HandbackPacket {
  return { pauseId: 'p-1', reason: 'LOW_CONFIDENCE', stepId: 'signIn', intent: 'Sign in', doneWhen: 'Home shows',
    screen: 'Screen', topChoices: [{ key: 'tap:b1', probability: 0.799 }], ...(jevDecision ? { jevDecision } : {}),
    confidenceFloor, valueKeys: [],
    snapshot: { deviceId: 'fake', sequence: 1, capturedAt: 0, expiresAt: 60_000, truncated: false,
      elements: [button('b1', 'Sign in')] } };
}

async function rendered(input: HandbackPacket): Promise<string> {
  const gate = createHandbackGate({ scenario: gateScenario, now: () => 0 });
  const opened = new Promise<void>(done => { gate.onPause(done); });
  const answer = gate.handback(input, new AbortController().signal);
  await opened;
  const pause = gate.pending()!;
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
  return renderPause('run-1', pause, 0);
}

test('the review\'s probe: a real loop pauses LOW_CONFIDENCE at 0.799 / 0.899, and the text says both missed', async () => {
  const { handback } = await run({ driver: graphDriver({ login: [text('t1', 'Welcome'), button('b1', 'Sign in')] }, 'login'),
    judge: [{ choice: 'tap:b1', confidence: 0.799, done: 0.899 }], handback: [{ kind: 'stop' }] });
  const paused = handback.packets[0]!;
  assert.equal(paused.reason, 'LOW_CONFIDENCE');
  const pauseText = await rendered({ ...paused, pauseId: 'p-1' });
  assert.match(pauseText, /^Jev's choice: tap:b1, confidence 0\.799; the bridge takes a pick at confidence 0\.80 or more\n {2}0\.799 is below the 0\.80 floor, so the bridge doesn't act on it$/m);
  assert.match(pauseText, /^Jev's step-done probability: 0\.899; the step is done at 0\.90 or more\n {2}0\.899 is below the 0\.90 floor, so the step isn't done$/m);
  assert.match(pauseText, /^Jev's top picks: tap:b1 \(0\.799\)/m);
  assert.doesNotMatch(pauseText, /confidence 0\.80;|probability: 0\.90;/);
});

test('a number just under its threshold gets the digits that keep it under', async () => {
  const pauseText = await rendered(packet({ choice: 'tap:b1', confidence: 0.79999, done: 0.89999 }));
  assert.match(pauseText, /confidence 0\.79999; .*\n {2}0\.79999 is below the 0\.80 floor/);
  assert.match(pauseText, /probability: 0\.89999; .*\n {2}0\.89999 is below the 0\.90 floor/);
});

test('a number at or above its threshold says so', async () => {
  const pauseText = await rendered(packet({ choice: 'tap:b1', confidence: 0.8, done: 0.9 }));
  assert.match(pauseText, /^ {2}0\.80 is at or above the 0\.80 floor$/m);
  assert.match(pauseText, /^ {2}0\.90 is at or above the 0\.90 floor$/m);
  const high = await rendered(packet({ choice: 'tap:b1', confidence: 0.9549, done: 0.01 }));
  assert.match(high, /^ {2}0\.955 is at or above the 0\.80 floor$/m);
  assert.match(high, /^ {2}0\.01 is below the 0\.90 floor, so the step isn't done$/m);
});

test('without a floor the confidence is printed exactly enough and nothing is compared', async () => {
  const pauseText = await rendered(packet({ choice: 'tap:b1', confidence: 0.799, done: 0.3 }, null));
  assert.match(pauseText, /^Jev's choice: tap:b1, confidence 0\.799; the bridge never takes Jev's pick in this step$/m);
  assert.doesNotMatch(pauseText, /0\.80 floor/);
});

// ---------- 2. a DECISION_BUDGET hand-back keeps the paused screen's decision ----------

test('the review\'s probe: two taps, none_fits, five changed search scrolls, then the budget pause keeps decision 8', async () => {
  const screen = (label: string) => [text('t', label), list('l1'), button('b1', 'Next')];
  const screens = { a: screen('A'), b: screen('B'), c: screen('C'), d1: screen('D1'), d2: screen('D2'), d3: screen('D3'),
    u1: screen('U1'), u2: screen('U2') };
  const moves = { 'a tap:b1': 'b', 'b tap:b1': 'c', 'c scroll:down': 'd1', 'd1 scroll:down': 'd2', 'd2 scroll:down': 'd3',
    'd3 scroll:up': 'u1', 'u1 scroll:up': 'u2' };
  const noneFits = (done: number): FakeStep => ({ choice: 'none_fits', confidence: 0.6, done,
    probabilities: { none_fits: 0.6, 'tap:b1': 0.3, back: 0.1 } });
  const { handback } = await run({ driver: graphDriver(screens, 'a', moves),
    judge: [{ choice: 'tap:b1', confidence: 0.95, done: 0.01 }, { choice: 'tap:b1', confidence: 0.95, done: 0.01 },
      noneFits(0.1), noneFits(0.1), noneFits(0.1), noneFits(0.1), noneFits(0.1), noneFits(0.42)],
    handback: [{ kind: 'stop' }] });
  assert.equal(DECISIONS_PER_STEP, 8);
  assert.equal(handback.packets.length, 1);
  const paused = handback.packets[0]!;
  assert.equal(paused.reason, 'DECISION_BUDGET');
  assert.equal(paused.snapshot.screenHash, 'u2');
  assert.deepEqual(paused.jevDecision, { choice: 'none_fits', confidence: 0.6, done: 0.42 });
  assert.deepEqual(paused.topChoices.map(choice => choice.key), ['none_fits', 'tap:b1', 'back']);
  assert.equal(paused.confidenceFloor, 0.8);
  const pauseText = await rendered({ ...paused, pauseId: 'p-1' });
  assert.doesNotMatch(pauseText, /not asked/);
  assert.match(pauseText, /^Jev's choice: none_fits, confidence 0\.60; .*\n {2}0\.60 is below the 0\.80 floor/m);
});

// ---------- 3. a do step whose first observation failed is in the report ----------

test('the review\'s probe: the first do-step observation throws, and driven.doSteps lists the step not done', async () => {
  const { report, log } = await run({ driver: graphDriver({ login: [button('b1', 'Sign in')] }, 'login', {}, 1),
    judge: [] });
  assert.equal(report.reason, 'EXECUTION_ERROR');
  const json = buildReportJson(log.events);
  assert.equal(json.steps, 1);
  assert.deepEqual(json.driven!.doSteps, [{ stepId: 'signIn', completedBy: null }]);
  assert.match(renderScriptedReport(buildScriptedReport(log.events)), /^signIn: not done\.$/m);
});

const T0 = Date.parse('2026-10-02T10:00:00.000Z');
function events(entries: Array<[RunEvent['type'], Record<string, unknown>]>): RunEvent[] {
  return entries.map(([type, data], index) => ({ version: 1, runId: 'driven-run', sequence: index + 1,
    at: new Date(T0 + index * 1_000).toISOString(), type, data }));
}

test('a revised-in do step that fails at its first observation is listed after the step that revised it', () => {
  const logged = events([
    ['started', { mode: 'scripted', bundleId: 'com.example.app', plannedSteps: [{ id: 'open', kind: 'do' }] }],
    ['step', { step: 1, stepId: 'open', kind: 'do', snapshotSequence: 1 }],
    ['handback', { step: 1, stepId: 'open', reason: 'NONE_FITS', pauseId: 'p-1' }],
    ['handback_answer', { step: 1, stepId: 'open', pauseId: 'p-1', kind: 'revise',
      steps: [{ id: 'retry', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }] }],
    ['error', { stepId: 'retry', phase: 'observe', code: 'EXECUTION_ERROR' }],
    ['verdict', { verdict: 'inconclusive', reason: 'EXECUTION_ERROR', steps: 2 }],
  ]);
  assert.deepEqual(buildReportJson(logged).driven!.doSteps, [
    { stepId: 'open', completedBy: null }, { stepId: 'retry', completedBy: null }]);
});

test('an error in a do step that already observed, or in a checkpoint, adds no do step', () => {
  const logged = events([
    ['started', { mode: 'scripted', bundleId: 'com.example.app',
      plannedSteps: [{ id: 'open', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }] }],
    ['step', { step: 1, stepId: 'open', kind: 'do', snapshotSequence: 1 }],
    ['error', { stepId: 'open', phase: 'decide', code: 'EXECUTION_ERROR' }],
    ['verdict', { verdict: 'inconclusive', reason: 'EXECUTION_ERROR', steps: 1 }],
  ]);
  assert.deepEqual(buildReportJson(logged).driven!.doSteps, [{ stepId: 'open', completedBy: null }]);
  const checkpointRun = events([
    ['started', { mode: 'scripted', bundleId: 'com.example.app',
      plannedSteps: [{ id: 'open', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }] }],
    ['step', { step: 1, stepId: 'open', kind: 'do', snapshotSequence: 1 }],
    ['decision', { step: 1, stepId: 'open', decision: 1, choice: 'step_done', confidence: 0.9, done: 0.95, stepDone: true }],
    ['error', { stepId: 'verify', phase: 'observe', code: 'EXECUTION_ERROR' }],
    ['verdict', { verdict: 'inconclusive', reason: 'EXECUTION_ERROR', steps: 2 }],
  ]);
  assert.deepEqual(buildReportJson(checkpointRun).driven!.doSteps, [{ stepId: 'open', completedBy: 'jev', done: 0.95 }]);
});
