/**
 * The driven step loop (Issue 07): scenario tests through `runScriptedScenario` with a fake driver (a small graph
 * of screens), the fake Jev from tests/fixtures/driven-judge.ts and a fake hand-back. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, ActPath, DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { runScriptedScenario, type ScriptedRunOptions } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { DECISIONS_PER_STEP, type HandbackAnswer, type HandbackPacket } from '../src/driven/step.js';
import { fakeDrivenJudge, type FakeStep } from './fixtures/driven-judge.js';
import { REASON_CODES } from '../src/scripted/vocabulary.js';
import { PAUSE_REASON_TEXT } from '../src/driven/vocabulary.js';

// ---------- fakes ----------

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const button = (ref: string, label: string, extra: Partial<Element> = {}) => el(ref, 'button', { label, ...extra });
const text = (ref: string, label: string) => el(ref, 'text', { label, actions: [] });
const field = (ref: string, label: string) => el(ref, 'text-field', { label, actions: ['tap', 'typeText'] });
const list = (ref: string) => el(ref, 'scroll-view', { label: 'List', actions: ['swipeWithin'] });

/** How an action reads as a transition key: `tap:e1`, `type:e1:user`, `scroll:down`, `back`, `tapAt:5,6`. */
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

interface GraphDriver extends DeviceDriver {
  /** Every action performed, as `<screen> <key>`. */
  readonly acts: string[];
  /** The ref each element action named, as the driver got it; with `refsPerCapture` it shows which capture. */
  readonly refsActedOn: string[];
  readonly current: () => string;
  /** Moves the device to another screen with no action, as the app or a person can while a step is paused. */
  goTo(screen: string): void;
}

/**
 * A device whose screens are named; `moves['screen key']` is the screen an action leads to (else it stays). With
 * `refsPerCapture`, each capture gives its elements new refs (`b1@<sequence>`), as iOS does.
 */
function graphDriver(screens: Record<string, Element[]>, start: string, moves: Record<string, string> = {},
  options: { staleOnce?: string; staleMovesTo?: string; scrollWithin?: string; refsPerCapture?: boolean } = {}): GraphDriver {
  let current = start;
  let sequence = 0;
  let path: ActPath | undefined;
  let staleOnce = options.staleOnce;
  const acts: string[] = [];
  const refsActedOn: string[] = [];
  const shot = (): Snapshot => {
    sequence++;
    const elements = options.refsPerCapture
      ? screens[current]!.map(element => ({ ...element, ref: `${element.ref}@${sequence}` })) : screens[current]!;
    return { deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence, elements,
      truncated: false, screenHash: current, screenshotPath: `screen-${sequence}.jpg` };
  };
  return {
    acts,
    refsActedOn,
    current: () => current,
    goTo(screen) { current = screen; },
    async prepare() {},
    async observe() { return shot(); },
    async act(action) {
      if (action.targetRef !== undefined) refsActedOn.push(action.targetRef);
      const key = actionKey(action).replace(/@\d+/g, '');
      if (staleOnce === key) {
        staleOnce = undefined;
        if (options.staleMovesTo) current = options.staleMovesTo;
        const { StaleSnapshotError } = await import('../src/device/index.js');
        throw new StaleSnapshotError();
      }
      acts.push(`${current} ${key}`);
      path = action.kind === 'back' ? { path: 'back-key' }
        : action.kind === 'scroll' ? (options.scrollWithin ? { path: 'scroll-within', targetRef: options.scrollWithin }
          : { path: 'screen-middle' }) : undefined;
      current = moves[`${current} ${key}`] ?? current;
      return shot();
    },
    actPath: () => path,
    async close() {},
  };
}

interface FakeHandback {
  (packet: HandbackPacket, signal: AbortSignal): Promise<HandbackAnswer>;
  readonly packets: HandbackPacket[];
}

/** An answer, or a function that gives one for the pause's packet (and may change the device meanwhile). */
type ScriptedAnswer = HandbackAnswer | ((packet: HandbackPacket) => HandbackAnswer);

