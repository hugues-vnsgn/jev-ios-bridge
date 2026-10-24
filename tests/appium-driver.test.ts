import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test, type TestContext } from 'node:test';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { freeHostPort } from '../src/appium/ports.js';
import { fenceEffectSchema } from '../src/appium/fence/schema.js';
import type { DeviceDriver } from '../src/contracts/index.js';
import { AppiumDriver } from '../src/appium/driver.js';
import { Admission, type OwnerIdentity } from '../src/device/admission.js';
import { NativeHelperError } from '../src/appium/native/process.js';
import { createRunLog } from '../src/log/index.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { fakeProbeSpawn } from './fixtures/adb-spawn.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import { identityProbe } from '../src/device/android/probe.js';
import { DeviceReasonError, StaleSnapshotError } from '../src/device/index.js';
import { UDID, WDA_BUNDLE, driverFixture, fakeNativeRunner, hostRows, tapRecording, liveGroupRows, rewriteRecording, spliceRecordings } from './fixtures/appium-wire/driver-fixture.js';

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
  await f.driver.prepare({ app: { bundleId: 'example.app', launchArgs: ['--demo'] } }, live());
  assert.deepEqual(f.native.calls.map(call => call.command.kind), ['ios-console', 'ios-log-stream']);
  assert.deepEqual(f.native.calls[0]!.command.args, ['simctl', 'launch', '--console-pty', '--terminate-running-process', UDID, 'example.app', '--demo']);
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings']);
  assert.equal(f.calls().find(call => call.params?.name === 'appium_session_management')!.params!.arguments!.capabilities!.toString().includes('"appium:autoLaunch":false'), true);
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  const kinds = f.admission.readGeneration(owner).components.map(component => component.kind);
  assert.deepEqual([...new Set(kinds)].sort(), ['appium-fence-command', 'appium-native-helper', 'appium-process-group', 'appium-wda', 'one-shot']);
  assert.deepEqual([kinds.filter(kind => kind === 'appium-native-helper').length, kinds.filter(kind => kind === 'appium-wda').length], [2, 1]);
  const group = f.admission.readGeneration(owner).components.find(component => component.kind === 'appium-process-group')!.declaration as { leader: { pid: number; startTime: string }; runMarker: string; pgid: number };
  assert.equal(group.runMarker, '0123456789abcdef0123456789abcdef');
  assert.equal(group.leader.startTime, `host-${String(group.leader.pid)}`);
  assert.equal(group.pgid, group.leader.pid);
  assert.equal(f.driver.appRunning(), true);
  f.fence.host = [...liveGroupRows(f.admission, owner), ...hostRows(f.native.calls.map(call => ({ pid: call.child.process.pid, startTime: call.child.process.incarnation,
    ppid: process.pid, pgid: call.child.process.pid, state: 'running', executable: '/usr/bin/xcrun' })))];
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
  assert.deepEqual(await f.fence.run(fenceEffectSchema.parse({ kind: 'wda-inventory', udid: UDID }), live()), [], 'the runner is stopped');
  assert.deepEqual(f.fence.host, [], 'the group and both helpers were stopped by identity');
  assert.equal(f.fence.effects.filter(effect => effect.kind === 'host-signal-group').length, 1);
  assert.deepEqual(f.fence.effects.flatMap(effect => effect.kind === 'host-signal' ? [effect.process.pid] : []).sort(), f.native.calls.map(call => call.child.process.pid).sort());
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
function androidWorld(t: TestContext, locked = false, pids = '5001 5002\n', keyguardReply?: string, record?: (root: string) => string) {
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, host: { listener: async () => { throw new Error('no emulator'); }, directory: async () => { throw new Error('no emulator'); } } as never,
    spawn: fakeProbeSpawn((_file, args) => args[0] === 'devices' ? `List of devices attached\n${SERIAL} device\n` : `${SERIAL}\n`).spawn });
  const adbCalls: string[][] = [];
  // UiAutomator2 runs once a session has started it, and not before.
  let sessionStarted = () => false;
  const adb: AdbRunner = async args => {
    adbCalls.push([...args]);
    const line = args.at(-1) ?? '';
    if (line.includes('pidof')) return sessionStarted() && pids ? { stdout: pids, stderr: '', exitCode: 0 } : { stdout: '', stderr: '', exitCode: 1 };
    const pid = /\/proc\/(\d+)\/stat/.exec(line)?.[1];
    return pid ? { stdout: stat(Number(pid)), stderr: '', exitCode: 0 } : { stdout: '', stderr: 'unexpected', exitCode: 1 };
  };
  const recording = (root: string) => spliceRecordings(root, [
    { source: 'tests/fixtures/appium-wire/android/observe-2.jsonl', from: 0, to: 7 },
    { source: 'tests/fixtures/appium-wire/android/extension.jsonl', from: 15, to: 17 },
    { source: 'tests/fixtures/appium-wire/android/observe-2.jsonl', from: 7 }], [['android-test', SERIAL]]);
  const f = driverFixture(t, record ?? recording, { target: { platform: 'android', device: SERIAL, category: 'android-phone', serverInstallation: { kind: 'install' } },
    identityProbe: probe, adb, freePort: async () => 18200 }, 'none', command => command.kind === 'android-keyguard' ? keyguardReply ?? keyguard(locked) : command.kind === 'android-wake' ? '' : undefined);
  sessionStarted = () => f.tools().includes('appium_session_management');
  return { ...f, adbCalls };
}
const androidApp = { package: 'example.app', activity: '.Main', intentExtras: { route: 'settings' } };

