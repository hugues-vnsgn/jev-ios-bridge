import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { createLiveCycleBackend, resolveLiveCycleParts } from '../scripts/phase4/live/backend.js';
import { runCycles } from '../scripts/phase4/live/cycles.js';
import { fakeAndroidAdmission, fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { SERIAL, androidTarget } from './fixtures/appium-wire/matrix.js';
import { IOS_SCENARIO, cycleWorld, iosScenario, worldCycles } from './fixtures/phase4-live/world-cycles.js';

function logRoot(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'p4-backend-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('the live backend runs a cycle on the assigned device, and the cycle releases it with nothing owned left', { timeout: 120_000 }, async t => {
  const { f } = worldCycles(t, { platform: 'ios' });
  const live = createLiveCycleBackend({ device: { category: 'ios-simulator', value: UDID }, admission: f.admission,
    fence: f.fence.run, driver: ({ runId }) => f.open(cycleWorld('ios'), { runId }).driver });
  const result = await runCycles(2, live({ scenario: iosScenario(), logRoot: logRoot(t) }));
  assert.equal(result.passed, true, JSON.stringify(result.failure));
  for (const record of result.cycles) {
    assert.deepEqual([record.attemptState, record.disposition, record.device, record.owner, record.leftovers],
      ['terminal', 'available', 'available', null, []]);
  }
  assert.equal(new Set(result.cycles.map(record => record.attempt.id)).size, 2, 'every cycle is its own admission attempt');
  assert.deepEqual(f.fence.wda, [], 'no runner is left on the simulator');
});

test('the live parts resolve the assigned simulator and refuse an assignment that names another category', async t => {
  const root = mkdtempSync(join(tmpdir(), 'p4-parts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const admission = fakeAndroidAdmission(root);
  const parts = await resolveLiveCycleParts({ category: 'ios-simulator', device: UDID, admission,
    probe: fakeSimulatorProbe(UDID), adbPath: '/fake/adb', environment: {} });
  assert.deepEqual(parts.device, { category: 'ios-simulator', value: UDID });
  assert.equal(parts.admission, admission, 'the caller\'s authority is the one the cycles record on');
  await assert.rejects(() => resolveLiveCycleParts({ category: 'android-emulator', device: SERIAL, admission,
    probe: androidTarget().options.identityProbe, adbPath: '/fake/adb', environment: {} }),
  /The assignment names android-emulator .*, but the live device is android-phone/);
});

test('the scenario file the runner reads is the one the corpus kit shipped', () => {
  assert.ok(IOS_SCENARIO.endsWith('ios-cycle.json'));
});
