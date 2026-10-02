/**
 * Hand-back through the service (Issue 08): a paused run reports needs_claude at once, holds the device until it
 * ends, and takes Claude's answer through `resolve`. Fake driver, fake Jev; no device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Action, DeviceDriver, Element, Snapshot } from '../src/contracts/index.js';
import { HandbackAnswerError } from '../src/driven/handback.js';
import { readRunEvents } from '../src/log/index.js';
import { BridgeService } from '../src/service.js';
import { fakeDrivenJudge, type FakeStep } from './fixtures/driven-judge.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const screens: Record<string, Element[]> = {
  login: [el('t1', 'text', { label: 'Welcome', actions: [] }), el('b1', 'button', { label: 'Sign in' })],
  home: [el('t3', 'text', { label: 'Home', actions: [] })],
};

interface FakeDevice extends DeviceDriver { readonly acts: string[]; closes: number }

/** Two screens: tapping b1 on login leads home. `close` stands for releasing the device lease. */
function device(): FakeDevice {
  let current = 'login';
  let sequence = 0;
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current });
  const driver: FakeDevice = {
    acts: [], closes: 0,
    async prepare() {},
    async observe() { return shot(); },
    async act(action: Action) {
      driver.acts.push(`${current} ${action.kind}${action.targetRef ? `:${action.targetRef}` : ''}`);
      if (current === 'login' && action.kind === 'tap' && action.targetRef === 'b1') current = 'home';
      return shot();
    },
    async close() { driver.closes++; },
  };
  return driver;
}

const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
  assertions: [{ id: 'shown', claim: 'Home is shown.' }] };
const doStep = (extra: Record<string, unknown> = {}) => ({ id: 'signIn', kind: 'do', intent: 'Sign in',
  doneWhen: 'Home shows', effect: 'none', ...extra });
const script = (steps: unknown[] = [doStep({ localOnly: true }), checkpoint]) =>
  ({ version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps });

async function withService(jev: FakeStep[], run: (service: BridgeService, driver: FakeDevice) => Promise<void>,
  config: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-handback-'));
  // Driven mode opted in (E13): the project's .jev/config.json and the experimental switch.
  const projectDir = join(root, 'project');
  await mkdir(join(projectDir, '.jev'), { recursive: true });
  await writeFile(join(projectDir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true, ...config }));
  const driver = device();
  const service = new BridgeService({ baseDir: join(root, 'runs'), createDriver: () => driver,
    env: { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '1' },
    createJudge: () => ({ async judge(assertions) {
      return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
        model: 'jev-1.13.0' };
    } }),
    createDrivenJudge: () => fakeDrivenJudge(jev) });
  try { await run(service, driver); }
  finally { await service.close(); await rm(root, { recursive: true, force: true }); }
}

/** Waits for the run to pause, and checks the wait returned at once rather than after waitMs. */
async function pausedStatus(service: BridgeService, runId: string) {
  const started = performance.now();
  const status = await service.status(runId, 45_000);
  assert.ok(performance.now() - started < 2_000, 'a pause ends the wait at once');
  assert.equal(status.state, 'needs_claude');
  return status.pause!;
}

test('a Jev hand-back pauses the run: get_report returns at once with the package; a tap answer finishes it', async () => {
  await withService([{ choice: 'none_fits', confidence: 0.9 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }],
    async (service, driver) => {
      const { runId } = await service.start(script([doStep(), checkpoint]));
      const pause = await pausedStatus(service, runId);
      assert.equal(pause.reason, 'NONE_FITS');
      assert.equal(pause.stepId, 'signIn');
      assert.equal(pause.intent, 'Sign in');
      assert.match(pause.screen, /Welcome/);
      assert.deepEqual(pause.topChoices, [{ key: 'none_fits', probability: 0.9 }]);
      assert.deepEqual(pause.elements.map(element => element.ref), ['b1']);
      // Already paused: an immediate status needs no wait at all.
      const again = await service.status(runId, 45_000);
      assert.equal(again.pause?.pauseId, pause.pauseId);
      assert.equal(driver.closes, 0, 'the device stays held while paused');

      assert.deepEqual(await service.resolve(runId, pause.pauseId, { kind: 'tap', ref: 'b1' }), { kind: 'tap', ref: 'b1' });
      const done = await service.status(runId, 5_000);
      assert.equal(done.state, 'finished');
      assert.equal(done.report.verdict, 'passed');
      assert.equal(driver.closes, 1, 'the device is released at the end');
      assert.ok(driver.acts.includes('login tap:b1'));
      const events = await readRunEvents(service.baseDir, runId);
      const action = events.find(event => event.type === 'action' && event.data.decidedBy === 'claude');
      assert.equal(action?.data.action, 'tap');
    });
});

