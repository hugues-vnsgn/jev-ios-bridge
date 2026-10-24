import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { freeHostPort } from '../src/appium/ports.js';
import type { DeviceDriver } from '../src/contracts/index.js';
import { AppiumDriver } from '../src/appium/driver.js';
import type { Admission, OwnerIdentity } from '../src/device/admission.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { fakeProbeSpawn } from './fixtures/adb-spawn.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import { identityProbe } from '../src/device/android/probe.js';
import { DeviceReasonError } from '../src/device/index.js';
import { UDID, WDA_BUNDLE, driverFixture, rewriteRecording, spliceRecordings } from './fixtures/appium-wire/driver-fixture.js';

const live = () => new AbortController().signal;
const ios = { target: { platform: 'ios', device: UDID, presentation: 'visible' }, identityProbe: fakeSimulatorProbe(UDID) } as const;
/** A clean close fences itself and finalizes available: no quarantine and no recovery claim are ever recorded. */
function assertNeverQuarantined(admission: Admission, owner: OwnerIdentity): void {
  assert.deepEqual(admission.readAttempt(owner.attempt)?.terminal, { outcome: 'completed', disposition: 'available', payload: {}, evidenceRefs: [] });
  assert.deepEqual(admission.readGeneration(owner).recoveries, []);
}
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
  assert.equal(f.driver.preparation(), undefined, 'iOS records no prepared device fields, as today');
  assert.equal((f.driver as DeviceDriver).metrics, undefined, 'an Appium run emits no iOS reference metrics');
  await f.driver.close(live());
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_get_page_source', 'jev_screen', 'jev_terminate_app', 'appium_session_management']);
  assert.equal(f.native.calls[0]!.stops, 1); assert.equal(f.native.calls[1]!.stops, 1);
  assert.deepEqual(f.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }]);
  assert.deepEqual(f.fence.wda, []);
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
  assert.equal(f.admission.readGeneration(owner).commands.filter(command => command.state !== 'settled').length, 0);
  assert.equal(f.driver.appRunning(), undefined);
  assertNeverQuarantined(f.admission, owner);
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

const SERIAL = 'PHONE123';
const keyguard = (showing: boolean) => `WINDOW MANAGER POLICY STATE\n    KeyguardServiceDelegate\n      showing=${String(showing)}\n      interactiveState=INTERACTIVE_STATE_AWAKE\n`;
const stat = (pid: number) => `${String(pid)} (app_process) S ${'0 '.repeat(18)}424242 0 0`;
function androidWorld(t: TestContext, locked = false) {
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, host: { listener: async () => { throw new Error('no emulator'); }, directory: async () => { throw new Error('no emulator'); } } as never,
    spawn: fakeProbeSpawn((_file, args) => args[0] === 'devices' ? `List of devices attached\n${SERIAL} device\n` : `${SERIAL}\n`).spawn });
  const adbCalls: string[][] = [];
  const adb: AdbRunner = async args => {
    adbCalls.push([...args]);
    const line = args.at(-1) ?? '';
    if (line.includes('pidof')) return { stdout: '5001 5002\n', stderr: '', exitCode: 0 };
    const pid = /\/proc\/(\d+)\/stat/.exec(line)?.[1];
    return pid ? { stdout: stat(Number(pid)), stderr: '', exitCode: 0 } : { stdout: '', stderr: 'unexpected', exitCode: 1 };
  };
  const recording = (root: string) => spliceRecordings(root, [
    { source: 'tests/fixtures/appium-wire/android/observe-2.jsonl', from: 0, to: 7 },
    { source: 'tests/fixtures/appium-wire/android/extension.jsonl', from: 15, to: 17 },
    { source: 'tests/fixtures/appium-wire/android/observe-2.jsonl', from: 7 }], [['android-test', SERIAL]]);
  const f = driverFixture(t, recording, { target: { platform: 'android', device: SERIAL, category: 'android-phone', serverInstallation: { kind: 'install' } },
    identityProbe: probe, adb, freePort: async () => 18200 }, 'none', command => command.kind === 'android-keyguard' ? keyguard(locked) : command.kind === 'android-wake' ? '' : undefined);
  return { ...f, adbCalls };
}
const androidApp = { package: 'example.app', activity: '.Main', intentExtras: { route: 'settings' } };

