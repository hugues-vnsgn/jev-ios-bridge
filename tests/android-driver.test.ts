import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { AppiumDriverOptions } from '../src/appium/driver.js';
import { isActOutcome, type Snapshot } from '../src/contracts/index.js';
import { Admission, type AdmissionDependencies } from '../src/device/admission.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import type { AppExitWatch } from '../src/device/android/exit-watch.js';
import type { LogcatOutput, LogcatStarter } from '../src/device/android/logcat.js';
import { DeviceReasonError, largestScrollable } from '../src/device/index.js';
import { CompatibilityMarker } from '../src/device/lease.js';
import { FakeAdb } from './fixtures/android-device.js';
import { ANDROID_DEVICE, SERIAL, androidTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, world, worldFixture, type AndroidView, type WorldRule } from './fixtures/appium-wire/world.js';

/**
 * The Android driver's own refusals and its log streams, on the Appium driver over the world provider: a fake phone
 * (`androidTarget`) or a fake emulator whose identity comes from `FakeAdb`'s read-only probe.
 */

const live = () => AbortSignal.timeout(20_000);
const reason = (code: string) => (error: unknown) => error instanceof DeviceReasonError && error.code === code;
const field: AndroidView = { className: 'android.widget.EditText', text: '{{typed}}', hint: 'City', id: 'example.app:id/city', clickable: true, bounds: [20, 200, 300, 244] };
const screens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] }, field]) };
const app = { app: { package: 'example.app', activity: '.Main' } };

function phone(t: TestContext, options: { state?: string; rules?: WorldRule[]; native?: (kind: string) => string | undefined; driver?: Partial<AppiumDriverOptions> } = {}) {
  const target = androidTarget({ state: options.state ?? 'device' });
  return worldFixture(t, world('android', screens, options.rules), { ...target.options, ...options.driver },
    command => options.native?.(command.kind) ?? target.nativeReply(command));
}

const AVD = 'jev-actions-api31';
const EMULATOR = { category: 'android-emulator', value: `/fake/avds/${AVD}.avd` } as const;
/** An emulator named by its serial, so the world's forward rows carry the serial its admission resolves to. */
function emulator(t: TestContext, options: Partial<AppiumDriverOptions> = {}) {
  const phoneParts = androidTarget();
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: AVD });
  const target = { platform: 'android', device: 'emulator-5554', serverInstallation: { kind: 'install' } } as const;
  return { adb, target, ...worldFixture(t, world('android', screens), { ...phoneParts.options, target, identityProbe: adb.identityProbe, ...options }, phoneParts.nativeReply) };
}

