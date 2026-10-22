import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Admission } from '../../src/device/admission.js';
import { MobileBuildMcpDriver, type CliRunner } from '../../src/device/index.js';
import { bounded } from './admission-race-harness.js';
import { fakeSimulatorProbe } from './android-device.js';
const [root, device, mode] = process.argv.slice(2);
if (!root || !device) throw new Error('Expected isolated store and device');
const calls: string[][] = [];
const runner: CliRunner = async args => {
  calls.push(args);
  assert.deepEqual(args.slice(0, 2), ['simulator', 'launch-app']);
  return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.launch-result', schemaVersion: '2', didError: false, data: { artifacts: { simulatorId: device } } }), stderr: '', exitCode: 0 };
};
const driver = new MobileBuildMcpDriver({ cwd: root, runId: 'scripted-racer', admission: Admission.forTesting({ root, backend: 'fake', initialize: false }),
  identityProbe: fakeSimulatorProbe(device.toUpperCase()), lockRoot: join(root, 'leases'), stopAppOnClose: false,
  fakeBackend: { runner, window: undefined } });
const prepare = driver.prepare({ app: { bundleId: 'org.example.fixture' }, device: { udid: device } }, new AbortController().signal);
if (mode === 'refuse') {
  await assert.rejects(bounded('scripted refused preparation', prepare), { code: 'DEVICE_BUSY' });
  assert.deepEqual(calls, []);
  process.stdout.write('DEVICE_BUSY; zero backend requests');
} else {
  await bounded('scripted preparation', prepare);
  assert.equal(calls.length, 1);
  process.send?.({ kind: 'prepared', calls });
  process.once('message', async () => { await bounded('scripted driver close', driver.close(new AbortController().signal)); process.disconnect(); });
}
