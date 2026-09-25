import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeviceDriver, JevJudge, Judgment, RunEvent, RunLog, RunScenario, Scenario, Snapshot } from '../src/contracts/index.js';
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
  const error = report.events.find(event => event.type === 'error');
  assert.equal(error?.data.phase, 'cleanup');
  assert.ok(typeof error.data.phaseMs === 'number' && Number.isFinite(error.data.phaseMs) && error.data.phaseMs >= 0);
});

test('step bound is inclusive and records an inconclusive verdict', async () => {
  const driver = device();
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: judge('tap:e1', 0.01, 0.01), log: memoryLog(), limits: { maxSteps: 2 } });
  assert.equal(driver.acts, 2);
  assert.equal(report.steps, 2);
  assert.equal(report.verdict, 'inconclusive');
  assert.match(report.reason, /Step limit 2/);
});

test('step event records app-log tails while Jev observation text omits them', async () => {
  const marker = 'APP-LOG-ONLY-MARKER';
  const driver = device({ async observe() { return { ...snapshot, logTails: { runtime: marker } }; } });
  let sentToJev = '';
  const inspectingJudge: JevJudge = { async judge(_scenario, observation) {
    sentToJev = observation.text;
    return judge('stop-goal', 0.98, 0.98).judge(scenario, observation, new AbortController().signal);
  } };
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: inspectingJudge, log: memoryLog() });
  assert.equal(report.verdict, 'passed');
  assert.ok(!sentToJev.includes(marker));
  assert.deepEqual(report.events.find(event => event.type === 'step')?.data.logTails, { runtime: marker });
});

test('run events carry monotonic phase times and cumulative driver refresh counts', async () => {
  let refreshes = 0;
  const driver = device({
    async act() { refreshes++; },
    metrics() { return { referenceRefreshes: refreshes, referenceExpiries: 0, nearTtlRefreshes: refreshes }; },
  });
  let decisions = 0;
  const sequential: JevJudge = { async judge(_scenario, observation, signal) {
    decisions++;
    return judge(decisions === 1 ? 'tap:e1' : 'stop-goal', decisions === 1 ? 0.02 : 0.98, 0.98)
      .judge(scenario, observation, signal);
  } };
  const report = await runScenario({ runId: 'run-1', scenario, driver, judge: sequential, log: memoryLog() });
  assert.equal(report.verdict, 'passed');
  const prepared = report.events.find(event => event.type === 'prepared');
  const firstStep = report.events.find(event => event.type === 'step');
  const firstJudgment = report.events.find(event => event.type === 'judgment');
  const firstAction = report.events.find(event => event.type === 'action');
  const last = report.events.at(-1);
  for (const [event, key] of [[prepared, 'prepareMs'], [firstStep, 'observeMs'], [firstJudgment, 'decideMs'], [firstAction, 'actMs']] as const) {
    const elapsed = event?.data[key];
    assert.ok(typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0, `${key} must be a monotonic duration`);
  }
  assert.deepEqual(firstAction?.data.deviceMetrics, { referenceRefreshes: 1, referenceExpiries: 0, nearTtlRefreshes: 1 });
  assert.deepEqual(last?.data.deviceMetrics, { referenceRefreshes: 1, referenceExpiries: 0, nearTtlRefreshes: 1 });
});

test('failed prepare and failed action retain their phase duration in error events', async () => {
  const failedPrepare = await runScenario({ runId: 'run-1', scenario,
    driver: device({ async prepare() { throw new Error('launch failed'); } }), judge: judge('stop-goal', 0.98, 0.98), log: memoryLog() });
  const failedAction = await runScenario({ runId: 'run-1', scenario,
    driver: device({ async act() { throw new Error('tap failed'); } }), judge: judge('tap:e1', 0.02, 0.02), log: memoryLog() });
  for (const [report, phase] of [[failedPrepare, 'prepare'], [failedAction, 'act']] as const) {
    assert.equal(report.verdict, 'inconclusive');
    const event = report.events.find(candidate => candidate.type === 'error');
    assert.equal(event?.data.phase, phase);
    assert.ok(typeof event?.data.phaseMs === 'number' && Number.isFinite(event.data.phaseMs) && event.data.phaseMs >= 0);
  }
});

