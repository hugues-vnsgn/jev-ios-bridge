/**
 * Local-only screens (E14) and the preflight (E12) inside a run (Issue 09): `runScriptedScenario` with a fake
 * driver (named screens), the fake Jev from tests/fixtures/driven-judge.ts, a fake hand-back and the project's
 * driven options from a temporary project folder. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Action, DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import type { HandbackAnswer, HandbackPacket } from '../src/driven/step.js';
import { openDrivenProject } from '../src/driven/project.js';
import { fakeDrivenJudge, type FakeStep } from './fixtures/driven-judge.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const button = (ref: string, label: string, extra: Partial<Element> = {}) => el(ref, 'button', { label, ...extra });
const text = (ref: string, label: string, extra: Partial<Element> = {}) => el(ref, 'text', { label, actions: [], ...extra });
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

/** A device whose screens are named; `moves['screen key']` is the screen an action leads to (else it stays). */
function graphDriver(screens: Record<string, Element[]>, start: string, moves: Record<string, string> = {}) {
  let current = start;
  let sequence = 0;
  const acts: string[] = [];
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current });
  const driver: DeviceDriver = {
    async prepare() {},
    async observe() { return shot(); },
    async act(action) {
      const key = actionKey(action);
      acts.push(`${current} ${key}`);
      current = moves[`${current} ${key}`] ?? current;
      return shot();
    },
    actPath: () => undefined,
    async close() {},
  };
  return Object.assign(driver, { acts });
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

const doStep = (id: string, effect = 'none') => ({ id, kind: 'do', intent: `Do ${id}`, doneWhen: 'Home shows', effect });
const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
  assertions: [{ id: 'shown', claim: 'Home is shown.' }] };
const passingJudge = { async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
    model: 'jev-1.13.0' };
} };

/** A project folder with driven mode on and the given `.jev/` files. */
async function project(config: Record<string, unknown>, preflight?: unknown) {
  const dir = await mkdtemp(join(tmpdir(), 'jev-driven-project-'));
  await mkdir(join(dir, '.jev'));
  await writeFile(join(dir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true, ...config }));
  if (preflight !== undefined) await writeFile(join(dir, '.jev', 'preflight.json'), JSON.stringify(preflight));
  return dir;
}

async function run(input: { dir: string; driver: ReturnType<typeof graphDriver>; steps: unknown[]; judge: FakeStep[];
  handback?: HandbackAnswer[] }) {
  const scenario = parseScriptedScenario({ version: 2, app: { bundleId: 'com.example.app' }, values: {},
    steps: input.steps });
  const opened = await openDrivenProject(scenario, { JEV_PROJECT_DIR: input.dir, JEV_EXPERIMENTAL_DRIVEN: '1' });
  const log = recordingLog();
  const judge = fakeDrivenJudge(input.judge);
  const handback = fakeHandback(input.handback ?? []);
  const report = await runScriptedScenario({ runId: 'driven', log, scenario, driver: input.driver,
    judge: passingJudge, driven: { judge, handback, ...opened!.drivenOptions(log) } });
  const of = (type: RunEvent['type']) => log.events.filter(event => event.type === type).map(event => event.data);
  return { report, log, judge, handback, of };
}

// ---------- local-only screens (E14) ----------