test('an Android run wakes natively, restarts through jev_start_activity, records every component and fences them all at close', async t => {
  const f = androidWorld(t);
  f.fence.processes.set(5001, '424242'); f.fence.processes.set(5002, '424242');
  f.fence.forwards = [{ serial: SERIAL, local: 'tcp:18200', remote: 'tcp:6790' }];
  await f.driver.prepare({ app: androidApp }, live());
  assert.deepEqual(f.native.calls.map(call => call.command.kind), ['android-keyguard']);
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'jev_start_activity']);
  const capabilities = JSON.parse(f.calls().find(call => call.params?.name === 'appium_session_management')!.params!.arguments!.capabilities as unknown as string) as Record<string, unknown>;
  assert.equal(capabilities['appium:skipUnlock'], true);
  assert.equal(capabilities['appium:systemPort'], 18200);
  const owner = f.admission.inspect({ category: 'android-phone', value: SERIAL })!.owner!;
  const kinds = f.admission.readGeneration(owner).components.map(component => component.kind).sort();
  for (const kind of ['appium-forward', 'appium-process-group', 'appium-settings', 'appium-uiautomator2']) assert.ok(kinds.includes(kind), `${kind} recorded`);
  const forward = f.admission.readGeneration(owner).components.find(component => component.kind === 'appium-forward')!.declaration;
  assert.deepEqual({ ...(forward as object), id: 'x' }, { id: 'x', kind: 'appium-forward', serial: SERIAL, local: 'tcp:18200', remote: 'tcp:6790' });
  assert.deepEqual(f.driver.preparation(), { deviceIdentity: SERIAL, serial: SERIAL, agentSha256: (f.driver.provenance() as { uiautomator2ServerSha256: string }).uiautomator2ServerSha256 });
  assert.equal('wdaTreeSha256' in f.driver.provenance(), false);
  await f.driver.observe(live());
  await f.driver.close(live());
  assert.deepEqual(f.tools().slice(-2), ['jev_terminate_app', 'appium_session_management']);
  assert.deepEqual(f.fence.forwards, [], 'the owned forward is removed');
  assert.equal(f.fence.processes.size, 0, 'both UiAutomator2 processes are stopped');
  assert.equal(f.admission.inspect({ category: 'android-phone', value: SERIAL })!.state, 'available');
  assertNeverQuarantined(f.admission, owner);
});

test('an Android device with a locked screen refuses with DEVICE_LOCKED before any session, and is available again', async t => {
  const f = androidWorld(t, true);
  await assert.rejects(f.driver.prepare({ app: androidApp }, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_LOCKED');
  assert.deepEqual(f.tools(), []);
  assert.equal(f.admission.inspect({ category: 'android-phone', value: SERIAL })!.state, 'available');
});

test('a paused run whose session was lost is replaced by a fresh child and session, and observes afresh without acting', async t => {
  let allocated = 0;
  const f = driverFixture(t, observeRecording, { ...ios, freePort: async () => 18100 + (allocated++ % 2) });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  await f.driver.observe(live());
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  const groups = () => f.admission.readGeneration(owner).components.filter(component => component.kind === 'appium-process-group')
    .map(component => (component.declaration as { pgid: number }).pgid);
  const [lost] = groups();
  process.kill(lost!, 'SIGKILL');
  for (let waited = 0; waited < 4000; waited += 20) { try { process.kill(lost!, 0); await delay(20); } catch { break; } }
  const fresh = await f.driver.observe(live());
  assert.ok(fresh.elements.length > 0);
  assert.equal(groups().length, 2, 'the replacement child is recorded before its session');
  assert.equal(f.tools().filter(name => name === 'appium_perform_actions').length, 0, 'nothing acted');
  assert.equal(f.tools().filter(name => name === 'appium_session_management').length, 2, 'one create per child');
  await f.driver.close(live());
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
});

const digest = 'a'.repeat(64);
async function parkedAllocation(admission: Admission) {
  const reserved = admission.reserveAllocation({ actionId: 'allocated', preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'create', deviceTypeId: 'device-type', runtimeId: 'runtime' }, inspectedContentDigest: digest,
    artifactBytes: 100, configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/evidence',
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800,
      maxReservedBytes: 6400, minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000,
      installTimeoutMs: 120000, launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } });
  if (reserved.kind !== 'reserved') throw new Error('reserve');
  const reservation = reserved.reservation;
  reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'host' } } });
  await reservation.create(async () => ({ status: 'created', udid: UDID, provenance: { kind: 'simctl-create',
    allocationId: reservation.identity.allocationId, name: `jev-observed-${reservation.identity.allocationId}`, deviceTypeId: 'device-type', runtimeId: 'runtime' } }));
  const admitted = reservation.admit();
  if (admitted.kind !== 'admitted') throw new Error('admit');
  return { claim: admitted.claim, id: reservation.identity.allocationId };
}
const observedContext = { app: { bundleId: 'dev.fixture' }, device: { udid: UDID }, values: {} };