test('an Android run wakes natively, restarts through jev_start_activity, records every component and fences them all at close', async t => {
  const f = androidWorld(t);
  f.fence.processes.set(5001, '424242'); f.fence.processes.set(5002, '424242');
  await f.driver.prepare({ app: androidApp }, live());
  f.fence.forwards = [{ serial: SERIAL, local: 'tcp:18200', remote: 'tcp:6790' }];
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
  f.fence.host = liveGroupRows(f.admission, owner);
  await f.driver.observe(live());
  await f.driver.close(live());
  assert.deepEqual(f.tools().slice(-2), ['jev_terminate_app', 'appium_session_management']);
  assert.deepEqual(f.fence.host, [], 'the private group was stopped');
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
  assert.deepEqual(await f.fence.run(fenceEffectSchema.parse({ kind: 'wda-inventory', udid: UDID }), live()), [], 'the runner is not running on that simulator at park');
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
  const action = new AppiumDriver({ ...executor.driver['options'], admission: f.admission });
  executor.drivers.push(action);
  await action.attachObserved(consumed.claim, observedContext, live());
  assert.deepEqual(executor.native.calls, [], 'no launch, console or log stream');
  assert.deepEqual(executor.tools(), ['appium_session_management', 'jev_settings']);
  await action.close(live());
  assert.deepEqual(executor.tools(), ['appium_session_management', 'jev_settings', 'appium_session_management'], 'deleted, never terminated');
  assert.deepEqual(executor.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }]);
  consumed.claim.recordActionReceipt({ actionAttempted: false, actionAcknowledged: false });
  const terminal = consumed.claim.finalize({ outcome: 'refused', disposition: 'available', payload: {}, evidenceRefs: [] });
  assert.equal(terminal.authority, 'committed', 'the staged fence covers every Appium component of the action');
});