function fakeHandback(answers: ScriptedAnswer[]): FakeHandback {
  const packets: HandbackPacket[] = [];
  const handback = async (packet: HandbackPacket) => {
    packets.push(packet);
    const answer = answers.shift();
    if (!answer) throw new Error(`fake hand-back: no answer scripted for pause ${packets.length}`);
    return typeof answer === 'function' ? answer(packet) : answer;
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

// ---------- scripts ----------

const doStep = (extra: Record<string, unknown> = {}) => ({ id: 'signIn', kind: 'do', intent: 'Sign in',
  doneWhen: 'The home screen shows', effect: 'none', ...extra });
const checkpoint = (label = 'Home') => ({ id: 'verify', kind: 'checkpoint',
  guard: { present: [{ role: 'text', label }] }, assertions: [{ id: 'shown', claim: `${label} is shown.` }] });

function script(steps: unknown[], extra: Record<string, unknown> = {}): ScriptedScenario {
  return parseScriptedScenario({ version: 2, app: { bundleId: 'com.example.app' },
    values: { user: 'ops@example.com' }, steps, ...extra });
}

const passingJudge = (probability = 0.97) => ({ async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(a => [a.id, probability])), inputTokens: 1, latencyMs: 1,
    model: 'jev-1.13.0' };
} });

interface Run {
  driver: GraphDriver;
  judge: FakeStep[];
  handback?: ScriptedAnswer[];
  steps?: unknown[];
  extra?: Record<string, unknown>;
  checkpointProbability?: number;
  options?: Partial<ScriptedRunOptions>;
  testWritesAllowed?: boolean;
}

async function run(input: Run) {
  const log = recordingLog();
  const judge = fakeDrivenJudge(input.judge);
  const handback = fakeHandback(input.handback ?? []);
  const report = await runScriptedScenario({ runId: 'driven', log,
    scenario: script(input.steps ?? [doStep(), checkpoint()], input.extra),
    driver: input.driver, judge: passingJudge(input.checkpointProbability),
    driven: { judge, handback, testWritesAllowed: input.testWritesAllowed ?? false },
    ...input.options });
  const of = (type: RunEvent['type']) => log.events.filter(event => event.type === type).map(event => event.data);
  return { report, log, judge, handback, of };
}

const signInScreens = {
  login: [text('t1', 'Welcome'), field('f1', 'Email'), button('b1', 'Sign in')],
  filled: [text('t1', 'Welcome'), field('f1', 'Email'), button('b1', 'Sign in'), text('t2', 'Filled')],
  home: [text('t3', 'Home')],
};
const signInMoves = { 'login type:f1:user': 'filled', 'filled tap:b1': 'home' };

/** Revised steps as Claude would send them, already validated like a script: a checkpoint for Home. */
const homeCheckpoint = () => parseScriptedScenario({ version: 1, app: { bundleId: 'com.example.app' }, values: {},
  steps: [checkpoint('Home')] }).steps;

// ---------- scenarios ----------

test('a straight Jev run: type, tap, then done on a fresh observation; the checkpoint passes', async () => {
  const driver = graphDriver(signInScreens, 'login', signInMoves);
  const { report, of, judge } = await run({ driver, steps: [doStep({ values: ['user'] }), checkpoint()], judge: [
    { choice: 'type:f1:user', confidence: 0.95, done: 0.02 },
    { choice: 'tap:b1', confidence: 0.92, done: 0.05 },
    { choice: 'step_done', confidence: 0.96, done: 0.97 },
  ] });
  assert.equal(report.verdict, 'passed');
  assert.equal(report.reason, 'ALL_CHECKPOINTS_PASSED');
  assert.deepEqual(driver.acts, ['login type:f1:user', 'filled tap:b1']);
  assert.equal(judge.asked.length, 3);
  const actions = of('action');
  assert.deepEqual(actions.map(a => [a.action, a.decidedBy, a.key, a.confidence]), [
    ['type', 'jev', 'type:f1:user', 0.95], ['tap', 'jev', 'tap:b1', 0.92]]);
  assert.equal(actions[0]!.valueKey, 'user');
  assert.equal(actions[1]!.resolvedRef, 'b1');
  const decisions = of('decision');
  assert.deepEqual(decisions.map(d => [d.decision, d.choice, d.confidence, d.done]), [
    [1, 'type:f1:user', 0.95, 0.02], [2, 'tap:b1', 0.92, 0.05], [3, 'step_done', 0.96, 0.97]]);
  assert.equal(decisions[2]!.stepDone, true);
  for (const d of decisions) {
    assert.equal(typeof d.options, 'number');
    assert.equal(d.inputTokens, 1);
    assert.equal(d.latencyMs, 1);
  }
  // Each Jev action counted; the do step and the checkpoint are steps too.
  assert.equal(report.inputTokens, 3 + 1);
  // Jev saw the last two actions of the step, masked: no typed value in any request.
  const lastState = judge.asked[2]!.request.state as { recent_actions: string[] };
  assert.equal(lastState.recent_actions.length, 2);
  assert.ok(!JSON.stringify(judge.asked).includes('ops@example.com'));
});