test('a local-only screen goes to Claude without a Jev call; Jev takes over on the next screen', async () => {
  const dir = await project({ localOnlyScreens: [{ identifier: '^payment\\.' }] });
  try {
    const screens = {
      pay: [text('t1', 'Pay with card'), el('f1', 'text-field', { label: 'Card', identifier: 'payment.card' }),
        button('b1', 'Continue')],
      home: [text('t2', 'Home')],
    };
    const driver = graphDriver(screens, 'pay', { 'pay tap:b1': 'home' });
    const { report, judge, handback, of } = await run({ dir, driver, steps: [doStep('checkout'), checkpoint],
      judge: [{ choice: 'step_done', confidence: 0.95, done: 0.96 }], handback: [{ kind: 'tap', ref: 'b1' }] });
    assert.equal(report.verdict, 'passed');
    assert.equal(handback.packets.length, 1);
    assert.equal(handback.packets[0]!.reason, 'LOCAL_ONLY_SCREEN');
    assert.deepEqual(handback.packets[0]!.topChoices, []);
    // Jev saw only the home screen.
    assert.equal(judge.asked.length, 1);
    assert.ok(!JSON.stringify(judge.asked).includes('Card'));
    assert.deepEqual(driver.acts, ['pay tap:b1']);
    assert.deepEqual(of('handback').map(h => h.reason), ['LOCAL_ONLY_SCREEN']);
    assert.deepEqual(of('action').map(a => a.decidedBy), ['claude']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a local-only screen reached by the target search goes to Claude without a Jev call', async () => {
  const dir = await project({ localOnlyScreens: [{ label: '^PIN$' }] });
  try {
    const screens = {
      top: [list('l1'), text('t1', 'Settings')],
      pin: [list('l1'), text('t2', 'PIN')],
      home: [text('t3', 'Home')],
    };
    const driver = graphDriver(screens, 'top', { 'top scroll:down': 'pin', 'pin back': 'home' });
    const { report, judge, handback, of } = await run({ dir, driver, steps: [doStep('find'), checkpoint],
      judge: [{ choice: 'none_fits', confidence: 0.9 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
      handback: [{ kind: 'back' }] });
    assert.equal(report.verdict, 'passed');
    assert.deepEqual(of('search').map(s => s.direction), ['down']);
    assert.deepEqual(handback.packets.map(p => p.reason), ['LOCAL_ONLY_SCREEN']);
    assert.match(handback.packets[0]!.screen, /PIN/, 'Claude still sees the screen');
    assert.equal(judge.asked.length, 2);
    assert.ok(!JSON.stringify(judge.asked).includes('PIN'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('without matching rules, every screen goes to Jev as before', async () => {
  const dir = await project({ localOnlyScreens: [{ identifier: 'nothing-here' }] });
  try {
    const driver = graphDriver({ home: [text('t1', 'Home')] }, 'home');
    const { report, judge, handback } = await run({ dir, driver, steps: [doStep('see'), checkpoint],
      judge: [{ choice: 'step_done', confidence: 0.95, done: 0.95 }] });
    assert.equal(report.verdict, 'passed');
    assert.equal(judge.asked.length, 1);
    assert.equal(handback.packets.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- the preflight (E12) ----------

const node = process.execPath;
const settings = {
  form: [text('t1', 'Settings'), button('b1', 'Save')],
  home: [text('t2', 'Home')],
};

test('a passed preflight lets Jev perform a test write; it runs once, before the first test_write step', async () => {
  const dir = await project({}, { command: [node, '-e', 'process.exit(0)'] });
  try {
    const driver = graphDriver(settings, 'form', { 'form tap:b1': 'home' });
    const { report, log, of } = await run({ dir, driver,
      steps: [doStep('look'), doStep('save', 'test_write'), doStep('again', 'test_write'), checkpoint],
      judge: [
        { choice: 'none_fits', confidence: 0.9, done: 0.95 },
        { choice: 'tap:b1', confidence: 0.95 },
        { choice: 'step_done', confidence: 0.95, done: 0.95 },
        { choice: 'step_done', confidence: 0.95, done: 0.95 },
      ] });
    assert.equal(report.verdict, 'passed');
    assert.deepEqual(driver.acts, ['form tap:b1']);
    assert.deepEqual(of('preflight').map(p => [p.status, p.exitCode]), [['ok', 0]]);
    // After the first step (no test write) finished, before the test_write step's first observation.
    const types = log.events.map(event => `${event.type}:${event.data.stepId ?? ''}`);
    const preflightAt = types.indexOf('preflight:');
    assert.ok(preflightAt > types.lastIndexOf('decision:look'));
    assert.ok(preflightAt < types.indexOf('step:save'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a failed preflight sends the test write to Claude as NO_PREFLIGHT; the run log has no command output', async () => {
  const dir = await project({}, { command: [node, '-e', 'console.log("PREFLIGHT_SECRET_OUTPUT"); process.exit(2)'] });
  try {
    const driver = graphDriver(settings, 'form', { 'form tap:b1': 'home' });
    const { report, log, handback, of } = await run({ dir, driver, steps: [doStep('save', 'test_write'), checkpoint],
      judge: [{ choice: 'tap:b1', confidence: 0.95 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
      handback: [{ kind: 'tap', ref: 'b1' }] });
    assert.equal(report.verdict, 'passed');
    assert.deepEqual(handback.packets.map(p => p.reason), ['NO_PREFLIGHT']);
    assert.deepEqual(of('action').map(a => a.decidedBy), ['claude']);
    assert.deepEqual(of('preflight').map(p => [p.status, p.exitCode, p.failure]), [['failed', 2, 'exit']]);
    assert.ok(!JSON.stringify(log.events).includes('PREFLIGHT_SECRET_OUTPUT'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('no preflight file: logged missing, and test writes go to Claude', async () => {
  const dir = await project({});
  try {
    const driver = graphDriver(settings, 'form', { 'form tap:b1': 'home' });
    const { handback, of } = await run({ dir, driver, steps: [doStep('save', 'test_write'), checkpoint],
      judge: [{ choice: 'tap:b1', confidence: 0.95 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
      handback: [{ kind: 'tap', ref: 'b1' }] });
    assert.deepEqual(handback.packets.map(p => p.reason), ['NO_PREFLIGHT']);
    assert.deepEqual(of('preflight').map(p => p.status), ['missing']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a timed-out preflight is failed and test writes go to Claude', async () => {
  const dir = await project({}, { command: [node, '-e', 'setInterval(() => {}, 1000)'], timeoutMs: 200 });
  try {
    const driver = graphDriver(settings, 'form', { 'form tap:b1': 'home' });
    const { handback, of } = await run({ dir, driver, steps: [doStep('save', 'test_write'), checkpoint],
      judge: [{ choice: 'tap:b1', confidence: 0.95 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
      handback: [{ kind: 'tap', ref: 'b1' }] });
    assert.deepEqual(handback.packets.map(p => p.reason), ['NO_PREFLIGHT']);
    assert.deepEqual(of('preflight').map(p => [p.status, p.failure]), [['failed', 'timeout']]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a run with no test_write step never runs the preflight', async () => {
  const dir = await project({}, { command: [node, '-e', 'process.exit(0)'] });
  try {
    // A read-only step on a control with no write word: a read-only pick of Save would go to Claude.
    const driver = graphDriver({ ...settings, form: [text('t1', 'Settings'), button('b1', 'Home')] }, 'form', { 'form tap:b1': 'home' });
    const { report, of } = await run({ dir, driver, steps: [doStep('save'), checkpoint],
      judge: [{ choice: 'tap:b1', confidence: 0.95 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }] });
    assert.equal(report.verdict, 'passed');
    assert.deepEqual(of('preflight'), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