test('ordered checkpoints prove each goal before the bridge passes the run', async () => {
  const ordered: RunScenario = {
    app: { bundleId: 'com.example.weather' }, checkpoints: [
      { id: 'settings', goal: 'Verify Fahrenheit settings', assertions: [{ id: 'visible', claim: 'Fahrenheit is selected' }] },
      { id: 'home', goal: 'Return to Weather Home', assertions: [{ id: 'visible', claim: 'Home forecast is visible' }] },
    ],
  };
  let prepares = 0;
  let closes = 0;
  const driver = device({ async prepare() { prepares++; }, async close() { closes++; } });
  const activeGoals: string[] = [];
  const jev: JevJudge = { async judge(active, observation) {
    activeGoals.push(active.goal);
    assert.equal(active.assertions.length, 1);
    assert.ok(observation.text.includes(active.goal));
    if (activeGoals.length === 1) assert.ok(!observation.text.includes('Return to Weather Home'));
    return { ...successJudgment(), assertions: { visible: 0.98 } };
  } };
  const report = await runScenario({ runId: 'run-1', scenario: ordered, driver, judge: jev, log: memoryLog() });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(activeGoals, ['Verify Fahrenheit settings', 'Return to Weather Home']);
  assert.equal(prepares, 1);
  assert.equal(closes, 1);
  const proofs = report.events.filter(event => event.type === 'checkpoint');
  assert.deepEqual(proofs.map(event => [event.data.checkpointId, event.data.checkpointIndex, event.data.step]),
    [['settings', 1, 1], ['home', 2, 2]]);
  assert.ok(proofs.every(event => event.data.status === 'passed' && Array.isArray(event.data.assertions)));
  assert.deepEqual(proofs[0]?.data.assertions, [{ id: 'settings:visible', claim: 'Fahrenheit is selected', probability: 0.98 }]);
  assert.equal(proofs[0]?.data.snapshotSequence, 1);
  assert.ok(report.events.at(-1)!.sequence > proofs[1]!.sequence);
});

function successJudgment(): Judgment {
  return { choice: 'stop-goal', confidence: 0.99, probabilities: { 'stop-goal': 0.99 }, goalReached: 0.98,
    assertions: { visible: 0.98 }, inputTokens: 10, latencyMs: 1, model: 'fixture' };
}

test('global step limit does not reset after a checkpoint passes', async () => {
  const ordered: RunScenario = { app: scenario.app, checkpoints: [
    { id: 'settings', goal: 'Verify settings', assertions: [{ id: 'visible', claim: 'Settings visible' }] },
    { id: 'home', goal: 'Verify Home', assertions: [{ id: 'visible', claim: 'Home visible' }] },
  ] };
  let judgments = 0;
  let closes = 0;
  const jev: JevJudge = { async judge() { judgments++; return successJudgment(); } };
  const report = await runScenario({ runId: 'run-1', scenario: ordered,
    driver: device({ async close() { closes++; } }), judge: jev, log: memoryLog(), limits: { maxSteps: 1 } });
  assert.equal(report.verdict, 'inconclusive');
  assert.match(report.reason, /Step limit 1/);
  assert.equal(report.steps, 1);
  assert.equal(judgments, 1);
  assert.equal(closes, 1);
  assert.deepEqual(report.events.filter(event => event.type === 'checkpoint').map(event => event.data.checkpointId), ['settings']);
});

test('cancellation between checkpoints retains proof and closes the device once', async () => {
  const ordered: RunScenario = { app: scenario.app, checkpoints: [
    { id: 'settings', goal: 'Verify settings', assertions: [{ id: 'visible', claim: 'Settings visible' }] },
    { id: 'home', goal: 'Verify Home', assertions: [{ id: 'visible', claim: 'Home visible' }] },
  ] };
  const abort = new AbortController();
  const log = memoryLog();
  const append = log.append.bind(log);
  log.append = async (type, data) => {
    await append(type, data);
    if (type === 'checkpoint') abort.abort();
  };
  let closes = 0;
  let judgments = 0;
  const report = await runScenario({ runId: 'run-1', scenario: ordered,
    driver: device({ async close() { closes++; } }),
    judge: { async judge() { judgments++; return successJudgment(); } },
    log, signal: abort.signal });
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(judgments, 1);
  assert.equal(closes, 1);
  assert.deepEqual(report.events.filter(event => event.type === 'checkpoint').map(event => event.data.checkpointId), ['settings']);
  assert.equal(report.events.at(-1)?.type, 'verdict');
});