test('a step already done on its first screen completes without an action', async () => {
  const driver = graphDriver(signInScreens, 'home');
  const { report, of } = await run({ driver, judge: [{ choice: 'step_done', confidence: 0.9, done: 0.95 }] });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(driver.acts, []);
  assert.equal(of('action').length, 0);
});

test('the step is done only on the done Noul: a step_done pick with an uncertain Noul goes on', async () => {
  const driver = graphDriver(signInScreens, 'filled', signInMoves);
  const { report, handback } = await run({ driver, judge: [
    { choice: 'step_done', confidence: 0.95, done: 0.5 },
    { choice: 'step_done', confidence: 0.95, done: 0.92 },
  ], handback: [{ kind: 'tap', ref: 'b1' }] });
  assert.equal(report.verdict, 'passed');
  // The uncertain step_done is a low-confidence answer: one search scroll changed nothing, then Claude tapped.
  assert.equal(handback.packets[0]!.reason, 'LOW_CONFIDENCE');
  assert.deepEqual(driver.acts, ['filled scroll:down', 'filled tap:b1']);
});

test('target search: none_fits, two scrolls down, then Jev finds the target and acts', async () => {
  const screens = {
    top: [list('l1'), text('t1', 'Settings')],
    middle: [list('l1'), text('t2', 'More settings')],
    bottom: [list('l1'), button('b9', 'Sign in')],
    home: [text('t3', 'Home')],
  };
  const driver = graphDriver(screens, 'top', { 'top scroll:down': 'middle', 'middle scroll:down': 'bottom',
    'bottom tap:b9': 'home' });
  const { report, of, handback } = await run({ driver, judge: [
    { choice: 'none_fits', confidence: 0.9 },
    { choice: 'none_fits', confidence: 0.9 },
    { choice: 'tap:b9', confidence: 0.91 },
    { choice: 'step_done', confidence: 0.95, done: 0.95 },
  ] });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(driver.acts, ['top scroll:down', 'middle scroll:down', 'bottom tap:b9']);
  assert.deepEqual(of('search').map(s => [s.direction, s.attempt, s.actPath]),
    [['down', 1, 'screen-middle'], ['down', 2, 'screen-middle']]);
  assert.equal(handback.packets.length, 0);
});

test('target search exhausted: 3 down, 3 up, then the step goes to Claude with Jev\'s top picks', async () => {
  const screens: Record<string, Element[]> = {};
  const moves: Record<string, string> = {};
  for (let i = 0; i <= 3; i++) screens[`s${i}`] = [list('l1'), text(`t${i}`, `Row ${i}`)];
  for (let i = 0; i < 3; i++) { moves[`s${i} scroll:down`] = `s${i + 1}`; moves[`s${i + 1} scroll:up`] = `s${i}`; }
  screens.home = [text('t9', 'Home')];
  moves['s0 back'] = 'home';
  const driver = graphDriver(screens, 's0', moves);
  const none = { choice: 'none_fits', confidence: 0.6, probabilities: { none_fits: 0.6, back: 0.3, 'scroll:down': 0.1 } };
  const { report, of, handback } = await run({ driver, judge: [
    none, none, none, none, none, none, none,
    { choice: 'step_done', confidence: 0.95, done: 0.95 },
  ], handback: [{ kind: 'back' }] });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(of('search').map(s => s.direction), ['down', 'down', 'down', 'up', 'up', 'up']);
  assert.equal(handback.packets.length, 1);
  const packet = handback.packets[0]!;
  assert.equal(packet.reason, 'NONE_FITS');
  assert.equal(packet.stepId, 'signIn');
  assert.equal(packet.intent, 'Sign in');
  assert.deepEqual(packet.topChoices, [{ key: 'none_fits', probability: 0.6 }, { key: 'back', probability: 0.3 },
    { key: 'scroll:down', probability: 0.1 }]);
  assert.match(packet.screen, /Row 0/);
  assert.equal(typeof packet.screenshotPath, 'string');
  assert.equal(typeof packet.pauseId, 'string');
  const [paused] = of('handback');
  assert.deepEqual(paused, { step: 1, stepId: 'signIn', reason: 'NONE_FITS', pauseId: packet.pauseId });
  assert.deepEqual(of('handback_answer'), [{ step: 1, stepId: 'signIn', pauseId: packet.pauseId, kind: 'back' }]);
  const claude = of('action').find(a => a.decidedBy === 'claude');
  assert.deepEqual([claude?.action, claude?.actPath], ['back', 'back-key']);
});