test('a live private group is fenced through its recorded launcher: only that group stops, and a sibling group and an unrelated process are never signalled', async t => {
  const f = driverFixture(t, observeRecording, ios);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  const group = f.admission.readGeneration(owner).components.find(component => component.kind === 'appium-process-group')!.declaration as
    { leader: { pid: number; startTime: string }; runMarker: string; pgid: number };
  const bridge = { pid: process.pid, startTime: `host-${String(process.pid)}` };
  f.fence.host = hostRows([
    { ...bridge, ppid: 1, pgid: process.pid, state: 'running', executable: '/usr/local/bin/node' },
    { ...group.leader, ppid: bridge.pid, pgid: group.pgid, state: 'running', executable: '/usr/local/bin/node', runMarker: group.runMarker, launchChain: [bridge] },
    { pid: 990001, startTime: 'descendant', ppid: group.leader.pid, pgid: group.pgid, state: 'running', executable: '/sdk/platform-tools/adb', runMarker: group.runMarker, launchChain: [bridge] },
    { pid: 990010, startTime: 'sibling', ppid: bridge.pid, pgid: 990010, state: 'running', executable: '/usr/local/bin/node', runMarker: 'fedcba9876543210fedcba9876543210', launchChain: [bridge] },
    { pid: 990020, startTime: 'unrelated', ppid: 1, pgid: 990020, state: 'running', executable: '/bin/zsh' },
  ]);
  await f.driver.observe(live());
  await f.driver.close(live());
  const signals = f.fence.effects.filter(effect => effect.kind === 'host-signal' || effect.kind === 'host-signal-group');
  assert.deepEqual(signals.map(effect => effect.kind === 'host-signal-group' ? `group ${String(effect.pgid)} ${effect.signal}` : `process ${String(effect.process.pid)} ${effect.signal}`),
    [`group ${String(group.pgid)} SIGTERM`]);
  assert.deepEqual(f.fence.host.map(row => row.pid).sort(), [990010, 990020, process.pid].sort(), 'the sibling group, the unrelated shell and the bridge survive');
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
  assertNeverQuarantined(f.admission, owner);
});

const wda = (udid = UDID, pid = 777) => [{ udid, bundleId: WDA_BUNDLE, pid }];
const terminateRecording = (root: string) => { const [header, ...body] = readFileSync(resolve('tests/fixtures/appium-wire/ios/observe-2.jsonl'), 'utf8').trim().split('\n');
  const path = join(root, 'terminate.jsonl'); writeFileSync(path, [header ?? '', ...body.slice(0, 7), ...body.slice(15)].map(line => line.replaceAll('ios-test', UDID)).join('\n') + '\n'); return path; };

test('a lost console or log stream reads unavailable in the step tails, never empty', async t => {
  const f = driverFixture(t, observeRecording, ios);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  f.native.calls[0]!.output.stdout('partial line\n');
  f.native.calls[0]!.output.lost();
  const snapshot = await f.driver.observe(live());
  assert.equal(snapshot.logTails!.runtime, '[unavailable: SOURCE_LOST]');
});

