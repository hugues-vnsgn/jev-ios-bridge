import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeviceDriver, JevJudge, Judgment, RunEvent, RunLog, Scenario, Snapshot } from '../src/contracts/index.js';
import { StaleSnapshotError } from '../src/device/index.js';
import { runScenario } from '../src/run/index.js';

const scenario: Scenario = {
  goal: 'Open Settings', app: { bundleId: 'com.apple.Preferences' },
  assertions: [{ id: 'visible', claim: 'Settings is visible' }], values: {},
};

const snapshot: Snapshot = {
  deviceId: 'test-device', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
  sequence: 1, elements: [{ ref: 'e1', role: 'button', label: 'Settings', actions: ['tap'] }], truncated: false,
};

function memoryLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return {
    events,
    async append(type, data) { events.push({ version: 1, runId: 'run-1', sequence: events.length + 1, at: new Date().toISOString(), type, data }); },
    async read() { return events; },
  };
}

function device(overrides: Partial<DeviceDriver> = {}): DeviceDriver & { acts: number; closed: boolean } {
  const state = {
    acts: 0, closed: false,
    async prepare() {},
    async observe() { return snapshot; },
    async act() { state.acts++; },
    async close() { state.closed = true; },
    ...overrides,
  };
  return state;
}

function judge(choice: string, goalReached: number, assertion: number, confidence = 0.9): JevJudge {
  const answer: Judgment = {
    choice, confidence, probabilities: { [choice]: confidence }, goalReached,
    assertions: { visible: assertion }, inputTokens: 150, latencyMs: 12, model: 'jev-1.13.0',
  };
  return { async judge() { return answer; } };
}

test('records a passed verdict only when completion and every assertion agree', async () => {
  const log = memoryLog();
  const driver = device();
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: judge('stop-goal', 0.96, 0.94), log });
  assert.equal(report.verdict, 'passed');
  assert.equal(report.inputTokens, 150);
  assert.equal(driver.acts, 0);
  assert.equal(driver.closed, true);
  assert.deepEqual(log.events.map(event => event.type), ['started', 'prepared', 'step', 'judgment', 'action', 'verdict']);
});

test('false assertion fails a completed scenario, uncertain assertion abstains', async () => {
  const failed = await runScenario({ runId: 'run-1', scenario, driver: device(), judge: judge('stop-goal', 0.95, 0.05), log: memoryLog() });
  const uncertain = await runScenario({ runId: 'run-1', scenario, driver: device(), judge: judge('stop-goal', 0.95, 0.5), log: memoryLog() });
  assert.equal(failed.verdict, 'failed');
  assert.equal(uncertain.verdict, 'inconclusive');
});

test('low confidence and contradictory completion never act', async () => {
  const lowDriver = device();
  const low = await runScenario({ runId: 'run-1', scenario, driver: lowDriver, judge: judge('tap:e1', 0.05, 0.1, 0.4), log: memoryLog() });
  const contradictoryDriver = device();
  const contradictory = await runScenario({ runId: 'run-1', scenario, driver: contradictoryDriver, judge: judge('tap:e1', 0.95, 0.95), log: memoryLog() });
  assert.equal(low.verdict, 'inconclusive');
  assert.equal(contradictory.verdict, 'inconclusive');
  assert.equal(lowDriver.acts, 0);
  assert.equal(contradictoryDriver.acts, 0);
});

test('a stale reference causes another observation and judgment', async () => {
  let calls = 0;
  const driver = device({ async act() { calls++; if (calls === 1) throw new StaleSnapshotError(); } });
  let judgments = 0;
  const jev: JevJudge = { async judge() { judgments++; return judge(judgments === 1 ? 'tap:e1' : 'stop-goal', judgments === 1 ? 0.02 : 0.98, 0.96).judge(scenario, { snapshot, text: '', options: [] }, new AbortController().signal); } };
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: jev, log: memoryLog(), limits: { maxSteps: 3 } });
  assert.equal(report.verdict, 'passed');
  assert.equal(calls, 1);
  assert.equal(judgments, 2);
  assert.ok(report.events.some(event => event.type === 'error' && String(event.data.message).includes('screen changed')));
});

test('cancelled judge records inconclusive and closes the driver', async () => {
  const abort = new AbortController();
  const driver = device();
  const jev: JevJudge = { async judge(_scenario, _observation, signal) {
    abort.abort();
    return new Promise<Judgment>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } };
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: jev, log: memoryLog(), signal: abort.signal });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(driver.closed, true);
  assert.ok(report.events.some(event => event.type === 'error'));
});

test('wall deadline ends a judge that ignores abort and still cleans up', async () => {
  const driver = device();
  const jev: JevJudge = { judge: async () => new Promise<Judgment>(() => {}) };
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: jev, log: memoryLog(), limits: { wallTimeMs: 10 } });
  assert.equal(report.verdict, 'inconclusive');
  assert.match(report.reason, /wall-time limit/);
  assert.equal(driver.closed, true);
});

test('cleanup timeout records an error and never invents a pass', async () => {
  const driver = device({ close: async () => new Promise<void>(() => {}) });
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: judge('stop-goal', 0.98, 0.98), log: memoryLog(), limits: { cleanupTimeMs: 10 } });
  assert.equal(report.verdict, 'inconclusive');
  assert.match(report.reason, /cleanup failed/);
  assert.ok(report.events.some(event => event.type === 'error'));
});

test('step bound is inclusive and records an inconclusive verdict', async () => {
  const driver = device();
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: judge('tap:e1', 0.01, 0.01), log: memoryLog(), limits: { maxSteps: 2 } });
  assert.equal(driver.acts, 2);
  assert.equal(report.steps, 2);
  assert.equal(report.verdict, 'inconclusive');
  assert.match(report.reason, /Step limit 2/);
});
