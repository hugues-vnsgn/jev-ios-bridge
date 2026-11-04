import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { ComposedAppiumDriver } from '../src/appium/composition.js';
import { APP_PROBLEM_POLL_MS } from '../src/appium/driver.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { iosTarget, passingJudge } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';
import { withRunLog } from './fixtures/run-log.js';

const script = { version: 1, app: { bundleId: 'example.app' }, device: { udid: UDID }, values: {},
  steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'missing' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] };

test('a step that fails on the composed driver, with the app exiting just after, ends APP_EXITED', async t => {
  let now = 0;
  let exit: (() => void) | undefined;
  const clock = { now: () => now, sleep: async (ms: number) => {
    now += ms;
    if (ms !== APP_PROBLEM_POLL_MS) return;
    exit?.(); exit = undefined;
    await yieldTurn();
  }, timeout: () => new AbortController().signal };
  const f = worldFixture(t, world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 120, 200, 40] }]) }), { ...iosTarget, clock });
  exit = () => f.native.calls[0]!.exit({ kind: 'exited', code: 1 });
  const driver = new ComposedAppiumDriver({ host: async () => f.parts, target: async () => iosTarget.target });
  const report = await withRunLog('composed-crash', log => runScriptedScenario({ runId: 'run-1', scenario: script as never, driver, judge: passingJudge, log }));
  assert.deepEqual([report.verdict, report.reason], ['inconclusive', 'APP_EXITED']);
});