test('a log stream that cannot start leaves the os source unavailable', async t => {
  const inner = fakeNativeRunner();
  const f = driverFixture(t, observeRecording, { ...ios, nativeRunner: async (command, output, signal) => {
    if (command.kind === 'ios-log-stream') throw new NativeHelperError('NATIVE_UNAVAILABLE', 'log stream did not start');
    return inner.runner(command, output, signal);
  } });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const snapshot = await f.driver.observe(live());
  assert.match(snapshot.logTails!.os!, /^\[unavailable: /);
});

test('an empty automation inventory after a created session marks inventory unknown, so the device is never released on a hint', async t => {
  const f = driverFixture(t, observeRecording, ios);
  f.fence.sessionRunner = undefined;
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  assert.equal(f.admission.readGeneration(owner).inventoryUnknownReason, 'WDA_IDENTITY_UNAVAILABLE');
  await assert.rejects(f.driver.close(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'CLEANUP_FAILED');
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'quarantined');
});

test('an Android session whose UiAutomator2 processes cannot be listed marks inventory unknown', async t => {
  const f = androidWorld(t, false, '');
  await f.driver.prepare({ app: androidApp }, live());
  const owner = f.admission.inspect({ category: 'android-phone', value: SERIAL })!.owner!;
  assert.equal(f.admission.readGeneration(owner).inventoryUnknownReason, 'UIAUTOMATOR2_IDENTITY_UNAVAILABLE');
});

test('close while prepare is still launching waits, then stops the session and helpers prepare installed', async t => {
  const inner = fakeNativeRunner();
  let release!: () => void; const gate = new Promise<void>(done => { release = done; });
  const f = driverFixture(t, terminateRecording, { ...ios, nativeRunner: async (command, output, signal) => {
    if (command.kind === 'ios-console') await gate;
    return inner.runner(command, output, signal);
  } });
  const preparing = f.driver.prepare({ app: { bundleId: 'example.app' } }, live()).catch((error: unknown) => error);
  for (let waited = 0; !f.admission.inspect({ category: 'ios-simulator', value: UDID })?.owner && waited < 4000; waited += 10) await delay(10);
  const closing = f.driver.close(live());
  release();
  await preparing; await closing;
  assert.equal(f.tools().filter(name => name === 'appium_session_management').length, 2, 'the session prepare created is deleted');
  assert.deepEqual(inner.calls.map(call => call.stops), [1, 1], 'the console and the log stream are stopped');
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
});

test('an act on a lost paused session refuses with STATE_UNAVAILABLE and sends nothing', async t => {
  const f = driverFixture(t, observeRecording, ios);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const snapshot = await f.driver.observe(live());
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  const group = f.admission.readGeneration(owner).components.find(component => component.kind === 'appium-process-group')!.declaration as { pgid: number };
  process.kill(group.pgid, 'SIGKILL');
  for (let waited = 0; waited < 4000; waited += 20) { try { process.kill(group.pgid, 0); await delay(20); } catch { break; } }
  const target = snapshot.elements.find(element => element.actions.includes('tap'))!;
  await assert.rejects(f.driver.act({ kind: 'tap', targetRef: target.ref }, snapshot, { app: { bundleId: 'example.app' }, values: {} }, live()),
    (error: unknown) => error instanceof DeviceReasonError && error.code === 'STATE_UNAVAILABLE');
  assert.equal(f.tools().includes('appium_perform_actions'), false);
});

test('an Android helper failure names adb as its vendor source', async t => {
  const f = androidWorld(t, false, '5001 5002\n', 'no keyguard state here\n');
  await assert.rejects(f.driver.prepare({ app: androidApp }, live()),
    (error: unknown) => error instanceof DeviceReasonError && error.vendorSource === 'adb' && error.vendorCode === 'NATIVE_UNAVAILABLE');
});

test('a lost COMMIT reply on the clean close still releases the lease when the store committed the release', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-lost-commit-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let dropped = false;
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'fast', fault: (point, operation) => {
    if (point === 'afterCommit' && operation === 'finalize' && !dropped) { dropped = true; throw new Error('Lost COMMIT reply'); }
  } });
  const f = driverFixture(t, terminateRecording, { ...ios, admission });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  await f.driver.close(live());
  assert.equal(dropped, true);
  assert.equal(admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
  assert.deepEqual(readdirSync(join(f.root, 'locks')).filter(name => !name.startsWith('.')), [], 'the lease is released');
});

test('real uncertainty quarantines the device and leaves it to a recovery claim', async t => {
  const inner = fakeNativeRunner();
  const f = driverFixture(t, observeRecording, { ...ios, nativeRunner: async (command, output, signal) => {
    if (command.kind === 'ios-console') throw new NativeHelperError('NATIVE_OUTCOME_UNKNOWN', 'the launch may have happened');
    return inner.runner(command, output, signal);
  } });
  await assert.rejects(f.driver.prepare({ app: { bundleId: 'example.app' } }, live()));
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'quarantined');
  assert.deepEqual(f.admission.readAttempt(owner.attempt)?.terminal?.disposition, 'quarantined');
  assert.equal(f.admission.readGeneration(owner).recoveries.length, 1, 'a recovery claim tried the fence');
});

