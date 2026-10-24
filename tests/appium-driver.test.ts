import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { freeHostPort } from '../src/appium/ports.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID, WDA_BUNDLE, driverFixture, rewriteRecording } from './fixtures/appium-wire/driver-fixture.js';

const live = () => new AbortController().signal;
const ios = { target: { platform: 'ios', device: UDID, presentation: 'visible' }, identityProbe: fakeSimulatorProbe(UDID) } as const;
const observeRecording = (root: string) => rewriteRecording(root, 'tests/fixtures/appium-wire/ios/observe-2.jsonl', [['ios-test', UDID]]);

test('an iOS run launches through the console helper, observes through one session, and close deletes the session and produces every receipt', async t => {
  const f = driverFixture(t, observeRecording, ios);
  f.fence.wda = [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }];
  await f.driver.prepare({ app: { bundleId: 'example.app', launchArgs: ['--demo'] } }, live());
  assert.deepEqual(f.native.calls.map(call => call.command.kind), ['ios-console', 'ios-log-stream']);
  assert.deepEqual(f.native.calls[0]!.command.args, ['simctl', 'launch', '--console-pty', '--terminate-running-process', UDID, 'example.app', '--demo']);
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings']);
  assert.equal(f.calls().find(call => call.params?.name === 'appium_session_management')!.params!.arguments!.capabilities!.toString().includes('"appium:autoLaunch":false'), true);
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  assert.deepEqual(f.admission.readGeneration(owner).components.map(component => component.kind).sort(),
    ['appium-fence-command', 'appium-native-helper', 'appium-native-helper', 'appium-process-group', 'appium-wda', 'one-shot', 'one-shot']);
  const group = f.admission.readGeneration(owner).components.find(component => component.kind === 'appium-process-group')!.declaration as { leader: { pid: number; startTime: string }; runMarker: string; pgid: number };
  assert.equal(group.runMarker, '0123456789abcdef0123456789abcdef');
  assert.equal(group.leader.startTime, `host-${String(group.leader.pid)}`);
  assert.equal(group.pgid, group.leader.pid);
  assert.equal(f.driver.appRunning(), true);
  const sources = f.driver.logSources();
  assert.match(sources.runtime!, /run-1-console\.log$/); assert.match(sources.os!, /run-1-os\.log$/);
  f.native.calls[0]!.output.stdout('hello from the app\n');
  const snapshot = await f.driver.observe(live());
  assert.ok(snapshot.elements.length > 0);
  assert.equal(snapshot.deviceId, UDID);
  assert.ok(existsSync(snapshot.screenshotPath!));
  assert.equal(snapshot.logTails!.runtime, 'hello from the app\n');
  assert.deepEqual(f.driver.provenance(), { backend: 'appium', lockSha256: f.driver['options'].stack.manifest.lockSha256, extensionVersion: 1, clientVersion: '1.32.1',
    wdaTreeSha256: '5d1fc1c99908e253303f6de35bf26ed4a74a75817f704e7a3646b72b5271ba04' });
  await f.driver.close(live());
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_get_page_source', 'jev_screen', 'jev_terminate_app', 'appium_session_management']);
  assert.equal(f.native.calls[0]!.stops, 1); assert.equal(f.native.calls[1]!.stops, 1);
  assert.deepEqual(f.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }]);
  assert.deepEqual(f.fence.wda, []);
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
  assert.equal(f.admission.readGeneration(owner).commands.filter(command => command.state !== 'settled').length, 0);
  assert.equal(f.driver.appRunning(), undefined);
});

test('close settles an in-flight observation before the session delete, so the cleanup delete never hits NOT_ALLOWED', async t => {
  const f = driverFixture(t, observeRecording, ios, 'source-slow-screen-held');
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const observing = f.driver.observe(live());
  for (let waited = 0; !f.tools().includes('jev_screen') && waited < 4000; waited += 20) await delay(20);
  assert.equal(f.tools().at(-1), 'jev_screen');
  const closing = f.driver.close(live());
  await delay(150);
  assert.equal(f.tools().filter(name => name === 'appium_session_management').length, 1, 'the delete waits for the observation');
  writeFileSync(f.trace + '.release', '');
  const snapshot = await observing;
  assert.ok(snapshot.elements.length > 0);
  await closing;
  assert.deepEqual(f.tools().slice(-3), ['jev_screen', 'jev_terminate_app', 'appium_session_management']);
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
});

test('two simulators run at once on distinct host ports, each recorded in its own session profile', async t => {
  const other = 'ABCDEF00-0000-4000-8000-000000000002';
  const probe = fakeSimulatorProbe(UDID, other);
  const device = (udid: string) => {
    let root = ''; const got: number[] = [];
    const recording = (at: string) => { root = at; return join(at, 'recording.jsonl'); };
    const freePort = async () => {
      got.push(await freeHostPort());
      if (got.length === 2) rewriteRecording(root, 'tests/fixtures/appium-wire/ios/observe-2.jsonl', [['ios-test', udid],
        ['wdaLocalPort\\":18100', `wdaLocalPort\\":${String(got[0])}`], ['mjpegServerPort\\":18101', `mjpegServerPort\\":${String(got[1])}`]]);
      return got.at(-1)!;
    };
    return { recording, freePort };
  };
  const a = device(UDID); const b = device(other);
  const first = driverFixture(t, a.recording, { ...ios, identityProbe: probe, freePort: a.freePort });
  const second = driverFixture(t, b.recording, { target: { platform: 'ios', device: other, presentation: 'visible' }, identityProbe: probe,
    freePort: b.freePort, admission: first.admission, runId: 'run-2' });
  await Promise.all([first.driver.prepare({ app: { bundleId: 'example.app' } }, live()), second.driver.prepare({ app: { bundleId: 'example.app' } }, live())]);
  const ports = (f: typeof first) => {
    const created = f.calls().find(call => call.params?.name === 'appium_session_management')!.params!.arguments!.capabilities as unknown as string;
    const capabilities = JSON.parse(created) as Record<string, number>;
    return [capabilities['appium:wdaLocalPort']!, capabilities['appium:mjpegServerPort']!];
  };
  const used = [...ports(first), ...ports(second)];
  assert.equal(new Set(used).size, 4, `four distinct host ports: ${used.join(', ')}`);
  assert.equal(used.some(port => port === 18100 || port === 18101), false, 'no fixed Phase 2 port');
  assert.equal(first.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'active');
  assert.equal(first.admission.inspect({ category: 'ios-simulator', value: other })!.state, 'active');
  await Promise.all([first.driver.observe(live()), second.driver.observe(live())]);
  await Promise.all([first.driver.close(live()), second.driver.close(live())]);
  assert.equal(first.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
  assert.equal(first.admission.inspect({ category: 'ios-simulator', value: other })!.state, 'available');
});
