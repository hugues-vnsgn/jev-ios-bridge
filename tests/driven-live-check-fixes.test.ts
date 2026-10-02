/**
 * Fixes from the first live checks (Issue 17, `.worktrees/handoffs/jev-drives/live-checks.md`, "Bugs found"):
 * the pause package shows the numbers the bridge decided with; the report credits the bridge's search scrolls and
 * who completed each `do` step; the package's screenshot is the run's own evidence file; the version reads 1.3.0;
 * and the target search doesn't scroll an unscrollable screen again once a search scroll left that screen unchanged.
 * Fakes only: no device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Action, DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { createHandbackGate, renderPause } from '../src/driven/handback.js';
import { searchScreenKey, type HandbackAnswer, type HandbackPacket } from '../src/driven/step.js';
import { buildScriptedReport, renderScriptedReport } from '../src/scripted/report.js';
import { buildReportJson } from '../src/scripted/report-json.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { BridgeService } from '../src/service.js';
import { BRIDGE_VERSION } from '../src/version.js';
import { fakeDrivenJudge, type FakeStep } from './fixtures/driven-judge.js';

// ---------- fakes ----------

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const button = (ref: string, label: string) => el(ref, 'button', { label });
const text = (ref: string, label: string) => el(ref, 'text', { label, actions: [] });

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

/** Named screens; `moves['screen key']` is where an action leads. Screenshots are temp-style paths, as drivers give. */
function graphDriver(screens: Record<string, Element[]>, start: string, moves: Record<string, string> = {},
  screenshot?: string) {
  let current = start;
  let sequence = 0;
  const acts: string[] = [];
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current,
    screenshotPath: screenshot ?? `/var/folders/T/screenshot_optimized_${sequence}.jpg` });
  const driver: DeviceDriver & { acts: string[] } = {
    acts,
    async prepare() {},
    async observe() { return shot(); },
    async act(action) {
      const key = actionKey(action);
      acts.push(`${current} ${key}`);
      current = moves[`${current} ${key}`] ?? current;
      return shot();
    },
    actPath: () => ({ path: 'screen-middle' }),
    async close() {},
  };
  return driver;
}

/** A log that stores a `step` event's screenshot as the run's own `screen-<sequence>.jpg`, as the real log does. */
function evidenceLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) {
      const sequence = events.length + 1;
      const stored = type === 'step' && typeof data.screenshotPath === 'string'
        ? { ...data, screenshotPath: `screen-${sequence}.jpg` } : data;
      events.push({ version: 1, runId: 'driven', sequence, at: new Date().toISOString(), type, data: structuredClone(stored) });
    },
    async read() { return events; },
  };
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

const doStep = (extra: Record<string, unknown> = {}) => ({ id: 'signIn', kind: 'do', intent: 'Sign in',
  doneWhen: 'The home screen shows', effect: 'none', ...extra });
const checkpoint = (label = 'Home') => ({ id: 'verify', kind: 'checkpoint',
  guard: { present: [{ role: 'text', label }] }, assertions: [{ id: 'shown', claim: `${label} is shown.` }] });
const passingJudge = { async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
    model: 'jev-1.13.0' };
} };

async function run(input: { driver: DeviceDriver; judge: FakeStep[]; handback?: HandbackAnswer[]; steps?: unknown[];
  testWritesAllowed?: boolean }) {
  const log = evidenceLog();
  const handback = fakeHandback(input.handback ?? []);
  const report = await runScriptedScenario({ runId: 'driven', log,
    scenario: parseScriptedScenario({ version: 2, app: { bundleId: 'com.example.app' },
      values: { user: 'ops@example.com' }, steps: input.steps ?? [doStep(), checkpoint()] }),
    driver: input.driver, judge: passingJudge,
    driven: { judge: fakeDrivenJudge(input.judge), handback, testWritesAllowed: input.testWritesAllowed ?? false } });
  const of = (type: RunEvent['type']) => log.events.filter(event => event.type === type).map(event => event.data);
  return { report, log, handback, of };
}

const signIn = { login: [text('t1', 'Welcome'), button('b1', 'Sign in')], home: [text('t3', 'Home')] };
const signInMoves = { 'login tap:b1': 'home' };