test('a failed terminate fails the close after the session delete and helper stops still ran', async t => {
  const f = driverFixture(t, terminateRecording, ios, 'extension-error-secret');
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  await assert.rejects(f.driver.close(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'UI_ACTION_UNCONFIRMED');
  assert.deepEqual(f.tools().slice(-2), ['jev_terminate_app', 'appium_session_management']);
  assert.deepEqual(f.native.calls.map(call => call.stops), [1, 1]);
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  assert.equal(f.admission.readGeneration(owner).recoveries.length, 1, 'the failure went through a recovery claim');
});

test('a failed own fence falls back to a recovery claim that releases the device', async t => {
  const f = driverFixture(t, terminateRecording, ios);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  f.fence.failOnce = effect => effect.kind === 'wda-inventory';
  await assert.rejects(f.driver.close(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'CLEANUP_FAILED');
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
  assert.equal(f.admission.readGeneration(owner).recoveries.length, 1);
  assert.equal(f.admission.readAttempt(owner.attempt)?.terminal?.disposition, 'quarantined');
});

const scriptedCheckpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'choose.apple' }] }, assertions: [{ id: 'shown', claim: 'The apple button is visible.' }] } as const;
const judgeAll: ScriptedJudge = { async judge(assertions) { return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, 0.97])), inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } };
async function scriptedReport(t: TestContext, driver: DeviceDriver, scenario: unknown, runId: string): Promise<Record<string, unknown>> {
  const runs = realpathSync(mkdtempSync(join(tmpdir(), 'appium-scripted-')));
  t.after(() => rmSync(runs, { recursive: true, force: true }));
  const log = await createRunLog(runs, runId);
  const report = await runScriptedScenario({ runId, scenario: scenario as never, driver, judge: judgeAll, log });
  assert.equal(report.verdict, 'passed');
  return JSON.parse(readFileSync(join(runs, runId, 'report.json'), 'utf8')) as Record<string, unknown>;
}
const goldenKeys = (name: string) => Object.keys((JSON.parse(readFileSync(resolve('tests/golden/report-json.json'), 'utf8')) as Record<string, object>)[name]!).sort();

test('runScriptedScenario drives an iOS scenario through the Appium driver to a passed report.json with prepared.stack', async t => {
  const f = driverFixture(t, observeRecording, ios);
  const report = await scriptedReport(t, f.driver, { version: 1, app: { bundleId: 'example.app' }, values: {}, steps: [scriptedCheckpoint] }, 'appium-ios-run');
  assert.deepEqual(Object.keys(report).sort(), [...goldenKeys('passed'), 'prepared'].sort());
  assert.deepEqual(report.prepared, { stack: f.driver.provenance() });
  assert.equal(report.error, null);
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
});

test('runScriptedScenario drives an Android scenario through the Appium driver to a passed report.json with prepared.stack', async t => {
  const f = androidWorld(t, false);
  f.fence.processes.set(5001, '424242'); f.fence.processes.set(5002, '424242');
  const report = await scriptedReport(t, f.driver, { version: 1, platform: 'android', app: androidApp, device: { serial: SERIAL }, values: {}, steps: [scriptedCheckpoint] }, 'appium-android-run');
  assert.equal(report.platform, 'android');
  assert.deepEqual(report.prepared, { stack: f.driver.provenance() });
  assert.equal(f.admission.inspect({ category: 'android-phone', value: SERIAL })!.state, 'available');
});

const captureRecording = (root: string) => {
  const [header, ...body] = readFileSync(resolve('tests/fixtures/appium-wire/android/observe-2.jsonl'), 'utf8').trim().split('\n');
  const path = join(root, 'capture.jsonl');
  writeFileSync(path, [header ?? '', ...body.slice(0, 7), ...body.slice(7, 9), ...body.slice(11, 13), ...body.slice(17)].map(line => line.replaceAll('android-test', SERIAL)).join('\n') + '\n');
  return path;
};

test('D1: capture settles the current screen from page source alone, with no launch, reset, stop, screenshot or Jev request', async t => {
  const f = androidWorld(t, false, '5001 5002\n', undefined, captureRecording);
  f.fence.processes.set(5001, '424242'); f.fence.processes.set(5002, '424242');
  const snapshot = await f.driver.capture(live());
  assert.equal(snapshot.screenshotPath, undefined);
  assert.ok(snapshot.elements.some(element => element.identifier === 'choose.apple' && element.label === 'Add Apple ($2)'));
  await f.driver.close(live());
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'appium_get_page_source', 'appium_session_management']);
  assert.deepEqual(f.native.calls.map(call => call.command.kind), ['android-keyguard'], 'no launch or restart helper');
  assert.equal(f.admission.inspect({ category: 'android-phone', value: SERIAL })!.state, 'available');
});