test('two pauses in one run: each gets its own pause id; done ends the step', async () => {
  await withService([], async (service, driver) => {
    const { runId } = await service.start(script());
    const first = await pausedStatus(service, runId);
    assert.equal(first.reason, 'LOCAL_ONLY_STEP');
    await service.resolve(runId, first.pauseId, { kind: 'tap', ref: 'b1' });
    const second = await pausedStatus(service, runId);
    assert.notEqual(second.pauseId, first.pauseId);
    assert.match(second.screen, /Home/);
    await assert.rejects(service.resolve(runId, first.pauseId, { kind: 'done' }), /is not the open pause/);
    assert.equal(driver.closes, 0);
    await service.resolve(runId, second.pauseId, { kind: 'done' });
    const status = await service.status(runId, 5_000);
    assert.equal(status.report.verdict, 'passed');
    assert.equal(driver.closes, 1);
    const answers = (await readRunEvents(service.baseDir, runId)).filter(event => event.type === 'handback_answer');
    assert.deepEqual(answers.map(event => event.data.kind), ['tap', 'done']);
    assert.equal(answers[1]!.data.decidedBy, 'claude');
  });
});

test('an invalid answer is refused with a clear message and the run stays paused; stop ends it STOPPED_BY_CLAUDE', async () => {
  await withService([], async (service, driver) => {
    const { runId } = await service.start(script());
    const pause = await pausedStatus(service, runId);
    await assert.rejects(service.resolve(runId, pause.pauseId, { kind: 'tap', ref: 'zz' }),
      (error: unknown) => error instanceof HandbackAnswerError && /"zz" is not on the paused screen/.test(error.message));
    await assert.rejects(service.resolve(runId, pause.pauseId, { kind: 'revise', steps: [doStep()] }),
      /end at an assertion checkpoint/);
    assert.equal((await service.status(runId)).state, 'needs_claude');
    assert.deepEqual(driver.acts, []);
    await service.resolve(runId, pause.pauseId, { kind: 'stop' });
    const status = await service.status(runId, 5_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.reason, 'STOPPED_BY_CLAUDE');
    assert.equal(driver.closes, 1);
  });
});

test('a revise answer replaces the remaining steps', async () => {
  await withService([], async (service) => {
    const { runId } = await service.start(script());
    const pause = await pausedStatus(service, runId);
    await service.resolve(runId, pause.pauseId, { kind: 'revise', steps: [
      { id: 'goHome', kind: 'action', guard: { present: [{ role: 'button', label: 'Sign in' }] }, action: { kind: 'tap', selector: { role: 'button', label: 'Sign in' } } },
      checkpoint] });
    const status = await service.status(runId, 5_000);
    assert.equal(status.report.verdict, 'passed');
  });
});

test('no answer in time: INCONCLUSIVE / HANDBACK_TIMEOUT, and the device is released', async () => {
  await withService([], async (service, driver) => {
    const { runId } = await service.start(script(), { handbackTimeoutMs: 1_000 });
    await pausedStatus(service, runId);
    // A paused run answers status at once, so poll until the pause times out.
    let status = await service.status(runId);
    for (let tries = 0; status.state === 'needs_claude' && tries < 100; tries++) {
      await new Promise(done => setTimeout(done, 50));
      status = await service.status(runId);
    }
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.reason, 'HANDBACK_TIMEOUT');
    assert.equal(driver.closes, 1);
    await assert.rejects(service.resolve(runId, 'any', { kind: 'stop' }), /not active/);
  });
});

test('the hand-back timeout is a start limit from 1 s to 30 min', async () => {
  await withService([], async (service) => {
    await assert.rejects(service.start(script(), { handbackTimeoutMs: 999 }));
    await assert.rejects(service.start(script(), { handbackTimeoutMs: 1_800_001 }));
  });
});

test('a cancel while paused ends the run CANCELLED and releases the device', async () => {
  await withService([], async (service, driver) => {
    const { runId } = await service.start(script());
    const pause = await pausedStatus(service, runId);
    await service.cancel(runId);
    const status = await service.status(runId);
    assert.equal(status.state, 'finished');
    assert.equal(status.pause, undefined);
    assert.equal(status.report.reason, 'CANCELLED');
    assert.equal(driver.closes, 1);
    await assert.rejects(service.resolve(runId, pause.pauseId, { kind: 'stop' }), /not active/);
  });
});

test('resolve refuses a run without do steps', async () => {
  await withService([], async (service) => {
    const { runId } = await service.start({ version: 1, app: { bundleId: 'com.example.app' }, values: {},
      steps: [{ ...checkpoint, guard: { present: [{ role: 'text', label: 'Welcome' }] } }] });
    await assert.rejects(service.resolve(runId, 'p', { kind: 'stop' }), /has no do steps/);
    assert.equal((await service.status(runId, 5_000)).report.verdict, 'passed');
  });
});

test('the project\'s driven options reach the run: a localOnlyScreens match pauses without asking Jev', async () => {
  await withService([], async (service) => {
    const { runId } = await service.start(script([doStep(), checkpoint]));
    const pause = await pausedStatus(service, runId);
    assert.equal(pause.reason, 'LOCAL_ONLY_SCREEN');
    assert.match(pause.reasonText, /localOnlyScreens/);
    await service.resolve(runId, pause.pauseId, { kind: 'stop' });
    assert.equal((await service.status(runId, 5_000)).report.reason, 'STOPPED_BY_CLAUDE');
  }, { localOnlyScreens: [{ label: '^Welcome$' }] });
});
