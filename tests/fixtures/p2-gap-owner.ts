import assert from 'node:assert/strict';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { Admission, componentObservationSchema } from '../../src/device/admission.js';
import { captureCommand } from '../../src/capture.js';
import { AndroidDriver, type AndroidDriverOptions } from '../../src/device/android/driver.js';
import { PINNED_AGENT_SHA256 } from '../../src/device/android/agent-supply.js';
import { runScriptedScenario } from '../../src/scripted/run.js';
import { AGENT_CACHE, FakeAdb, fakeAgents, fakeClock, FakeStreams } from './android-device.js';
import { androidScript } from './android-script.js';
import { withRunLog } from './run-log.js';
import { bounded } from './admission-race-harness.js';

const [root, mode, name, rawComponents] = process.argv.slice(2);
assert.ok(root);
const gates = new Map(['start', 'release'].map(kind => {
  let open = () => {};
  const promise = new Promise<void>(resolve => { open = resolve; });
  return [kind, { promise, open }];
}));
process.on('message', raw => gates.get(z.enum(['start', 'release']).parse(raw))!.open());
const admission = Admission.forTesting({ root: join(root, 'admission'), backend: 'fake', initialize: false });
process.send?.({ kind: 'ready' });
await bounded('E3/E10 owner start barrier', gates.get('start')!.promise);

if (mode === 'crash') {
  const components = z.array(componentObservationSchema).parse(JSON.parse(rawComponents!));
  const acquired = admission.acquire({ category: 'android-emulator', device: '/fake/avds/Pixel.avd',
    attempt: { kind: 'legacy', id: 'killed-owner' }, digest: 'killed-owner', intent: {} });
  assert.equal(acquired.kind, 'acquired');
  if (acquired.kind !== 'acquired') throw new Error('E10 owner not admitted');
  const claim = acquired.claim;
  claim.registerComponent({ id: 'adb', kind: 'adb-command', serial: 'emulator-5554', args: ['-s', 'emulator-5554', 'shell', 'sleep', '11'] });
  claim.registerComponent({ id: 'agent', kind: 'android-agent', serial: 'emulator-5554',
    classpath: '/data/local/tmp/jev-ios-bridge-agent.dex', className: 'com.mobilenext.mobilecli.DeviceServer' });
  claim.registerComponent({ id: 'stream', kind: 'android-stream', serial: 'emulator-5554', args: ['-s', 'emulator-5554', 'logcat'] });
  for (const [index, id] of ['adb', 'agent', 'stream'].entries()) claim.observeComponent(id, components[index]!);
  await claim.bindDriver('fake').dispatch({ requestId: 'outstanding-adb', componentId: 'adb', operation: 'adb', payload: {} }, async () => {
    process.send?.({ kind: 'backend' });
    await bounded('E10 outstanding adb command', gates.get('release')!.promise, 30000);
  });
} else {
  assert.ok(mode === 'scripted' || mode === 'capture');
  assert.ok(name);
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'Pixel' });
  const agents = fakeAgents(adb, { screens: [[{ class: 'android.widget.TextView', text: 'Marker',
    rect: { x: 0, y: 0, width: 100, height: 100 }, enabled: true, visible: true }]] });
  let held = false;
  adb.onCall = async () => {
    if (held) return;
    held = true;
    process.send?.({ kind: 'backend' });
    await bounded('E3 winner backend barrier', gates.get('release')!.promise, 30000);
  };
  const parts = { admission, fakeBackend: true, runner: adb.run, agentClient: agents.agentClient,
    identityProbe: adb.identityProbe, clock: fakeClock(), leaseRoot: join(root, 'leases'),
    screenshotFolder: root, logcat: new FakeStreams(adb), logFolder: false,
    freePort: async () => 49526,
    tools: async () => ({ adb: '/fake/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }) } satisfies Omit<AndroidDriverOptions, 'device'>;
  let reason: string;
  if (mode === 'capture') {
    let stderr = '';
    const code = await captureCommand({ serial: name }, { projectDir: root, driver: parts,
      signal: AbortSignal.timeout(30000), write: { stdout() {}, stderr: text => { stderr += text; } } });
    reason = code === 0 ? 'passed' : stderr.split(':')[0]!;
  } else {
    const scenario = androidScript({ device: { avd: name } });
    const driver = new AndroidDriver({ ...parts, runId: 'scripted-owner', device: scenario.device });
    const report = await withRunLog('scripted-owner', log => runScriptedScenario({ runId: 'scripted-owner', scenario, driver, log,
      judge: { async judge() { return { probabilities: { shown: 0.99 }, inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } } }));
    reason = report.verdict === 'passed' ? 'passed' : report.reason;
  }
  process.send?.({ kind: 'result', reason, calls: adb.calls.length, agentCalls: agents.calls.length });
}
process.disconnect();