test('target search scrolls once on a screen with nothing scrollable, then hands back', async () => {
  const driver = graphDriver({ only: [text('t1', 'Nothing here')] }, 'only');
  const { report, of, handback, judge } = await run({ driver, judge: [{ choice: 'none_fits', confidence: 0.9 }],
    handback: [{ kind: 'stop' }] });
  // The scroll changed nothing, so Jev isn't asked again.
  assert.equal(judge.asked.length, 1);
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
  assert.deepEqual(of('search').map(s => s.direction), ['down']);
  assert.equal(handback.packets[0]!.reason, 'NONE_FITS');
});

test('a low-confidence pick searches too, and goes back as LOW_CONFIDENCE', async () => {
  const driver = graphDriver({ only: [text('t1', 'Nothing here'), button('b1', 'Next')] }, 'only');
  const { handback } = await run({ driver, judge: [{ choice: 'tap:b1', confidence: 0.5 }],
    handback: [{ kind: 'stop' }] });
  assert.equal(handback.packets[0]!.reason, 'LOW_CONFIDENCE');
});

test('stuck: an unchanged screen after an action is retried once, then handed back', async () => {
  const driver = graphDriver({ login: [text('t1', 'Welcome'), button('b1', 'Sign in')] }, 'login');
  const { report, handback, of } = await run({ driver, judge: [{ choice: 'tap:b1', confidence: 0.95 }],
    handback: [{ kind: 'stop' }] });
  assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
  assert.deepEqual(driver.acts, ['login tap:b1', 'login tap:b1']);
  assert.equal(handback.packets[0]!.reason, 'SCREEN_UNCHANGED');
  assert.deepEqual(of('action').map(a => a.retry ?? false), [false, true]);
});

test('stuck: the same action 3 times in a step is handed back', async () => {
  // Each tap on "Next" changes the screen (a counter), but the step never gets done.
  const screens: Record<string, Element[]> = {};
  const moves: Record<string, string> = {};
  for (let i = 0; i < 5; i++) {
    screens[`p${i}`] = [text(`t${i}`, `Page ${i}`), button('b1', 'Next')];
    moves[`p${i} tap:b1`] = `p${i + 1}`;
  }
  const driver = graphDriver(screens, 'p0', moves);
  const next = { choice: 'tap:b1', confidence: 0.95 };
  const { handback } = await run({ driver, judge: [next, next, next], handback: [{ kind: 'stop' }] });
  assert.deepEqual(driver.acts, ['p0 tap:b1', 'p1 tap:b1']);
  assert.equal(handback.packets[0]!.reason, 'REPEATED_ACTION');
});

test('stuck: A→B→A→B between two screens is handed back', async () => {
  const screens = { a: [text('t1', 'A'), button('b1', 'To B')], b: [text('t2', 'B'), button('b2', 'To A')] };
  const driver = graphDriver(screens, 'a', { 'a tap:b1': 'b', 'b tap:b2': 'a' });
  const { handback } = await run({ driver, judge: [
    { choice: 'tap:b1', confidence: 0.95 }, { choice: 'tap:b2', confidence: 0.95 },
    { choice: 'tap:b1', confidence: 0.95 },
  ], handback: [{ kind: 'stop' }] });
  assert.deepEqual(driver.acts, ['a tap:b1', 'b tap:b2', 'a tap:b1']);
  assert.equal(handback.packets[0]!.reason, 'SCREEN_LOOP');
});