test('false or uncertain first checkpoint never advances to the next goal', async () => {
  const ordered: RunScenario = { app: scenario.app, checkpoints: [
    { id: 'settings', goal: 'Verify settings', assertions: [{ id: 'visible', claim: 'Settings visible' }] },
    { id: 'home', goal: 'Verify Home', assertions: [{ id: 'visible', claim: 'Home visible' }] },
  ] };
  for (const [answer, expected] of [[0.05, 'failed'], [0.5, 'inconclusive']] as const) {
    let judgments = 0;
    const report = await runScenario({ runId: 'run-1', scenario: ordered, driver: device(), log: memoryLog(),
      judge: { async judge() { judgments++; return { ...successJudgment(), assertions: { visible: answer } }; } } });
    assert.equal(report.verdict, expected);
    assert.equal(judgments, 1);
    assert.equal(report.events.filter(event => event.type === 'checkpoint').length, 0);
    assert.equal(report.events.at(-1)?.data.checkpointsPassed, 0);
  }
});

test('wall deadline spans the checkpoint boundary and preserves the first proof', async () => {
  const ordered: RunScenario = { app: scenario.app, checkpoints: [
    { id: 'settings', goal: 'Verify settings', assertions: [{ id: 'visible', claim: 'Settings visible' }] },
    { id: 'home', goal: 'Verify Home', assertions: [{ id: 'visible', claim: 'Home visible' }] },
  ] };
  let judgments = 0;
  let closes = 0;
  const report = await runScenario({ runId: 'run-1', scenario: ordered, log: memoryLog(),
    driver: device({ async close() { closes++; } }), limits: { wallTimeMs: 15 },
    judge: { async judge() { judgments++; return judgments === 1 ? successJudgment() : new Promise<Judgment>(() => {}); } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.match(report.reason, /wall-time limit/);
  assert.equal(judgments, 2);
  assert.equal(closes, 1);
  assert.deepEqual(report.events.filter(event => event.type === 'checkpoint').map(event => event.data.checkpointId), ['settings']);
});

test('future checkpoint values do not suppress a navigation field tap', async () => {
  const ordered: RunScenario = { app: scenario.app, checkpoints: [
    { id: 'navigate', goal: 'Find the search field', assertions: [{ id: 'visible', claim: 'Search is visible' }] },
    { id: 'query', goal: 'Search for a city', assertions: [{ id: 'visible', claim: 'Results are visible' }],
      values: { query: 'FutureCity' } },
  ] };
  const field: Snapshot = { ...snapshot, elements: [{ ref: 'e1', role: 'text-field', label: 'Search', actions: ['tap', 'typeText'] }] };
  const seen: string[][] = [];
  const report = await runScenario({ runId: 'run-1', scenario: ordered, log: memoryLog(),
    driver: device({ async observe() { return field; } }), observationOptions: { variant: 'full', optionRule: 'v2' },
    judge: { async judge(_active, observation) {
      seen.push(observation.options.map(option => option.id));
      if (seen.length === 1) {
        assert.ok(!observation.text.includes('FutureCity'));
        return successJudgment();
      }
      assert.ok(observation.text.includes('FutureCity'));
      return { ...successJudgment(), choice: 'none' };
    } },
  });
  assert.equal(report.verdict, 'inconclusive');
  assert.ok(seen[0]?.includes('tap:e1'));
  assert.ok(!seen[0]?.includes('type:e1:query'));
  assert.ok(!seen[1]?.includes('tap:e1'));
  assert.ok(seen[1]?.includes('type:e1:query'));
});

test('legacy single-goal run still offers and performs its root typed value', async () => {
  const legacy: Scenario = { ...scenario, values: { query: 'London' } };
  const field: Snapshot = { ...snapshot, elements: [{ ref: 'e1', role: 'text-field', label: 'Search', actions: ['tap', 'typeText'] }] };
  let judgments = 0;
  const acted: string[] = [];
  const report = await runScenario({ runId: 'run-1', scenario: legacy, log: memoryLog(),
    driver: device({ async observe() { return field; }, async act(action, _snapshot, selected) {
      assert.equal(action.kind, 'type');
      if (action.kind === 'type') acted.push(selected.values[action.valueKey]!);
    } }),
    judge: { async judge(_scenario, observation) {
      judgments++;
      if (judgments === 1) {
        assert.ok(observation.options.some(option => option.id === 'type:e1:query'));
        return { ...successJudgment(), choice: 'type:e1:query', goalReached: 0.01 };
      }
      return successJudgment();
    } },
  });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(acted, ['London']);
  assert.equal(report.events.filter(event => event.type === 'checkpoint').length, 0);
});
