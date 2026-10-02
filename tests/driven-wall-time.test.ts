/**
 * Time paused for Claude doesn't count toward the run's wall-time limit (ruling from Issue 08), while time spent
 * running still does. Fake driver, fake Jev, fake hand-back; no device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import type { DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { HandbackAnswer } from '../src/driven/step.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';
import { openMcpSession } from './fixtures/mcp-session.js';

const el = (ref: string, role: string, label: string, actions: Element['actions']): Element => ({
  ref, role, label, actions, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true } });

/** Login, then Home after tapping b1. `observeMs` slows every capture, to spend wall time outside a pause. */
function driver(observeMs = 0): DeviceDriver {
  let current = 'login';
  let sequence = 0;
  const screens: Record<string, Element[]> = {
    login: [el('t1', 'text', 'Welcome', []), el('b1', 'button', 'Sign in', ['tap'])],
    home: [el('t3', 'text', 'Home', [])],
  };
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current });
  return {
    async prepare() {},
    async observe() { await delay(observeMs); return shot(); },
    async act(action) { if (action.kind === 'tap' && action.targetRef === 'b1') current = 'home'; return shot(); },
    actPath: () => undefined,
    async close() {},
  };
}

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'wall', sequence: events.length + 1,
      at: new Date().toISOString(), type, data: structuredClone(data) }); },
    async read() { return events; },
  };
}

const scenario = parseScriptedScenario({ version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps: [
  { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none', localOnly: true },
  { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
    assertions: [{ id: 'shown', claim: 'Home is shown.' }] },
] });
const judge = { async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
    model: 'jev-1.13.0' };
} };

/** Claude answers each pause after `answerMs`: first tap b1, then done. */
function slowClaude(answerMs: number) {
  const answers: HandbackAnswer[] = [{ kind: 'tap', ref: 'b1' }, { kind: 'done' }];
  return async (_packet: unknown, signal: AbortSignal) => {
    await delay(answerMs, undefined, { signal });
    return answers.shift()!;
  };
}

test('a pause longer than the wall time doesn\'t end the run: paused time isn\'t counted', async () => {
  const log = recordingLog();
  const report = await runScriptedScenario({ runId: 'wall', scenario, driver: driver(), judge, log,
    limits: { wallTimeMs: 150 }, driven: { judge: fakeDrivenJudge([]), handback: slowClaude(250) } });
  assert.equal(report.reason, 'ALL_CHECKPOINTS_PASSED');
  assert.equal(report.verdict, 'passed');
  assert.ok(report.durationMs >= 500, 'the run really took longer than its wall time');
});

test('time outside the pauses still counts toward the wall time', async () => {
  const log = recordingLog();
  const report = await runScriptedScenario({ runId: 'wall', scenario, driver: driver(120), judge, log,
    limits: { wallTimeMs: 200 }, driven: { judge: fakeDrivenJudge([]), handback: slowClaude(50) } });
  assert.equal(report.reason, 'WALL_LIMIT');
  assert.equal(report.verdict, 'inconclusive');
});

test('resolve_step\'s description says paused time doesn\'t count toward the wall time', { timeout: 15_000 }, async () => {
  const session = await openMcpSession('driven-wall-time', { fixture: 'tests/fixtures/mcp-driven-server.ts' });
  try {
    const resolve = (await session.listTools()).find((tool: { name: string }) => tool.name === 'resolve_step');
    assert.match(resolve.description, /time paused doesn't count toward the run's wall-time limit/);
    assert.doesNotMatch(resolve.description, /keeps counting/);
  } finally { await session.close(); }
});

test('in a driven run, a script step\'s action event records decidedBy "script"', async () => {
  const log = recordingLog();
  const mixed = parseScriptedScenario({ version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps: [
    { id: 'open', kind: 'action', guard: { present: [{ role: 'button', label: 'Sign in' }] },
      action: { kind: 'tap', selector: { role: 'button', label: 'Sign in' } } },
    { id: 'look', kind: 'do', intent: 'Look', doneWhen: 'Home shows', effect: 'none', localOnly: true },
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
      assertions: [{ id: 'shown', claim: 'Home is shown.' }] },
  ] });
  const report = await runScriptedScenario({ runId: 'wall', scenario: mixed, driver: driver(), judge, log,
    driven: { judge: fakeDrivenJudge([]), handback: async () => ({ kind: 'done' }) } });
  assert.equal(report.verdict, 'passed');
  const action = log.events.find(event => event.type === 'action' && event.data.stepId === 'open');
  assert.equal(action?.data.decidedBy, 'script');
});