// ---------- 1. the package's numbers ----------

test('a LOW_CONFIDENCE package carries the confidence the floor was compared with, the floor and the done probability', async () => {
  const driver = graphDriver(signIn, 'login', signInMoves);
  const { handback } = await run({ driver, judge: [
    // The option probability (0.82) is over the floor; the confidence (0.78) is what the bridge compares.
    { choice: 'tap:b1', confidence: 0.78, done: 0.04, probabilities: { 'tap:b1': 0.82, back: 0.1, none_fits: 0.08 } },
    { choice: 'step_done', confidence: 0.95, done: 0.96 },
  ], handback: [{ kind: 'tap', ref: 'b1' }] });
  const [packet] = handback.packets;
  assert.equal(packet!.reason, 'LOW_CONFIDENCE');
  assert.deepEqual(packet!.jevDecision, { choice: 'tap:b1', confidence: 0.78, done: 0.04 });
  assert.equal(packet!.confidenceFloor, 0.8);
  assert.deepEqual(packet!.topChoices[0], { key: 'tap:b1', probability: 0.82 });
});

test('a test_write step\'s package names the 0.90 floor; a destructive step\'s names none', async () => {
  const write = await run({ driver: graphDriver(signIn, 'login', signInMoves), testWritesAllowed: true,
    steps: [doStep({ effect: 'test_write' }), checkpoint()],
    judge: [{ choice: 'tap:b1', confidence: 0.85, done: 0.02 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
    handback: [{ kind: 'tap', ref: 'b1' }] });
  assert.equal(write.handback.packets[0]!.confidenceFloor, 0.9);

  const destructive = await run({ driver: graphDriver(signIn, 'login', signInMoves),
    steps: [doStep({ effect: 'destructive' }), checkpoint()],
    judge: [{ choice: 'none_fits', confidence: 0.5, done: 0.3 }],
    handback: [{ kind: 'tap', ref: 'b1' }, { kind: 'done' }] });
  const [first, second] = destructive.handback.packets;
  // The first pause asks Jev nothing; the later one shows Jev's numbers, and no floor: the bridge never acts there.
  assert.equal(first!.jevDecision, undefined);
  assert.equal(first!.confidenceFloor, null);
  assert.deepEqual(second!.jevDecision, { choice: 'none_fits', confidence: 0.5, done: 0.3 });
});

test('a test_write step without a passed preflight names no floor: Jev\'s pick is never taken there', async () => {
  const { handback } = await run({ driver: graphDriver(signIn, 'login', signInMoves),
    steps: [doStep({ effect: 'test_write' }), checkpoint()],
    judge: [{ choice: 'tap:b1', confidence: 0.96, done: 0.02 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
    handback: [{ kind: 'tap', ref: 'b1' }] });
  assert.equal(handback.packets[0]!.reason, 'NO_PREFLIGHT');
  assert.equal(handback.packets[0]!.confidenceFloor, null);
});

const gateScenario = parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.app' },
  values: { user: 'ops@example.com' }, steps: [{ ...doStep(), values: ['user'] }, checkpoint()] });

function packet(extra: Partial<HandbackPacket> = {}): HandbackPacket {
  return { pauseId: 'p-1', reason: 'LOW_CONFIDENCE', stepId: 'signIn', intent: 'Sign in', doneWhen: 'Home shows',
    screen: 'Screen', topChoices: [{ key: 'tap:b1', probability: 0.82 }, { key: 'back', probability: 0.1 }],
    jevDecision: { choice: 'tap:b1', confidence: 0.78, done: 0.04 }, confidenceFloor: 0.8, valueKeys: ['user'],
    snapshot: { deviceId: 'fake', sequence: 1, capturedAt: 0, expiresAt: 60_000, truncated: false,
      elements: [button('b1', 'Sign in')] }, ...extra };
}

async function pauseOf(input: HandbackPacket, options: { evidenceDir?: string } = {}) {
  const gate = createHandbackGate({ scenario: gateScenario, now: () => 0, ...options });
  const opened = new Promise<void>(done => { gate.onPause(done); });
  const answer = gate.handback(input, new AbortController().signal);
  await opened;
  const pause = gate.pending()!;
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
  return pause;
}

test('the pause shows Jev\'s confidence, the floor, the done probability and its floor, each labelled', async () => {
  const pause = await pauseOf(packet());
  assert.deepEqual(pause.jevDecision, { choice: 'tap:b1', confidence: 0.78, done: 0.04 });
  assert.equal(pause.confidenceFloor, 0.8);
  assert.equal(pause.doneFloor, 0.9);
  const rendered = renderPause('run-1', pause, 0);
  assert.match(rendered, /^Jev's choice: tap:b1, confidence 0\.78; the bridge takes a pick at confidence 0\.80 or more$/m);
  assert.match(rendered, /^Jev's step-done probability: 0\.04; the step is done at 0\.90 or more$/m);
  assert.match(rendered, /^Jev's top picks: tap:b1 \(0\.82\), back \(0\.10\) \(each option's probability, not Jev's confidence\)$/m);
  // The confidence comes before the per-option probabilities.
  assert.ok(rendered.indexOf("Jev's choice:") < rendered.indexOf("Jev's top picks:"));
});

test('a pause with no floor says the bridge never takes Jev\'s pick in this step', async () => {
  const rendered = renderPause('run-1', await pauseOf(packet({ reason: 'DESTRUCTIVE_STEP', confidenceFloor: null })), 0);
  assert.match(rendered, /^Jev's choice: tap:b1, confidence 0\.78; the bridge never takes Jev's pick in this step$/m);
});

test('a pause Jev wasn\'t asked about shows no numbers', async () => {
  const { jevDecision: _asked, ...unasked } = packet({ reason: 'DESTRUCTIVE_STEP', topChoices: [], confidenceFloor: null });
  const rendered = renderPause('run-1', await pauseOf(unasked), 0);
  assert.match(rendered, /^Jev's choice: none \(Jev was not asked about this screen\)$/m);
  assert.match(rendered, /^Jev's top picks: none \(Jev was not asked about this screen\)$/m);
  assert.doesNotMatch(rendered, /step-done probability/);
});

test('Jev\'s choice in the pause is masked like its picks', async () => {
  const pause = await pauseOf(packet({ jevDecision: { choice: 'tap:ops@example.com', confidence: 0.5, done: 0.1 } }));
  assert.equal(pause.jevDecision!.choice, 'tap:⟦value:user⟧');
});

// ---------- 2. credit in the report ----------

const T0 = Date.parse('2026-10-01T08:00:00.000Z');
function events(entries: Array<[RunEvent['type'], Record<string, unknown>]>): RunEvent[] {
  return entries.map(([type, data], index) => ({ version: 1, runId: 'driven-run', sequence: index + 1,
    at: new Date(T0 + index * 1_000).toISOString(), type, data }));
}
const where = (step: number, stepId: string) => ({ step, stepId });

/** Step 1 by Jev after a search scroll, step 2 declared done by Claude, step 3 never done (stopped). */
const creditRun = events([
  ['started', { mode: 'scripted', bundleId: 'com.example.app', bridgeVersion: '1.3.0', jevModel: 'jev-1.13.0',
    plannedSteps: [{ id: 'open', kind: 'do' }, { id: 'delete', kind: 'do' }, { id: 'save', kind: 'do' }] }],
  ['step', { ...where(1, 'open'), kind: 'do', snapshotSequence: 1 }],
  ['decision', { ...where(1, 'open'), decision: 1, choice: 'none_fits', confidence: 0.7, done: 0.02, inputTokens: 10 }],
  ['search', { ...where(1, 'open'), direction: 'down', attempt: 1, changed: true, actPath: 'scroll-within',
    actPathRef: 'l1', actDurationMs: 40 }],
  ['step', { ...where(1, 'open'), kind: 'do', snapshotSequence: 2 }],
  ['decision', { ...where(1, 'open'), decision: 2, choice: 'tap:e17', confidence: 0.99, done: 0.02, inputTokens: 10 }],
  ['action', { ...where(1, 'open'), action: 'tap', resolvedRef: 'e17', decidedBy: 'jev', key: 'tap:e17', confidence: 0.99 }],
  ['step', { ...where(1, 'open'), kind: 'do', snapshotSequence: 3 }],
  ['decision', { ...where(1, 'open'), decision: 3, choice: 'step_done', confidence: 0.9, done: 0.97, stepDone: true,
    inputTokens: 10 }],
  ['step', { ...where(2, 'delete'), kind: 'do', snapshotSequence: 4 }],
  ['handback', { ...where(2, 'delete'), reason: 'DESTRUCTIVE_STEP', pauseId: 'p-1' }],
  ['handback_answer', { ...where(2, 'delete'), pauseId: 'p-1', kind: 'done', stepDone: true, decidedBy: 'claude' }],
  ['step', { ...where(3, 'save'), kind: 'do', snapshotSequence: 5 }],
  ['handback', { ...where(3, 'save'), reason: 'LOCAL_ONLY_STEP', pauseId: 'p-2' }],
  ['handback_answer', { ...where(3, 'save'), pauseId: 'p-2', kind: 'stop' }],
  ['verdict', { verdict: 'inconclusive', reason: 'STOPPED_BY_CLAUDE', steps: 3 }],
]);

test('report.json lists the target search\'s scrolls as actions decided by the bridge, in order', () => {
  assert.deepEqual(buildReportJson(creditRun).driven!.actions, [
    { stepId: 'open', action: 'scroll', direction: 'down', decidedBy: 'bridge', changed: true },
    { stepId: 'open', action: 'tap', ref: 'e17', decidedBy: 'jev', key: 'tap:e17', confidence: 0.99 },
  ]);
});

test('report.json credits each do step\'s completion: Jev\'s done check, Claude\'s done, or not done', () => {
  assert.deepEqual(buildReportJson(creditRun).driven!.doSteps, [
    { stepId: 'open', completedBy: 'jev', done: 0.97 },
    { stepId: 'delete', completedBy: 'claude' },
    { stepId: 'save', completedBy: null },
  ]);
});

test('a do step run twice (revised to retry it) is listed twice', () => {
  const run = events([
    ['started', { mode: 'scripted', bundleId: 'com.example.app', plannedSteps: [{ id: 'open', kind: 'do' }] }],
    ['step', { ...where(1, 'open'), kind: 'do', snapshotSequence: 1 }],
    ['handback', { ...where(1, 'open'), reason: 'NONE_FITS', pauseId: 'p-1' }],
    ['handback_answer', { ...where(1, 'open'), pauseId: 'p-1', kind: 'revise', steps: [{ id: 'open', kind: 'do' }] }],
    ['step', { ...where(2, 'open'), kind: 'do', snapshotSequence: 2 }],
    ['decision', { ...where(2, 'open'), decision: 1, choice: 'step_done', confidence: 0.9, done: 0.93, stepDone: true }],
  ]);
  assert.deepEqual(buildReportJson(run).driven!.doSteps, [
    { stepId: 'open', completedBy: null }, { stepId: 'open', completedBy: 'jev', done: 0.93 }]);
});

test('the text report names the bridge\'s scrolls and who completed each do step', () => {
  const rendered = renderScriptedReport(buildScriptedReport(creditRun));
  assert.match(rendered, /^open: scroll down \(the screen changed\), decided by the bridge \(target search\)\.$/m);
  assert.match(rendered, /^Do steps:$/m);
  assert.match(rendered, /^open: done, by Jev's done check \(0\.970\)\.$/m);
  assert.match(rendered, /^delete: done, declared by Claude\.$/m);
  assert.match(rendered, /^save: not done\.$/m);
});

// ---------- 2b. the watch page ----------

interface FakeNode { tag: string; textContent: string; className: string; children: FakeNode[]; append(...nodes: FakeNode[]): void }
function node(tag: string): FakeNode {
  const created: FakeNode = { tag, textContent: '', className: '', children: [],
    append(...nodes) { created.children.push(...nodes); } };
  return created;
}
const texts = (root: FakeNode): string[] => [root.textContent, ...root.children.flatMap(texts)].filter(Boolean);

async function watchCards(entries: RunEvent[]): Promise<string> {
  const { createRunLog } = await import('../src/log/index.js');
  const { startWatchServer } = await import('../src/watch/index.js');
  const root = await mkdtemp(join(tmpdir(), 'jev-watch-credit-'));
  const watch = await startWatchServer(root);
  try {
    const log = await createRunLog(root, 'credit');
    for (const event of entries) await log.append(event.type, event.data);
    const url = new URL(watch.urlFor('credit'));
    const script = await (await fetch(new URL('/app.js', url))).text();
    const timeline = node('section');
    const document = { title: '', createElement: node,
      querySelector: (selector: string) => ({ '#status': node('p'), '#timeline': timeline, h1: node('h1') })[selector] };
    let rendered!: () => void;
    const done = new Promise<void>(resolve => { rendered = resolve; });
    new Function('document', 'location', 'fetch', 'setTimeout', 'URL', script)(document, { search: url.search },
      (path: string, init: RequestInit) => fetch(new URL(path, url), init), () => rendered(), { createObjectURL: () => '' });
    await done;
    return timeline.children.map(card => texts(card).join('\n')).join('\n---\n');
  } finally { await watch.close(); await rm(root, { recursive: true, force: true }); }
}

test('the watch page credits the bridge\'s scrolls and says who completed a step', async () => {
  const cards = await watchCards(creditRun);
  assert.match(cards, /Scrolled down \(attempt 1\): the screen changed\. Decided by the bridge \(target search\)\./);
  assert.match(cards, /Jev decision 3: step_done, confidence 90%; step done 97%\. Jev judged the step done\./);
  assert.match(cards, /Claude answered done after \d+ s\. Claude declared the step done\./);
});

// ---------- 4. the screenshot is the run's own evidence file ----------

test('the package\'s screenshot is the run\'s own screen-N.jpg, not the driver\'s temp file', async () => {
  const { handback, log } = await run({ driver: graphDriver(signIn, 'login', signInMoves),
    judge: [{ choice: 'none_fits', confidence: 0.9 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
    handback: [{ kind: 'tap', ref: 'b1' }] });
  const path = handback.packets[0]!.screenshotPath;
  assert.match(path ?? '', /^screen-\d+\.jpg$/);
  // It is the file the step event that observed the paused screen recorded: the last one before the pause.
  const pausedAt = log.events.find(event => event.type === 'handback')!.sequence;
  const observed = log.events.findLast(event => event.type === 'step' && event.sequence < pausedAt)!;
  assert.equal(observed.data.screenshotPath, path);
});

test('the gate resolves an evidence file name inside the run folder and reads its size there', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-evidence-'));
  try {
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'ascii'); png.writeUInt32BE(360, 16); png.writeUInt32BE(800, 20);
    await writeFile(join(dir, 'screen-7.png'), png);
    const pause = await pauseOf(packet({ screenshotPath: 'screen-7.png' }), { evidenceDir: dir });
    assert.equal(pause.screenshotPath, join(dir, 'screen-7.png'));
    assert.deepEqual(pause.screenshotSize, { width: 360, height: 800 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('through the service, a pause points at the screenshot in the run\'s evidence folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-evidence-service-'));
  const projectDir = join(root, 'project');
  await mkdir(join(projectDir, '.jev'), { recursive: true });
  await writeFile(join(projectDir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true }));
  const shot = join(root, 'driver-temp.jpg');
  await writeFile(shot, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const service = new BridgeService({ baseDir: join(root, 'runs'),
    createDriver: () => graphDriver(signIn, 'login', signInMoves, shot),
    env: { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '1' },
    createJudge: () => passingJudge,
    createDrivenJudge: () => fakeDrivenJudge([{ choice: 'none_fits', confidence: 0.9 },
      { choice: 'step_done', confidence: 0.95, done: 0.95 }]) });
  try {
    const { runId } = await service.start({ version: 2, app: { bundleId: 'com.example.app' }, values: {},
      steps: [doStep(), checkpoint()] });
    const status = await service.status(runId, 5_000);
    assert.equal(status.state, 'needs_claude');
    const path = status.pause!.screenshotPath!;
    assert.equal(path.startsWith(join(service.baseDir, runId) + '/'), true, path);
    assert.match(path, /\/screen-\d+\.jpg$/);
    assert.deepEqual(await readFile(path), await readFile(shot));
    await service.resolve(runId, status.pause!.pauseId, { kind: 'tap', ref: 'b1' });
    assert.equal((await service.status(runId, 5_000)).state, 'finished');
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

// ---------- 5. version ----------

test('the bridge version is 1.3.0', async () => {
  assert.equal(BRIDGE_VERSION, '1.3.0');
  assert.equal(JSON.parse(await readFile('package.json', 'utf8')).version, '1.3.0');
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(lock.version, '1.3.0');
  assert.equal(lock.packages[''].version, '1.3.0');
});

// ---------- 6. no second search scroll on an unscrollable screen that one left unchanged ----------

const flat = { a: [text('t1', 'Detail A'), button('b1', 'Next')], b: [text('t2', 'Detail B'), button('b2', 'Done')],
  c: [text('t3', 'Home')] };

test('a screen whose search scroll changed nothing isn\'t scrolled again; a new unscrollable screen still is', async () => {
  // a → b → a: the first step scrolls a, the second scrolls b (a new screen), the third doesn't scroll a again.
  const driver = graphDriver(flat, 'a', { 'a tap:b1': 'b', 'b tap:b2': 'a' });
  const { report, of, handback } = await run({ driver,
    steps: [doStep({ id: 'first' }), doStep({ id: 'second' }), doStep({ id: 'third' }), checkpoint('Detail A')],
    judge: [
      { choice: 'none_fits', confidence: 0.9 }, { choice: 'step_done', confidence: 0.95, done: 0.95 },
      { choice: 'none_fits', confidence: 0.9 }, { choice: 'step_done', confidence: 0.95, done: 0.95 },
      { choice: 'none_fits', confidence: 0.9 },
    ], handback: [{ kind: 'tap', ref: 'b1' }, { kind: 'tap', ref: 'b2' }, { kind: 'done' }] });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(of('search').map(search => [search.stepId, search.changed]), [['first', false], ['second', false]]);
  assert.deepEqual(driver.acts, ['a scroll:down', 'a tap:b1', 'b scroll:down', 'b tap:b2']);
  assert.equal(handback.packets.length, 3);
});

test('a search scroll that changed an unscrollable screen keeps that screen\'s searches scrolling', async () => {
  const screens = { ...flat, a2: [text('t4', 'Detail A, further'), button('b1', 'Next')] };
  const driver = graphDriver(screens, 'a', { 'a scroll:down': 'a2', 'a2 tap:b1': 'b', 'b tap:b2': 'c' });
  const { of } = await run({ driver, steps: [doStep({ id: 'first' }), doStep({ id: 'second' }), checkpoint()], judge: [
    { choice: 'none_fits', confidence: 0.9 }, { choice: 'tap:b1', confidence: 0.95 },
    { choice: 'step_done', confidence: 0.95, done: 0.95 },
    { choice: 'none_fits', confidence: 0.9 }, { choice: 'step_done', confidence: 0.95, done: 0.95 },
  ], handback: [{ kind: 'tap', ref: 'b2' }] });
  assert.deepEqual(of('search').map(search => [search.stepId, search.changed]), [['first', true], ['second', false]]);
});

test('without a screen hash, a screen is keyed by its visible elements\' role, label and identifier', () => {
  const shot = (elements: Element[], screenHash?: string): Snapshot => ({ deviceId: 'fake', capturedAt: 0,
    expiresAt: 1, sequence: 1, truncated: false, elements, ...(screenHash ? { screenHash } : {}) });
  const screen = [text('t1', 'Detail A'), button('b1', 'Next')];
  const renumbered = [text('e7', 'Detail A'), { ...button('e8', 'Next'), frame: { x: 0, y: 0, width: 5, height: 5 } }];
  const withHidden = [...screen, el('h1', 'button', { label: 'Hidden', state: { visible: false, enabled: true } })];
  assert.equal(searchScreenKey(shot(screen)), searchScreenKey(shot(renumbered)));
  assert.equal(searchScreenKey(shot(screen)), searchScreenKey(shot(withHidden)));
  assert.notEqual(searchScreenKey(shot(screen)), searchScreenKey(shot([text('t1', 'Detail B'), button('b1', 'Next')])));
  assert.equal(searchScreenKey(shot(screen, 'h-1')), searchScreenKey(shot([text('x', 'Other')], 'h-1')));
});
