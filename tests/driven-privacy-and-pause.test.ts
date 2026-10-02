/**
 * Issue 13, from the Codex review: checkpoints in driven runs keep driven privacy (P1 #2), the pause package masks
 * typed values everywhere (P2 #6), and a late answer is refused as the timeout (P2 #8). A fake driver, a recording
 * checkpoint judge, the fake Jev from tests/fixtures/driven-judge.ts, a fake hand-back or the real gate, and a fake
 * clock. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Action, Assertion, DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { REASON_CODES } from '../src/scripted/vocabulary.js';
import type { HandbackAnswer, HandbackPacket } from '../src/driven/step.js';
import { openDrivenProject } from '../src/driven/project.js';
import { maskValues } from '../src/driven/decide.js';
import { createHandbackGate, HandbackAnswerError, HandbackTimeoutError, renderPause } from '../src/driven/handback.js';
import { fakeDrivenJudge, type FakeStep } from './fixtures/driven-judge.js';

const USER = 'ops@example.com';
const PIN = '4321';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const text = (ref: string, label: string, extra: Partial<Element> = {}) => el(ref, 'text', { label, actions: [], ...extra });

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

/** A device whose screens are named; `moves['screen key']` is the screen an action leads to (else it stays). */
function graphDriver(screens: Record<string, Element[]>, start: string, moves: Record<string, string> = {}) {
  let current = start;
  let sequence = 0;
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current });
  const driver: DeviceDriver = {
    async prepare() {},
    async observe() { return shot(); },
    async act(action) { current = moves[`${current} ${actionKey(action)}`] ?? current; return shot(); },
    actPath: () => undefined,
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

/** A checkpoint judge that passes every claim and records what it was sent. */
function recordingJudge() {
  const asked: { assertions: Assertion[]; state: string }[] = [];
  return { asked, async judge(assertions: Assertion[], state: string) {
    asked.push({ assertions: structuredClone(assertions), state });
    return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
      model: 'jev-1.13.0' };
  } };
}

async function project(config: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), 'jev-driven-privacy-'));
  await mkdir(join(dir, '.jev'));
  await writeFile(join(dir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true, ...config }));
  return dir;
}

const signIn = { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none', values: ['user'] };
const verify = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
  assertions: [{ id: 'who', claim: `Home greets ${USER}.` }] };

async function run(input: { screens: Record<string, Element[]>; start: string; steps: unknown[]; jev?: FakeStep[];
  handback?: HandbackAnswer[]; config?: Record<string, unknown>; version?: 1 | 2; goal?: string }) {
  const dir = await project(input.config ?? {});
  try {
    const scenario = parseScriptedScenario({ version: input.version ?? 2, app: { bundleId: 'com.example.app' },
      ...(input.goal ? { goal: input.goal } : {}), values: { user: USER, pin: PIN }, steps: input.steps });
    const opened = await openDrivenProject(scenario, { JEV_PROJECT_DIR: dir, JEV_EXPERIMENTAL_DRIVEN: '1' });
    const log = recordingLog();
    const judge = recordingJudge();
    const handback = fakeHandback(input.handback ?? []);
    const hasDo = scenario.steps.some(step => step.kind === 'do');
    const report = await runScriptedScenario({ runId: 'driven', log, scenario, driver: graphDriver(input.screens, input.start),
      judge, ...(hasDo ? { driven: { judge: fakeDrivenJudge(input.jev ?? []), handback, ...opened!.drivenOptions(log) } } : {}) });
    const of = (type: RunEvent['type']) => log.events.filter(event => event.type === type).map(event => event.data);
    return { report, log, judge, handback, of };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const home = [text('t1', 'Home'), text('t2', `Signed in as ${USER}`)];

// ---------- #2: checkpoints in driven runs ----------

test('a driven run\'s checkpoint sends Jev its screen and claims with typed values masked', async () => {
  const { report, judge, of } = await run({ screens: { home }, start: 'home', steps: [signIn, verify],
    jev: [{ choice: 'step_done', confidence: 0.95, done: 0.95 }] });
  assert.equal(report.verdict, 'passed');
  assert.equal(judge.asked.length, 1);
  const sent = JSON.stringify(judge.asked);
  assert.ok(!sent.includes(USER), 'no typed value reaches the checkpoint judge');
  assert.match(judge.asked[0]!.state, /Signed in as ⟦value:user⟧/);
  assert.equal(judge.asked[0]!.assertions[0]!.claim, 'Home greets ⟦value:user⟧.');
  // The run log records what Jev read, and the claim as written.
  const step = of('step').find(event => event.stepId === 'verify')!;
  assert.match(String(step.assertionObservation), /⟦value:user⟧/);
  assert.ok(!String(step.assertionObservation).includes(USER));
  assert.equal((of('checkpoint')[0]!.assertions as { claim: string }[])[0]!.claim, `Home greets ${USER}.`);
});

test('a checkpoint on a local-only screen is not sent to Jev: INCONCLUSIVE LOCAL_ONLY_CHECKPOINT', async () => {
  const pinScreen = [text('t1', 'Home'), el('f1', 'text-field', { label: 'PIN', identifier: 'secure.pin', actions: ['typeText'] })];
  const { report, judge, handback, of } = await run({ screens: { pin: pinScreen }, start: 'pin',
    steps: [{ ...signIn, localOnly: true }, verify], handback: [{ kind: 'done' }],
    config: { localOnlyScreens: [{ identifier: '^secure\\.' }] } });
  assert.equal(handback.packets.length, 1);
  assert.equal(judge.asked.length, 0, 'the checkpoint judge was never called');
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'LOCAL_ONLY_CHECKPOINT');
  assert.equal(of('judgment').length, 0);
  assert.deepEqual(of('checkpoint').map(c => [c.stepId, c.status, c.reason]), [['verify', 'inconclusive', 'LOCAL_ONLY_CHECKPOINT']]);
  const step = of('step').find(event => event.stepId === 'verify')!;
  assert.equal(step.assertionObservation, undefined, 'nothing was rendered for Jev');
  assert.deepEqual(of('verdict').map(v => [v.verdict, v.reason]), [['inconclusive', 'LOCAL_ONLY_CHECKPOINT']]);
});

test('LOCAL_ONLY_CHECKPOINT is a documented reason code', () => {
  assert.match(REASON_CODES.LOCAL_ONLY_CHECKPOINT, /localOnlyScreens/);
});

test('without a do step, a version 2 checkpoint is sent as before: unmasked, local-only rules unused', async () => {
  const { report, judge } = await run({ screens: { home }, start: 'home', steps: [verify], goal: 'See home',
    config: { localOnlyScreens: [{ label: '^Home$' }] } });
  assert.equal(report.verdict, 'passed');
  assert.match(judge.asked[0]!.state, new RegExp(`Signed in as ${USER.replace('.', '\\.')}`));
  assert.equal(judge.asked[0]!.assertions[0]!.claim, `Home greets ${USER}.`);
});

test('a version 1 checkpoint is sent unmasked', async () => {
  const { report, judge } = await run({ screens: { home }, start: 'home', steps: [verify], version: 1 });
  assert.equal(report.verdict, 'passed');
  assert.ok(judge.asked[0]!.state.includes(USER));
});

// ---------- #6: the pause package ----------

function packet(extra: Partial<HandbackPacket> = {}): HandbackPacket {
  return { pauseId: 'p-1', reason: 'NONE_FITS', stepId: 'signIn', intent: `Sign in as ${USER}`,
    doneWhen: `Home greets ${USER}`, screen: `Welcome ${USER}, PIN ${PIN}`,
    topChoices: [{ key: `tap:${USER}`, probability: 0.41 }], valueKeys: ['user'],
    snapshot: { deviceId: 'fake', sequence: 1, capturedAt: 0, expiresAt: 60_000, truncated: false, elements: [
      el('f1', 'text-field', { label: 'Email', value: USER, actions: ['tap', 'typeText'] }),
      el('b1', 'button', { label: `Continue as ${USER}` }),
    ] }, ...extra };
}

function gateScenario() {
  return parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.app' },
    values: { user: USER, pin: PIN }, steps: [signIn, verify] });
}

