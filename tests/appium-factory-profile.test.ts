import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDriverFactory } from '../src/device/factory.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { iosScreen, world } from './fixtures/appium-wire/world.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';

const live = () => AbortSignal.timeout(20_000);
const script = parseScriptedScenario({ version: 1, app: { bundleId: 'example.app' }, values: {},
  steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });

test('the Appium factory records a selected profile binding in the admission intent', async t => {
  const w = worldHost(t, { identityProbe: fakeSimulatorProbe(UDID), worlds: [world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) })] });
  const profile = { name: 'ios', digest: 'b'.repeat(64) };
  const driver = createDriverFactory({ host: w.host, projectDir: w.root, defaultUdid: UDID })(script, { runId: 'profile-intent', profile });
  t.after(() => driver.close(live()));
  await driver.prepare({ app: script.app }, live());
  assert.deepEqual(w.admission.readAttempt({ kind: 'legacy', id: 'profile-intent' })!.intent, { app: { id: 'example.app' }, start: 'restart', profile });
});