test('the 8-decision budget: then Claude; after Claude\'s action one completion check, else STEP_NOT_DONE', async () => {
  const screens: Record<string, Element[]> = {};
  const moves: Record<string, string> = {};
  const keys = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'];
  for (let i = 0; i < 10; i++) {
    screens[`p${i}`] = [text(`t${i}`, `Page ${i}`), ...keys.map(k => button(k, `Go ${k}`))];
    keys.forEach(k => { moves[`p${i} tap:${k}`] = `p${i + 1}`; });
  }
  const driver = graphDriver(screens, 'p0', moves);
  const picks = keys.slice(0, DECISIONS_PER_STEP).map(k => ({ choice: `tap:${k}`, confidence: 0.95 }));
  const { report, handback, judge, of } = await run({ driver, judge: [...picks, { choice: 'tap:b1', confidence: 0.95, done: 0.4 }],
    handback: [{ kind: 'tap', ref: 'b9' }] });
  assert.equal(DECISIONS_PER_STEP, 8);
  assert.equal(handback.packets[0]!.reason, 'DECISION_BUDGET');
  assert.equal(judge.asked.length, 9);
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'STEP_NOT_DONE');
  assert.equal(of('action').filter(a => a.decidedBy === 'claude').length, 1);
});

test('the budget\'s completion check passes the step when Claude\'s action did it', async () => {
  const screens: Record<string, Element[]> = {};
  const moves: Record<string, string> = {};
  const keys = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'];
  for (let i = 0; i < 9; i++) {
    screens[`p${i}`] = [text(`t${i}`, `Page ${i}`), ...keys.map(k => button(k, `Go ${k}`)), button('h', 'Home')];
    keys.forEach(k => { moves[`p${i} tap:${k}`] = `p${i + 1}`; });
    moves[`p${i} tap:h`] = 'home';
  }
  screens.home = [text('t9', 'Home')];
  const driver = graphDriver(screens, 'p0', moves);
  const picks = keys.map(k => ({ choice: `tap:${k}`, confidence: 0.95 }));
  const { report } = await run({ driver, judge: [...picks, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
    handback: [{ kind: 'tap', ref: 'h' }] });
  assert.equal(report.verdict, 'passed');
});

test('a confident pick on a risky control goes to Claude as RISKY_ACTION', async () => {
  const driver = graphDriver({ s: [text('t1', 'Account'), button('b1', 'Delete account')] }, 's');
  const { handback } = await run({ driver, judge: [{ choice: 'tap:b1', confidence: 0.99 }], handback: [{ kind: 'stop' }] });
  assert.equal(handback.packets[0]!.reason, 'RISKY_ACTION');
  assert.deepEqual(driver.acts, []);
});

test('a destructive step goes to Claude without asking Jev; after Claude acts, Jev checks completion', async () => {
  const screens = { s: [text('t1', 'Account'), button('b1', 'Delete account')], gone: [text('t2', 'Deleted')] };
  const driver = graphDriver(screens, 's', { 's tap:b1': 'gone' });
  const { report, handback, judge } = await run({ driver, steps: [doStep({ effect: 'destructive' }), checkpoint('Deleted')],
    judge: [{ choice: 'step_done', confidence: 0.95, done: 0.95 }], handback: [{ kind: 'tap', ref: 'b1' }] });
  assert.equal(handback.packets[0]!.reason, 'DESTRUCTIVE_STEP');
  assert.deepEqual(handback.packets[0]!.topChoices, []);
  assert.equal(judge.asked.length, 1);
  assert.equal(report.verdict, 'passed');
});

test('a destructive step never lets Jev act, even confidently', async () => {
  const screens = { s: [text('t1', 'Account'), button('b1', 'Remove'), button('b2', 'Confirm')],
    next: [text('t2', 'Confirm?'), button('b2', 'Confirm')] };
  const driver = graphDriver(screens, 's', { 's tap:b1': 'next' });
  const { handback } = await run({ driver, steps: [doStep({ effect: 'destructive' }), checkpoint('Deleted')],
    judge: [{ choice: 'tap:b2', confidence: 0.99 }], handback: [{ kind: 'tap', ref: 'b1' }, { kind: 'stop' }] });
  assert.deepEqual(handback.packets.map(p => p.reason), ['DESTRUCTIVE_STEP', 'DESTRUCTIVE_STEP']);
  assert.deepEqual(driver.acts, ['s tap:b1']);
});

test('a localOnly step never calls Jev: every decision goes to Claude until Claude revises or stops', async () => {
  const driver = graphDriver(signInScreens, 'login', signInMoves);
  const { report, handback, judge } = await run({ driver,
    steps: [doStep({ localOnly: true, values: ['user'] }), checkpoint()], judge: [],
    handback: [{ kind: 'type', ref: 'f1', valueKey: 'user' }, { kind: 'tap', ref: 'b1' }, { kind: 'stop' }] });
  assert.equal(judge.asked.length, 0);
  assert.deepEqual(handback.packets.map(p => p.reason), ['LOCAL_ONLY_STEP', 'LOCAL_ONLY_STEP', 'LOCAL_ONLY_STEP']);
  assert.deepEqual(driver.acts, ['login type:f1:user', 'filled tap:b1']);
  assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
});

test('Claude\'s tap, type, scroll, back and tapAt answers are performed with decidedBy claude', async () => {
  const screens = { s: [text('t1', 'Form'), field('f1', 'Email'), button('b1', 'Go'), list('l1')] };
  const driver = graphDriver(screens, 's');
  const answers: HandbackAnswer[] = [{ kind: 'tap', ref: 'b1' }, { kind: 'type', ref: 'f1', valueKey: 'user' },
    { kind: 'scroll', direction: 'down' }, { kind: 'back' }, { kind: 'tapAt', x: 5, y: 6 }, { kind: 'stop' }];
  const { of, report } = await run({ driver, steps: [doStep({ localOnly: true, values: ['user'] }), checkpoint()],
    judge: [], handback: answers });
  assert.deepEqual(driver.acts, ['s tap:b1', 's type:f1:user', 's scroll:down', 's back', 's tapAt:5,6']);
  const claude = of('action');
  assert.ok(claude.every(a => a.decidedBy === 'claude'));
  assert.deepEqual(claude.map(a => a.action), ['tap', 'type', 'scroll', 'back', 'tapAt']);
  assert.deepEqual([claude[4]!.x, claude[4]!.y], [5, 6]);
  assert.equal(claude[2]!.direction, 'down');
  assert.deepEqual(of('handback_answer').map(a => a.kind), ['tap', 'type', 'scroll', 'back', 'tapAt', 'stop']);
  assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
});

test('after a pause, Claude\'s answer acts on a fresh capture of the same screen, its element found again', async () => {
  const driver = graphDriver(signInScreens, 'filled', signInMoves, { refsPerCapture: true });
  const { handback, report } = await run({ driver, steps: [doStep({ localOnly: true }), checkpoint()], judge: [],
    handback: [packet => ({ kind: 'tap', ref: packet.snapshot.elements.find(e => e.label === 'Sign in')!.ref }),
      { kind: 'revise', steps: homeCheckpoint() }] });
  const paused = handback.packets[0]!.snapshot.sequence;
  assert.deepEqual(driver.acts, ['filled tap:b1']);
  const [ref] = driver.refsActedOn;
  assert.notEqual(ref, `b1@${paused}`, 'not the paused capture\'s ref');
  assert.ok(Number(ref!.split('@')[1]) > paused, `a later capture's ref, not ${String(ref)}`);
  assert.equal(report.verdict, 'passed');
});

test('a screen that changed during the pause: Claude\'s answer is not performed; it hands back SCREEN_CHANGED', async () => {
  const answers: HandbackAnswer[] = [{ kind: 'tap', ref: 'b1' }, { kind: 'type', ref: 'f1', valueKey: 'user' },
    { kind: 'scroll', direction: 'down' }, { kind: 'back' }, { kind: 'tapAt', x: 5, y: 6 }];
  for (const answer of answers) {
    const driver = graphDriver(signInScreens, 'filled', signInMoves);
    const { handback, of, report } = await run({ driver, steps: [doStep({ localOnly: true, values: ['user'] }), checkpoint()],
      judge: [], handback: [() => { driver.goTo('login'); return answer; }, { kind: 'stop' }] });
    assert.deepEqual(driver.acts, [], answer.kind);
    assert.deepEqual(of('action'), [], answer.kind);
    assert.deepEqual(handback.packets.map(p => p.reason), ['LOCAL_ONLY_STEP', 'SCREEN_CHANGED'], answer.kind);
    assert.equal(handback.packets[1]!.snapshot.screenHash, 'login', 'the new pause shows the screen as it is now');
    assert.match(PAUSE_REASON_TEXT.SCREEN_CHANGED ?? '', /nothing was done.*revise or stop/);
    assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
  }
});

test('a driver that finds even the fresh capture stale: Claude\'s answer hands back SCREEN_CHANGED, never retried', async () => {
  const cases: [HandbackAnswer, string][] = [[{ kind: 'tap', ref: 'b1' }, 'tap:b1'], [{ kind: 'back' }, 'back'],
    [{ kind: 'tapAt', x: 5, y: 6 }, 'tapAt:5,6']];
  for (const [answer, key] of cases) {
    const driver = graphDriver(signInScreens, 'filled', signInMoves, { staleOnce: key });
    const { handback } = await run({ driver, steps: [doStep({ localOnly: true }), checkpoint()], judge: [],
      handback: [answer, { kind: 'stop' }] });
    assert.deepEqual(driver.acts, [], key);
    assert.deepEqual(handback.packets.map(p => p.reason), ['LOCAL_ONLY_STEP', 'SCREEN_CHANGED'], key);
  }
});

test('an action event names its target by role, label and identifier, with typed values masked', async () => {
  const screens = { s: [field('f1', 'ops@example.com'), button('b1', 'Go', { identifier: 'go.button' })] };
  const driver = graphDriver(screens, 's');
  const { of } = await run({ driver, steps: [doStep({ localOnly: true, values: ['user'] }), checkpoint()], judge: [],
    handback: [{ kind: 'type', ref: 'f1', valueKey: 'user' }, { kind: 'tap', ref: 'b1' }, { kind: 'back' }, { kind: 'stop' }] });
  assert.deepEqual(of('action').map(a => a.target), [
    { role: 'text-field', label: '⟦value:user⟧' }, { role: 'button', label: 'Go', identifier: 'go.button' }, undefined]);
});

test('revise replaces the remaining steps; the run goes on with them', async () => {
  const driver = graphDriver(signInScreens, 'filled', signInMoves);
  const revised = homeCheckpoint();
  const { report, of } = await run({ driver, steps: [doStep({ localOnly: true }), checkpoint('Never shown')], judge: [],
    handback: [{ kind: 'tap', ref: 'b1' }, { kind: 'revise', steps: revised }] });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(of('handback_answer').at(-1), { step: 1, stepId: 'signIn', pauseId: of('handback').at(-1)!.pauseId,
    kind: 'revise', steps: [{ id: 'verify', kind: 'checkpoint' }] });
  assert.deepEqual(of('verdict')[0]!.checkpointCount, 1);
});

test('stop ends the run inconclusive with STOPPED_BY_CLAUDE', async () => {
  const driver = graphDriver(signInScreens, 'login');
  const { report } = await run({ driver, steps: [doStep({ localOnly: true }), checkpoint()], judge: [],
    handback: [{ kind: 'stop' }] });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
});

test('only a checkpoint fails a run: a false checkpoint after do steps fails it', async () => {
  const driver = graphDriver(signInScreens, 'home');
  const steps = [doStep(), doStep({ id: 'second' }), checkpoint()];
  const done = { choice: 'step_done', confidence: 0.95, done: 0.95 };
  const failed = await run({ driver, steps, judge: [done, done], checkpointProbability: 0.02 });
  assert.equal(failed.report.verdict, 'failed');
  assert.equal(failed.report.reason, 'ASSERTION_FALSE');
  const passed = await run({ driver: graphDriver(signInScreens, 'home'), steps, judge: [done, done] });
  assert.equal(passed.report.verdict, 'passed');
});

test('a test_write step without a passed preflight hands Jev\'s confident pick to Claude', async () => {
  const driver = graphDriver(signInScreens, 'filled', signInMoves);
  const steps = [doStep({ effect: 'test_write' }), checkpoint()];
  const blocked = await run({ driver, steps, judge: [{ choice: 'tap:b1', confidence: 0.95 }], handback: [{ kind: 'stop' }] });
  assert.equal(blocked.handback.packets[0]!.reason, 'NO_PREFLIGHT');
  assert.deepEqual(driver.acts, []);
  const allowed = await run({ driver: graphDriver(signInScreens, 'filled', signInMoves), steps, testWritesAllowed: true,
    judge: [{ choice: 'tap:b1', confidence: 0.95 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }] });
  assert.equal(allowed.report.verdict, 'passed');
});

test('a screen Jev can\'t read goes to Claude as UNREADABLE_SCREEN', async () => {
  const driver = graphDriver({ blank: [] }, 'blank');
  const { handback, judge } = await run({ driver, judge: [], handback: [{ kind: 'stop' }] });
  assert.equal(judge.asked.length, 0);
  assert.equal(handback.packets[0]!.reason, 'UNREADABLE_SCREEN');
});

test('each Jev-driven action counts toward maxSteps', async () => {
  const driver = graphDriver(signInScreens, 'login', signInMoves);
  const { report } = await run({ driver, steps: [doStep({ values: ['user'] }), checkpoint()], options: { limits: { maxSteps: 2 } },
    judge: [{ choice: 'type:f1:user', confidence: 0.95 }, { choice: 'tap:b1', confidence: 0.95 }] });
  assert.equal(report.reason, 'STEP_LIMIT');
  assert.deepEqual(driver.acts, ['login type:f1:user']);
});

test('a script with a do step needs the driven seams before touching the device', async () => {
  const driver = graphDriver(signInScreens, 'login');
  const log = recordingLog();
  await assert.rejects(runScriptedScenario({ runId: 'driven', log, scenario: script([doStep(), checkpoint()]),
    driver, judge: passingJudge() }), /driven/);
  assert.deepEqual(log.events, []);
});

test('the new reason codes are in the vocabulary', () => {
  for (const code of ['STOPPED_BY_CLAUDE', 'STEP_NOT_DONE', 'HANDBACK_TIMEOUT', 'DRIVEN_NOT_ENABLED']) {
    assert.ok(Object.hasOwn(REASON_CODES, code), code);
  }
});

test('the driven events carry no screen text beyond an action\'s own target, and no typed value', async () => {
  const driver = graphDriver(signInScreens, 'login', signInMoves);
  const { of } = await run({ driver, steps: [doStep({ values: ['user'] }), checkpoint()], judge: [
    { choice: 'type:f1:user', confidence: 0.95 }, { choice: 'none_fits', confidence: 0.9 },
  ], handback: [{ kind: 'tap', ref: 'b1' }, { kind: 'revise', steps: homeCheckpoint() }] });
  const driven = JSON.stringify(['decision', 'search', 'handback', 'handback_answer'].map(type => of(type as RunEvent['type'])));
  for (const screenText of ['Welcome', 'Email', 'Sign in', 'Filled', 'ops@example.com']) {
    assert.ok(!driven.includes(screenText), screenText);
  }
  // An action names its target as the step event's screen summary already does (ADR-0002), and nothing else.
  const actions = of('action');
  assert.deepEqual(actions.map(a => a.target), [{ role: 'text-field', label: 'Email' }, { role: 'button', label: 'Sign in' }]);
  const untargeted = JSON.stringify(actions.map(({ target: _target, ...rest }) => rest));
  for (const screenText of ['Welcome', 'Email', 'Sign in', 'Filled', 'ops@example.com']) {
    assert.ok(!untargeted.includes(screenText), screenText);
  }
  assert.ok(of('search').length > 0 && of('handback').length > 0);
});

test('the action and search events record how a scroll was done, with its element', async () => {
  const screens = { top: [list('l1'), text('t1', 'Top')], bottom: [list('l1'), text('t2', 'Bottom'), button('b1', 'Go')],
    home: [text('t3', 'Home')] };
  const driver = graphDriver(screens, 'top', { 'top scroll:down': 'bottom', 'bottom tap:b1': 'home' },
    { scrollWithin: 'l1' });
  const { of } = await run({ driver, judge: [{ choice: 'none_fits', confidence: 0.9 }, { choice: 'tap:b1', confidence: 0.9 },
    { choice: 'step_done', confidence: 0.9, done: 0.95 }] });
  assert.deepEqual(of('search').map(s => [s.actPath, s.actPathRef]), [['scroll-within', 'l1']]);
});

test('past the budget, Claude\'s answer to another hand-back gets the completion check, not a second pause', async () => {
  const screens: Record<string, Element[]> = {};
  const moves: Record<string, string> = {};
  const keys = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'];
  for (let i = 0; i < 8; i++) {
    screens[`p${i}`] = [text(`t${i}`, `Page ${i}`), ...keys.map(k => button(k, `Go ${k}`)), button('h', 'Home'),
      button('d', 'Delete')];
    keys.forEach(k => { moves[`p${i} tap:${k}`] = `p${i + 1}`; });
    moves[`p${i} tap:h`] = 'home';
  }
  screens.home = [text('t9', 'Home')];
  const driver = graphDriver(screens, 'p0', moves);
  // Seven picks, then the eighth on a risky control: Claude answers that, and Jev only checks completion.
  const picks = [...keys.map(k => ({ choice: `tap:${k}`, confidence: 0.95 })), { choice: 'tap:d', confidence: 0.95 }];
  const { report, handback } = await run({ driver, judge: [...picks, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
    handback: [{ kind: 'tap', ref: 'h' }] });
  assert.deepEqual(handback.packets.map(p => p.reason), ['RISKY_ACTION']);
  assert.equal(report.verdict, 'passed');
});