function paused(gate: ReturnType<typeof createHandbackGate>): Promise<void> {
  return new Promise(done => { gate.onPause(done); });
}

test('the pause package and its rendering carry no typed value', async () => {
  const gate = createHandbackGate({ scenario: gateScenario(), now: () => 0 });
  const answer = gate.handback(packet(), new AbortController().signal);
  await paused(gate);
  const pause = gate.pending()!;
  const rendered = renderPause('run-1', pause, 0);
  for (const shown of [JSON.stringify(pause), rendered]) {
    assert.ok(!shown.includes(USER), shown);
    assert.ok(!shown.includes(PIN), shown);
  }
  assert.equal(pause.intent, 'Sign in as ⟦value:user⟧');
  assert.equal(pause.doneWhen, 'Home greets ⟦value:user⟧');
  assert.equal(pause.screen, 'Welcome ⟦value:user⟧, PIN ⟦value:pin⟧');
  assert.deepEqual(pause.topChoices, [{ key: 'tap:⟦value:user⟧', probability: 0.41 }]);
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
});

// ---------- #8: late answers ----------

test('an answer at or after expiresAt is refused and the pause ends HANDBACK_TIMEOUT, even if the timer is late', async () => {
  for (const late of [1_000, 5_000]) {
    let clock = 0;
    const gate = createHandbackGate({ scenario: gateScenario(), timeoutMs: 1_000, now: () => clock });
    const answer = gate.handback(packet(), new AbortController().signal);
    await paused(gate);
    assert.equal(gate.pending()!.expiresAt, new Date(1_000).toISOString());
    // The event loop stalled: the clock passed the deadline, but the timer callback hasn't run.
    clock = late;
    assert.throws(() => gate.resolve('p-1', { kind: 'done' }),
      (error: unknown) => error instanceof HandbackAnswerError && /expired/.test(error.message));
    await assert.rejects(answer, (error: unknown) => error instanceof HandbackTimeoutError);
    assert.equal(gate.pending(), undefined);
  }
});

test('an expired pause is not offered to Claude, even before the timer runs', async () => {
  let clock = 0;
  const gate = createHandbackGate({ scenario: gateScenario(), timeoutMs: 1_000, now: () => clock });
  const answer = gate.handback(packet(), new AbortController().signal);
  await paused(gate);
  clock = 1_000;
  assert.equal(gate.pending(), undefined);
  await assert.rejects(answer, (error: unknown) => error instanceof HandbackTimeoutError);
});

test('an answer just before expiresAt is accepted', async () => {
  let clock = 0;
  const gate = createHandbackGate({ scenario: gateScenario(), timeoutMs: 1_000, now: () => clock });
  const answer = gate.handback(packet(), new AbortController().signal);
  await paused(gate);
  clock = 999;
  gate.resolve('p-1', { kind: 'done' });
  assert.deepEqual(await answer, { kind: 'done' });
});

test('masking an already masked text changes nothing, even when a value occurs inside a marker', () => {
  const values = { pin: 'pin', v: 'v', user: USER };
  const once = maskValues(`Enter pin for ${USER}, v`, values);
  assert.equal(once, 'Enter ⟦value:pin⟧ for ⟦value:user⟧, ⟦value:v⟧');
  assert.equal(maskValues(once, values), once);
});