test('D2: an input the provider answers with DRIVER_ERROR is unconfirmed, ends the run inconclusive and keeps the device quarantined', async t => {
  const f = driverFixture(t, root => tapRecording(root, { tap: 'error' }), ios);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const snapshot = await f.driver.observe(live());
  const go = snapshot.elements.find(element => element.identifier === 'go')!;
  await assert.rejects(f.driver.act({ kind: 'tap', targetRef: go.ref }, snapshot, { app: { bundleId: 'example.app' }, values: {} }, live()),
    (error: unknown) => error instanceof DeviceReasonError && error.code === 'UI_ACTION_UNCONFIRMED');
  await assert.rejects(f.driver.close(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'CLEANUP_FAILED');
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'quarantined');
  assert.equal(f.admission.readGeneration(owner).commands.find(command => command.operation === 'appium-tap')?.state, 'uncertain');
});

test('D3: the first screen of a replacement session is a fresh hand-back: an act on it is refused as stale and nothing is sent', async t => {
  let allocated = 0;
  const f = driverFixture(t, observeRecording, { ...ios, freePort: async () => 18100 + (allocated++ % 2) });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  await f.driver.observe(live());
  const owner = f.admission.inspect({ category: 'ios-simulator', value: UDID })!.owner!;
  const [group] = f.admission.readGeneration(owner).components.filter(component => component.kind === 'appium-process-group').map(component => (component.declaration as { pgid: number }).pgid);
  process.kill(group!, 'SIGKILL');
  for (let waited = 0; waited < 4000; waited += 20) { try { process.kill(group!, 0); await delay(20); } catch { break; } }
  const replaced = await f.driver.observe(live());
  const target = replaced.elements.find(element => element.actions.includes('tap'))!;
  await assert.rejects(f.driver.act({ kind: 'tap', targetRef: target.ref }, replaced, { app: { bundleId: 'example.app' }, values: {} }, live()),
    (error: unknown) => error instanceof StaleSnapshotError);
  assert.equal(f.tools().includes('appium_perform_actions'), false);
});

test('D4: a WDA runner the store does not own makes the command DEVICE_BUSY before any session, and is never stopped', async t => {
  const f = driverFixture(t, observeRecording, ios);
  f.fence.wda = wda(UDID, 999);
  await assert.rejects(f.driver.prepare({ app: { bundleId: 'example.app' } }, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY');
  assert.deepEqual(f.calls(), [], 'no private child was started');
  assert.deepEqual(f.native.calls, [], 'no launch');
  assert.deepEqual([f.fence.effects.filter(effect => effect.kind === 'wda-stop'), f.fence.wda], [[], wda(UDID, 999)]);
  assert.equal(f.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
  const again = driverFixture(t, observeRecording, { ...ios, admission: f.admission, runId: 'run-2' });
  again.fence.wda = wda(UDID, 999);
  await assert.rejects(again.driver.prepare({ app: { bundleId: 'example.app' } }, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY',
    'the runner was never recorded as owned, so the next command refuses too');
});

test('D4: an automation forward the store does not own makes an Android command DEVICE_BUSY before any device effect, and stays', async t => {
  const f = androidWorld(t);
  f.fence.forwards = [{ serial: SERIAL, local: 'tcp:18300', remote: 'tcp:6790' }];
  await assert.rejects(f.driver.prepare({ app: androidApp }, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY');
  assert.deepEqual([f.calls(), f.native.calls, f.fence.forwards], [[], [], [{ serial: SERIAL, local: 'tcp:18300', remote: 'tcp:6790' }]]);
  assert.equal(f.fence.effects.some(effect => effect.kind === 'settings-read' || effect.kind === 'forward-remove'), false);
});