/** A store root of the test's own, for an admission built before the world. */
function storeRoot(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-android-store-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const store = (root: string, dependencies: AdmissionDependencies = {}) => Admission.forTesting({ root, backend: 'fake', durability: 'fast', ...dependencies });

for (const [state, code, message] of [
  ['unauthorized', 'DEVICE_UNAUTHORIZED', 'Device PHONE123 has not accepted this Mac\'s USB-debugging key'],
  ['offline', 'DEVICE_NOT_CONNECTED', 'Device PHONE123 is offline'],
  ['authorizing', 'DEVICE_NOT_CONNECTED', 'Device PHONE123 is authorizing'],
  ['recovery', 'DEVICE_NOT_CONNECTED', 'Device PHONE123 is recovery'],
  ['no permissions', 'DEVICE_NOT_CONNECTED', 'Device PHONE123 is no permissions'],
] as const) {
  test(`a phone in adb state ${state} is ${code} before admission or any session`, async t => {
    const f = phone(t, { state });
    await assert.rejects(f.driver.prepare(app, live()), (error: unknown) => reason(code)(error) && (error as Error).message === message);
    assert.deepEqual([f.tools(), f.native.calls, f.admission.inspect(ANDROID_DEVICE)], [[], [], undefined]);
  });
}

test('a serial adb doesn\'t list is DEVICE_NOT_FOUND before admission or any session', async t => {
  const target = androidTarget();
  const f = worldFixture(t, world('android', screens), { ...target.options, target: { ...target.options.target, device: 'MISSING1' } }, target.nativeReply);
  await assert.rejects(f.driver.prepare(app, live()), reason('DEVICE_NOT_FOUND'));
  assert.deepEqual([f.tools(), f.admission.inspect(ANDROID_DEVICE)], [[], undefined]);
});

test('a profile\'s phone category refuses an emulator of that name: DEVICE_NOT_FOUND before admission or any session', async t => {
  const f = emulator(t);
  const phoneOnly = f.open(world('android', screens), { target: { ...f.target, category: 'android-phone' } });
  await assert.rejects(phoneOnly.driver.prepare(app, live()), reason('DEVICE_NOT_FOUND'));
  assert.deepEqual([phoneOnly.calls(), f.admission.inspect(EMULATOR)], [[], undefined]);
});

test('a serial and its AVD name share one admission: the second is DEVICE_BUSY before any provider call, and the first runs on', async t => {
  const f = emulator(t);
  await f.driver.prepare(app, live());
  const byAvd = f.open(world('android', screens), { target: { ...f.target, device: AVD } });
  await assert.rejects(byAvd.driver.prepare(app, live()), reason('DEVICE_BUSY'));
  assert.deepEqual(byAvd.calls(), []);
  assert.equal((await f.driver.observe(live())).elements.find(element => element.identifier === 'example.app:id/home')?.label, 'Home');
  await f.driver.close(live());
  assert.equal(f.admission.inspect(EMULATOR)!.state, 'available');
});

test('an unknown marker under the emulator\'s AVD name, live or dead, is DEVICE_BUSY before admission, and is left as it was', async t => {
  for (const pid of [process.pid, 2147483647]) {
    const f = emulator(t);
    const marker = join(f.root, 'locks', `${AVD.toUpperCase()}.lock`);
    const content = JSON.stringify({ pid, token: 'unknown-token', deviceId: AVD, ownedProcesses: ['agent emulator-5554 4675', 'forward emulator-5554 tcp:65436', 'logcat emulator-5554 5001'] });
    writeFileSync(marker, content);
    await assert.rejects(f.driver.prepare(app, live()), reason('DEVICE_BUSY'));
    const capture = f.open(world('android', screens));
    await assert.rejects(capture.driver.capture(live()), reason('DEVICE_BUSY'));
    assert.deepEqual([f.calls(), capture.calls(), f.native.calls, f.fence.effects, f.admission.inspect(EMULATOR)], [[], [], [], [], undefined], String(pid));
    assert.equal(readFileSync(marker, 'utf8'), content);
  }
});

test('an unknown marker appearing after admission still refuses at take, before any session, and the device stays available', async t => {
  const root = storeRoot(t);
  let placeMarker = () => {};
  const f = emulator(t, { admission: store(root, { fault: (point, operation) => { if (point === 'afterCommit' && operation === 'acquire') placeMarker(); } }) });
  const marker = join(f.root, 'locks', `${AVD.toUpperCase()}.lock`);
  const content = JSON.stringify({ pid: 2147483647, token: 'late-unknown-token', deviceId: AVD });
  placeMarker = () => writeFileSync(marker, content);
  await assert.rejects(f.driver.prepare(app, live()), reason('DEVICE_BUSY'));
  assert.deepEqual([f.tools(), f.native.calls], [[], []]);
  assert.equal(readFileSync(marker, 'utf8'), content);
  assert.equal(f.admission.inspect(EMULATOR)!.state, 'available');
});

test('a dead owner\'s recorded marker permits recovery: the successor rewrites it with its own token, and close removes it', async t => {
  const root = storeRoot(t);
  const old = store(root, { process: { pid: 7711, incarnation: 'old-owner' } });
  const previous = old.acquire({ category: EMULATOR.category, device: EMULATOR.value, attempt: { kind: 'legacy', id: 'previous' }, digest: 'previous', intent: {} });
  if (previous.kind !== 'acquired') assert.fail('Expected the previous owner');
  const f = emulator(t, { admission: store(root, { ownerLiveness: owner => owner.pid === 7711 ? 'dead' : 'alive' }) });
  const markers = join(f.root, 'locks');
  await new CompatibilityMarker({ root: markers }).take(AVD, previous.claim);
  await f.driver.prepare(app, live());
  assert.deepEqual(old.readGeneration(previous.claim.identity).recoveries.map(recovery => recovery.closure), ['accepted']);
  const current = f.admission.inspect(EMULATOR)!;
  assert.equal(current.generation, 2);
  assert.equal((JSON.parse(readFileSync(join(markers, `${AVD.toUpperCase()}.lock`), 'utf8')) as { token: string }).token, current.owner!.token);
  await f.driver.close(live());
  assert.deepEqual(readdirSync(markers), []);
  assert.equal(f.admission.inspect(EMULATOR)!.state, 'available');
});

test('with no app.activity, the launcher lookup gives the activity the restart starts', async t => {
  const f = phone(t, { native: kind => kind === 'android-launcher'
    ? 'priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\nexample.app/.MainActivity\n' : undefined });
  await f.driver.prepare({ app: { package: 'example.app' } }, live());
  assert.equal(f.toolCalls().find(call => call.params!.name === 'jev_start_activity')!.params!.arguments!.activity, '.MainActivity');
  await f.driver.close(live());
});

test('an app with no launcher activity and no app.activity is DEVICE_ERROR from adb, and the app is never started', async t => {
  const f = phone(t, { native: kind => kind === 'android-launcher' ? 'No activity found\n' : undefined });
  await assert.rejects(f.driver.prepare({ app: { package: 'example.app' } }, live()),
    (error: unknown) => reason('DEVICE_ERROR')(error) && (error as DeviceReasonError).vendorSource === 'adb');
  assert.equal(f.tools().includes('jev_start_activity'), false);
});

test('each observation has a fresh sequence and its own screenshot file', async t => {
  const f = phone(t);
  await f.driver.prepare(app, live());
  const first = await f.driver.observe(live());
  const second = await f.driver.observe(live());
  assert.ok(second.sequence > first.sequence);
  assert.notEqual(first.screenshotPath, second.screenshotPath);
  assert.ok(existsSync(first.screenshotPath!) && existsSync(second.screenshotPath!));
  await f.driver.close(live());
});

test('a typing step whose value the scenario lacks is MISSING_VALUE before any input', async t => {
  const f = phone(t);
  await f.driver.prepare(app, live());
  const snapshot = await f.driver.observe(live());
  const city = snapshot.elements.find(element => element.identifier === 'example.app:id/city')!;
  await assert.rejects(f.driver.act({ kind: 'type', targetRef: city.ref, valueKey: 'city' }, snapshot, { ...app, values: {} }, live()), reason('MISSING_VALUE'));
  assert.equal(f.tools().includes('jev_replace_text'), false);
});

test('replace text returns the field\'s shown value from the fresh capture, keeping a trailing space', async t => {
  const f = phone(t);
  await f.driver.prepare(app, live());
  const snapshot = await f.driver.observe(live());
  const city = snapshot.elements.find(element => element.identifier === 'example.app:id/city')!;
  const result = await f.driver.act({ kind: 'type', targetRef: city.ref, valueKey: 'city' }, snapshot, { ...app, values: { city: 'Ha Noi ' } }, live());
  assert.ok(result && isActOutcome(result));
  assert.equal(result.shownValue, 'Ha Noi ');
  await f.driver.close(live());
});

test('scroll targets the largest scrollable element by area, not the first one listed', () => {
  const list = (ref: string, frame: { x: number; y: number; width: number; height: number }) =>
    ({ ref, role: 'scroll-view' as const, frame, state: { enabled: true, visible: true }, actions: ['swipeWithin' as const] });
  assert.equal(largestScrollable([list('small', { x: 0, y: 200, width: 1080, height: 300 }), list('big', { x: 100, y: 600, width: 800, height: 1000 })])?.ref, 'big');
});

/* The log streams: a fake logcat starter and the phone's answers to the reads the streams need. */

type Started = { args: string[]; output: LogcatOutput; stops: number; end(): void };
function fakeLogcat(): { starter: LogcatStarter; started: Started[] } {
  const started: Started[] = [];
  return { started, starter: {
    async start(args, output) {
      const pid = 6001 + started.length;
      if (typeof output === 'string') writeFileSync(output, '', { flag: 'wx', mode: 0o600 });
      let end!: () => void;
      const exited = new Promise<void>(resolve => { end = resolve; });
      const entry: Started = { args, output, stops: 0, end };
      started.push(entry);
      return { pid, process: { pid, incarnation: `logcat-${String(pid)}` }, exited, async stop() { entry.stops++; end(); } };
    },
    async isLeftover() { return false; },
    async kill() {},
  } };
}

const DEVICE_TIME = '1792836000.000';
const EVENTS = (time = DEVICE_TIME) => ['-s', SERIAL, 'logcat', '-b', 'events', '-v', 'threadtime,year', '-T', time,
  'am_proc_start:I', 'am_proc_died:I', 'am_crash:I', 'am_anr:I', 'am_kill:I', '*:S'];
type WatchInput = Parameters<NonNullable<AppiumDriverOptions['createExitWatch']>>[0];

/** A phone running streams: `packages` is what `pm list packages -U` prints, `date` what the device clock prints. */
function streaming(t: TestContext, options: { packages?: string; date?: { stdout: string; exitCode: number }; rules?: WorldRule[]; logFolder?: string } = {}) {
  const target = androidTarget();
  const logcat = fakeLogcat();
  const reads: string[] = [];
  const watches: WatchInput[] = [];
  const watchCalls: string[] = [];
  const createExitWatch = (input: WatchInput): AppExitWatch => {
    watches.push(input);
    return { feed() {}, launched: pid => { watchCalls.push(`launched ${String(pid)}`); }, expectStop: () => { watchCalls.push('expectStop'); },
      streamEnded: () => { watchCalls.push('streamEnded'); }, running: () => true, problem: () => undefined };
  };
  let sessionUp = () => false;
  const adb: AdbRunner = async (args, signal) => {
    const line = args.at(-1) ?? '';
    if (line.startsWith("'pidof' 'io.appium.uiautomator2.server'") && !sessionUp()) return { stdout: '', stderr: '', exitCode: 1 };
    if (line === "'pm' 'list' 'packages' '-U'") { reads.push('uid'); return { stdout: options.packages ?? 'package:example.app.debug uid:10999\npackage:example.app uid:10123\n', stderr: '', exitCode: 0 }; }
    if (line === "'date' '+%s.%3N %z'") { reads.push('time'); return { stderr: '', ...options.date ?? { stdout: `${DEVICE_TIME} +0000\n`, exitCode: 0 } }; }
    if (line === "'pidof' 'example.app'") { reads.push('pid'); return { stdout: '4242\n', stderr: '', exitCode: 0 }; }
    return target.options.adb(args, signal);
  };
  const f = worldFixture(t, world('android', screens, options.rules), { ...target.options, adb, logcat: logcat.starter, createExitWatch,
    ...(options.logFolder ? { logFolder: options.logFolder } : {}) }, target.nativeReply);
  sessionUp = () => f.tools().includes('appium_session_management');
  f.fence.processes.set(5001, '424242'); f.fence.processes.set(5002, '424242');
  return { ...f, logcat, reads, watches, watchCalls };
}

test('a missing uid starts only the events stream: no logcat source, and the run goes on', async t => {
  const f = streaming(t, { packages: 'package:example.app.debug uid:10999\n' });
  await f.driver.prepare(app, live());
  assert.deepEqual([f.logcat.started.map(entry => entry.args), f.driver.logSources(), f.reads], [[EVENTS()], {}, ['uid', 'time', 'pid']]);
  assert.equal((await f.driver.observe(live())).logTails, undefined);
  await f.driver.close(live());
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('a device time that can\'t be read starts no stream and reads no pid, and the run goes on with no app watch', async t => {
  for (const date of [{ stdout: '', exitCode: 1 }, { stdout: 'Mon Oct 30 10:00:00 UTC 2026\n', exitCode: 0 }]) {
    const f = streaming(t, { date });
    await f.driver.prepare(app, live());
    assert.deepEqual([f.logcat.started, f.driver.logSources(), f.reads, f.watches, f.driver.appRunning()], [[], {}, ['uid', 'time'], [], undefined], date.stdout);
    await f.driver.close(live());
  }
});

test('a negative UTC offset reaches the app watch in minutes, with the device time the streams start from', async t => {
  const f = streaming(t, { date: { stdout: `${DEVICE_TIME} -0330\n`, exitCode: 0 } });
  await f.driver.prepare(app, live());
  assert.deepEqual(f.watches, [{ package: 'example.app', startTime: Number(DEVICE_TIME), utcOffsetMinutes: -210 }]);
  assert.deepEqual(f.logcat.started.map(entry => entry.args.at(entry.args.indexOf('-T') + 1)), [DEVICE_TIME, DEVICE_TIME]);
  await f.driver.close(live());
});

test('an events stream that ends by itself tells the app watch; one close stops does not', async t => {
  const ended = streaming(t);
  await ended.driver.prepare(app, live());
  ended.logcat.started.find(entry => entry.args.includes('events'))!.end();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ended.watchCalls.filter(call => call === 'streamEnded'), ['streamEnded']);
  await ended.driver.close(live());
  const stopped = streaming(t);
  await stopped.driver.prepare(app, live());
  await stopped.driver.close(live());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([stopped.logcat.started.map(entry => entry.stops), stopped.watchCalls.filter(call => call === 'streamEnded')], [[1, 1], []]);
});

test('close stops both streams even when the restart failed', async t => {
  const f = streaming(t, { rules: [{ tool: 'jev_start_activity', fault: { kind: 'error', code: 'DRIVER_ERROR' } }] });
  await assert.rejects(f.driver.prepare(app, live()));
  assert.equal(f.logcat.started.length, 2);
  await f.driver.close(live()).catch(() => undefined);
  assert.deepEqual(f.logcat.started.map(entry => entry.stops), [1, 1]);
});

test('a log folder that is a symlink starts no stream and reads no uid, and the run goes on', async t => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'jev-android-logs-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(outside, 'real'), { mode: 0o700 });
  symlinkSync(join(outside, 'real'), join(outside, 'link'));
  const f = streaming(t, { logFolder: join(outside, 'link') });
  await f.driver.prepare(app, live());
  assert.deepEqual([f.logcat.started, f.reads, f.driver.logSources()], [[], [], {}]);
  assert.deepEqual(readdirSync(join(outside, 'real')), [], 'nothing written through the link');
  await f.driver.close(live());
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});
