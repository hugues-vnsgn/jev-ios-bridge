/**
 * Issue 15, from Codex review round 2 (three P2s): a typed value that starts with or contains a `[value:<key>]`
 * marker is still masked (#1); a failure to log the `preflight` event never keeps the run from closing the driver
 * (#2); the pause package masks typed values in its step id too (#3). Each test reproduces the review's probe with
 * fakes and harmless host subprocesses. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { maskValues, prepareDecision } from '../src/driven/decide.js';
import { createHandbackGate, HandbackAnswerError, renderPause } from '../src/driven/handback.js';
import { preflightOnce } from '../src/driven/project.js';
import type { HandbackPacket } from '../src/driven/step.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const snap = (elements: Element[]): Snapshot =>
  ({ deviceId: 'fake', capturedAt: 0, expiresAt: 60_000, sequence: 1, truncated: false, elements });

// ---------- #1: marker-prefixed typed values ----------

const PREFIXED = '[value:user]password123';
const prefixedValues = { user: 'abc', password: PREFIXED };

test('a typed value that starts with a marker is masked whole', () => {
  assert.equal(maskValues(`password = "${PREFIXED}"`, prefixedValues), 'password = "⟦value:password⟧"');
});

test('a typed value that contains or ends with a marker is masked whole, and masking twice changes nothing', () => {
  const values = { user: 'abc', mid: 'x[value:user]y', tail: 'secret[value:user]' };
  const once = maskValues('a x[value:user]y b secret[value:user] c [value:user] d abc', values);
  assert.equal(once, 'a ⟦value:mid⟧ b ⟦value:tail⟧ c [value:user] d ⟦value:user⟧');
  assert.equal(maskValues(once, values), once);
  const prefixedOnce = maskValues(`p ${PREFIXED} abc`, prefixedValues);
  assert.equal(prefixedOnce, 'p ⟦value:password⟧ ⟦value:user⟧');
  assert.equal(maskValues(prefixedOnce, prefixedValues), prefixedOnce);
});

test('a marker-prefixed password never reaches Jev\'s request', () => {
  const { request } = prepareDecision({ intent: `Type ${PREFIXED} into the password field`,
    doneWhen: `The field shows ${PREFIXED}`, platform: 'android', valueKeys: ['password'], values: prefixedValues,
    recentActions: [`Typed ${PREFIXED}`],
    snapshot: snap([el('f1', 'text-field', { label: 'Password', value: PREFIXED, actions: ['tap', 'typeText'] })]) });
  const sent = JSON.stringify(request);
  assert.ok(!sent.includes('password123'), sent);
  assert.ok(sent.includes('⟦value:password⟧'));
});

// ---------- #2: a preflight log failure never blocks cleanup ----------

function recordingLog(failOn?: RunEvent['type']): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) {
      if (type === failOn) throw new Error(`disk full writing ${type}`);
      events.push({ version: 1, runId: 'round2', sequence: events.length + 1, at: new Date().toISOString(), type,
        data: structuredClone(data) });
    },
    async read() { return events; },
  };
}

async function folder(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'jev-review-round2-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

const harmless = { command: [process.execPath, '-e', 'process.exit(0)'], timeoutMs: 10_000 };

test('settle resolves when only the preflight event could not be logged: missing or a harmless command', async () => {
  await folder(async dir => {
    for (const preflight of [undefined, harmless]) {
      const once = preflightOnce(preflight, dir, recordingLog('preflight'));
      await assert.rejects(once.testWritesAllowed(new AbortController().signal), /disk full/,
        'the log failure reaches the run like any other');
      await once.settle(AbortSignal.timeout(1_000));
    }
  });
});

test('survivors still keep settle from resolving when the preflight event could not be logged', async () => {
  await folder(async dir => {
    const once = preflightOnce(harmless, dir, recordingLog('preflight'),
      { groups: { send() {}, alive: () => true }, graceMs: 10, reapMs: 10 });
    await assert.rejects(once.testWritesAllowed(new AbortController().signal), /disk full/);
    await assert.rejects(once.settle(AbortSignal.timeout(50)), /still running/);
  });
});

const home: Element[] = [el('t1', 'text', { label: 'Home', actions: [] })];

function homeDriver(closes: string[]): DeviceDriver {
  let sequence = 0;
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: home, truncated: false, screenHash: 'home' });
  return {
    async prepare() {},
    async observe() { return shot(); },
    async act() { return shot(); },
    actPath: () => undefined,
    async close() { closes.push('close'); },
  };
}

const writeScenario = parseScriptedScenario({ version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps: [
  { id: 'look', kind: 'do', intent: 'Look at home', doneWhen: 'Home shows', effect: 'test_write' },
  { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
    assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });

test('a run whose preflight event can\'t be logged still closes the driver, and doesn\'t end CLEANUP_FAILED', async () => {
  await folder(async dir => {
    for (const preflight of [undefined, harmless]) {
      const closes: string[] = [];
      const log = recordingLog('preflight');
      const once = preflightOnce(preflight, dir, log);
      const report = await runScriptedScenario({ runId: 'round2', log, scenario: writeScenario,
        driver: homeDriver(closes), judge: { async judge() { throw new Error('no checkpoint'); } },
        limits: { cleanupTimeMs: 1_000 }, driven: { ...once,
          judge: fakeDrivenJudge([{ choice: 'step_done', confidence: 0.95, done: 0.96 }]),
          handback: async () => { throw new Error('no hand-back expected'); } } });
      assert.deepEqual(closes, ['close'], 'the device is closed and the lease released');
      assert.equal(report.verdict, 'inconclusive');
      assert.notEqual(report.reason, 'CLEANUP_FAILED');
      assert.equal(report.reason, 'EXECUTION_ERROR', 'handled like the run\'s other log-write failures');
    }
  });
});

// ---------- #3: the step id in the pause package ----------

const PRIVATE = 'syntheticReviewPrivate123';

test('a step id equal to a typed value is masked in the pause package, its rendering and its refusals', async () => {
  const scenario = parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.app' },
    values: { pin: PRIVATE }, steps: [{ id: PRIVATE, kind: 'do', intent: 'Enter the pin', doneWhen: 'Home shows',
      effect: 'none', values: ['pin'] }, { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text' }] },
      assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });
  const gate = createHandbackGate({ scenario, now: () => 0 });
  const packet: HandbackPacket = { pauseId: 'p-1', reason: 'NONE_FITS', stepId: PRIVATE, intent: 'Enter the pin',
    doneWhen: 'Home shows', screen: 'PIN', topChoices: [], valueKeys: ['pin'],
    snapshot: snap([el('f1', 'text-field', { label: 'PIN', actions: ['tap', 'typeText'] })]) };
  const answer = gate.handback(packet, new AbortController().signal);
  await new Promise<void>(done => { gate.onPause(done); });
  const pause = gate.pending()!;
  assert.equal(pause.stepId, '⟦value:pin⟧');
  for (const shown of [JSON.stringify(pause), renderPause('run-1', pause, 0)]) assert.ok(!shown.includes(PRIVATE), shown);
  assert.throws(() => gate.resolve('p-1', { kind: 'type', ref: 'f1', valueKey: 'other' }),
    (error: unknown) => error instanceof HandbackAnswerError && !error.message.includes(PRIVATE) &&
      error.message.includes('⟦value:pin⟧'));
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
});
