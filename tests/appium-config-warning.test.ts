import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDriverFactory } from '../src/device/factory.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';
import { iosScreen, world } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const script = parseScriptedScenario({ version: 1, app: { bundleId: 'example.app' }, values: {},
  steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });

for (const configured of [true, false]) {
  test(`an iOS run whose device came from .mobilebuildmcp/config.yaml suggests a profile (config file used: ${String(configured)})`, async t => {
    const w = worldHost(t, { identityProbe: fakeSimulatorProbe(UDID),
      worlds: [world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) })] });
    const project = join(w.root, 'project');
    mkdirSync(join(project, '.mobilebuildmcp'), { recursive: true });
    writeFileSync(join(project, '.mobilebuildmcp/config.yaml'), `simulatorId: ${UDID}\n`);
    const driver = createDriverFactory({ host: w.host, projectDir: project, ...(configured ? {} : { defaultUdid: UDID }) })(script, { runId: `config-${String(configured)}` });
    try {
      await driver.prepare({ app: script.app }, live());
      assert.deepEqual(driver.prepareWarnings?.(), configured ? ['Using .mobilebuildmcp/config.yaml simulatorId; consider a profile in .jev/profiles.json.'] : []);
    } finally { await driver.close(live()); }
  });
}
