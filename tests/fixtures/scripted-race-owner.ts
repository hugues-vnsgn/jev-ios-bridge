import assert from 'node:assert/strict';
import { Admission } from '../../src/device/admission.js';
import { createDriverFactory } from '../../src/device/factory.js';
import { parseScriptedScenario } from '../../src/scripted/schema.js';
import { bounded } from './admission-race-harness.js';
import { fakeSimulatorProbe } from './android-device.js';
import { worldHost } from './appium-wire/world-host.js';
import { iosScreen, world } from './appium-wire/world.js';

const [root, device, mode] = process.argv.slice(2);
if (!root || !device) throw new Error('Expected isolated store and device');
const cleanups: (() => unknown)[] = [];
const host = worldHost({ after: cleanup => { cleanups.push(cleanup); } }, { identityProbe: fakeSimulatorProbe(device.toUpperCase()),
  admission: Admission.forTesting({ root, backend: 'fake', initialize: false }),
  worlds: [world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }], 'org.example.fixture') })] });
const script = parseScriptedScenario({ version: 1, app: { bundleId: 'org.example.fixture' }, device: { udid: device }, values: {},
  steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });
const driver = createDriverFactory({ host: host.host, projectDir: host.root })(script, { runId: 'scripted-racer' });
const requests = () => [...host.opened.flatMap(opened => opened.tools()), ...host.fence.effects.map(effect => effect.kind), ...host.native.calls.map(call => call.command.kind)];
const prepare = driver.prepare({ app: script.app, device: { udid: device } }, new AbortController().signal);
try {
  if (mode === 'refuse') {
    // The store protects a simulator that holds observed stock, so a scripted run is refused as quarantined.
    await assert.rejects(bounded('scripted refused preparation', prepare), { code: 'DEVICE_QUARANTINED' });
    assert.deepEqual(requests(), []);
    process.stdout.write('DEVICE_QUARANTINED; zero backend requests');
  } else {
    await bounded('scripted preparation', prepare);
    process.send?.({ kind: 'prepared', calls: requests() });
    await new Promise(resolve => process.once('message', resolve));
    await bounded('scripted driver close', driver.close(new AbortController().signal));
  }
} finally { for (const cleanup of cleanups) await cleanup(); }
if (mode !== 'refuse') process.disconnect();