test('observed preparation launches once without helpers, deletes its session and fences before park, and keeps the app', async t => {
  const f = driverFixture(t, observeRecording, ios, 'none', command => ['ios-boot', 'ios-install', 'ios-launch'].includes(command.kind) ? '' : undefined);
  f.fence.wda = [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }];
  const p = await parkedAllocation(f.admission);
  await f.driver.attachPreparation(p.claim, observedContext, live());
  await f.driver.boot(live());
  await f.driver.install('/isolated/Fixture.app', live());
  await f.driver.launch(live());
  assert.deepEqual(f.native.calls.map(call => call.command.kind), ['ios-boot', 'ios-install', 'ios-launch'], 'no console and no log stream');
  assert.deepEqual(f.native.calls[2]!.command.args, ['simctl', 'launch', '--terminate-running-process', UDID, 'dev.fixture']);
  await f.driver.readiness(live());
  const parked = await f.driver.park(['/isolated/evidence/readiness.json'], [], live());
  assert.equal(parked.authority, 'committed');
  assert.deepEqual(f.tools().filter(name => name === 'appium_session_management' || name === 'jev_terminate_app'), ['appium_session_management', 'appium_session_management'],
    'the preparation session is created and deleted, and the app is never terminated');
  assert.deepEqual(f.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }]);
  assert.deepEqual(f.fence.wda, [], 'the runner is not running on that simulator at park');
});

test('the observed action opens a fresh session with no launch, and fences its components before the runtime terminal', async t => {
  const f = driverFixture(t, observeRecording, ios, 'none', command => ['ios-boot', 'ios-install', 'ios-launch'].includes(command.kind) ? '' : undefined);
  const p = await parkedAllocation(f.admission);
  await f.driver.attachPreparation(p.claim, observedContext, live());
  await f.driver.boot(live()); await f.driver.install('/isolated/Fixture.app', live()); await f.driver.launch(live()); await f.driver.readiness(live());
  assert.equal((await f.driver.park(['/isolated/evidence/readiness.json'], [], live())).authority, 'committed');
  const consumed = f.admission.consumeAllocation({ allocationId: p.id, actionId: 'allocated', actionDigest: digest, request: {}, appBundleId: 'dev.fixture',
    evidence: { bridgeVersion: 'fixture', directory: '/isolated/action', request: '/isolated/action/request.json' } });
  if (consumed.kind !== 'consumed') throw new Error('consume');
  const executor = driverFixture(t, observeRecording, ios, 'none');
  executor.fence.wda = [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 778 }];
  const action = new AppiumDriver({ ...executor.driver['options'], admission: f.admission });
  executor.drivers.push(action);
  await action.attachObserved(consumed.claim, observedContext, live());
  assert.deepEqual(executor.native.calls, [], 'no launch, console or log stream');
  assert.deepEqual(executor.tools(), ['appium_session_management', 'jev_settings']);
  await action.close(live());
  assert.deepEqual(executor.tools(), ['appium_session_management', 'jev_settings', 'appium_session_management'], 'deleted, never terminated');
  assert.deepEqual(executor.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: UDID, bundleId: WDA_BUNDLE, pid: 778 }]);
  consumed.claim.recordActionReceipt({ actionAttempted: false, actionAcknowledged: false });
  const terminal = consumed.claim.finalize({ outcome: 'refused', disposition: 'available', payload: {}, evidenceRefs: [] });
  assert.equal(terminal.authority, 'committed', 'the staged fence covers every Appium component of the action');
});
