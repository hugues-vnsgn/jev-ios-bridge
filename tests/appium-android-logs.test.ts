import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import type { AdbRunner } from '../src/device/android/adb.js';
import { createExitWatch } from '../src/device/android/exit-watch.js';
import type { LogcatOutput, LogcatStarter } from '../src/device/android/logcat.js';
import { DeviceReasonError } from '../src/device/index.js';
import { ANDROID_DEVICE, SERIAL, androidTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, world, worldFixture, type WorldRule } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const screens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] }]) };
const resumed = 'topResumedActivity=ActivityRecord{abc u0 example.app/.Main t1}\n';
const DEVICE_TIME = '1792836000.000';
const APP_LOG_ARGS = ['-s', SERIAL, 'logcat', '-v', 'threadtime,year,uid', '--uid=10123', '-T', DEVICE_TIME];
const EVENTS_ARGS = ['-s', SERIAL, 'logcat', '-b', 'events', '-v', 'threadtime,year', '-T', DEVICE_TIME,
  'am_proc_start:I', 'am_proc_died:I', 'am_crash:I', 'am_anr:I', 'am_kill:I', '*:S'];
const OLD_PID_STOPPED = ['2026-10-24 10:00:00.400  1000  1100 I am_kill : [0,4100,example.app,900,stop example.app]',
  '2026-10-24 10:00:00.410  1000  1100 I am_proc_died: [0,4100,example.app,900,17]'];

type Started = { args: string[]; output: LogcatOutput; pid: number; stops: number; feed(line: string): void; append(text: string): void };
function fakeLogcat(options: { refuse?: (args: string[]) => boolean; unconfirmed?: boolean } = {}) {
  const started: Started[] = [];
  const starter: LogcatStarter = {
    async start(args, output) {
      if (options.refuse?.(args)) throw new Error('spawn adb ENOENT');
      const pid = 6001 + started.length;
      if (typeof output === 'string') writeFileSync(output, '', { flag: 'wx', mode: 0o600 });
      let end!: () => void;
      const exited = new Promise<void>(resolve => { end = resolve; });
      const entry: Started = { args, output, pid, stops: 0,
        feed: line => { if (typeof output === 'function') output(line); },
        append: text => { if (typeof output === 'string') appendFileSync(output, text); } };
      started.push(entry);
      return { pid, process: { pid, incarnation: `logcat-${String(pid)}` }, exited,
        async stop() { entry.stops++; if (options.unconfirmed) throw new Error(`logcat ${String(pid)} did not exit`); end(); } };
    },
    async isLeftover() { return false; },
    async kill() {},
  };
  const events = () => started.find(entry => entry.args.includes('events'))!;
  return { starter, started, events, appLog: () => started.find(entry => entry.args.includes('threadtime,year,uid'))! };
}

function phoneShell(base: AdbRunner, sessionUp: () => boolean, onPidof: () => void, deviceTime: () => string): AdbRunner {
  return async (args, signal) => {
    const line = args.at(-1);
    if (line?.startsWith("'pidof' 'io.appium.uiautomator2.server'") && !sessionUp()) return { stdout: '', stderr: '', exitCode: 1 };
    if (line === "'pm' 'list' 'packages' '-U'") return { stdout: 'package:example.app.debug uid:10999\npackage:example.app uid:10123\n', stderr: '', exitCode: 0 };
    if (line === "'date' '+%s.%3N %z'") return { stdout: `${deviceTime()} +0000\n`, stderr: '', exitCode: 0 };
    if (line === "'pidof' 'example.app'") { onPidof(); return { stdout: '4242\n', stderr: '', exitCode: 0 }; }
    return base(args, signal);
  };
}

/** `deviceTime` reads the phone's clock; `oldLines` are what the previous instance logged, delivered once the new pid is read. */
function phone(t: TestContext, logcat: ReturnType<typeof fakeLogcat>, rules: WorldRule[] = [], deviceTime = () => DEVICE_TIME, oldLines = OLD_PID_STOPPED) {
  const target = androidTarget();
  let sessionUp = () => false;
  const adb = phoneShell(target.options.adb, () => sessionUp(), () => { for (const line of oldLines) logcat.events()?.feed(line); }, deviceTime);
  const f = worldFixture(t, world('android', screens, rules), { ...target.options, adb, logcat: logcat.starter, createExitWatch },
    command => command.kind === 'android-foreground' ? resumed : target.nativeReply(command));
  sessionUp = () => f.tools().includes('appium_session_management');
  f.fence.processes.set(5001, '424242'); f.fence.processes.set(5002, '424242');
  return f;
}

function androidReads(f: ReturnType<typeof phone>): string[] {
  const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!.owner;
  return f.admission.readGeneration(owner).commands.map(command => command.operation)
    .filter(operation => ['android-app-uid', 'android-device-time', 'android-app-pid', 'appium-terminate', 'appium-restart', 'android-foreground'].includes(operation));
}

test('a restart run streams the app log by uid to <logFolder>/<runId>.log, registers both streams, and close stops them', async t => {
  const logcat = fakeLogcat();
  const f = phone(t, logcat);
  await f.driver.prepare({ app: { package: 'example.app', activity: '.Main' } }, live());
  const file = join(f.root, 'logs', 'run-1.log');
  assert.deepEqual(logcat.started.map(entry => [entry.args, entry.output === file ? 'file' : typeof entry.output]), [[APP_LOG_ARGS, 'file'], [EVENTS_ARGS, 'function']]);
  assert.deepEqual(f.driver.logSources(), { logcat: file });
  assert.deepEqual(androidReads(f), ['appium-terminate', 'android-app-uid', 'android-device-time', 'appium-restart', 'android-app-pid'],
    'the streams start from the device time between the force-stop and the launch');
  const owner = f.admission.inspect(ANDROID_DEVICE)!.owner!;
  const helpers = f.admission.readGeneration(owner).components.filter(component => component.kind === 'appium-native-helper')
    .map(component => { const { role, process } = component.declaration as { role: string; process: unknown }; return { role, process }; });
  assert.deepEqual(helpers, [{ role: 'logcat', process: { pid: 6001, startTime: 'logcat-6001' } }, { role: 'exit-watch', process: { pid: 6002, startTime: 'logcat-6002' } }]);
  logcat.appLog().append('2026-10-24 10:00:01.000 10123  4242  4242 I Example: signed in\n');
  const snapshot = await f.driver.observe(live());
  assert.deepEqual(snapshot.logTails, { logcat: '2026-10-24 10:00:01.000 10123  4242  4242 I Example: signed in\n' });
  await f.driver.close(live());
  assert.deepEqual(logcat.started.map(entry => entry.stops), [1, 1]);
  assert.deepEqual(f.fence.effects.filter(effect => effect.kind === 'host-inventory' && effect.of.some(row => row.pid > 6000 && row.pid < 6003)),
    [{ kind: 'host-inventory', of: [{ pid: 6001, startTime: 'logcat-6001' }] }, { kind: 'host-inventory', of: [{ pid: 6002, startTime: 'logcat-6002' }] }]);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('a crash of the launched pid is APP_EXITED, and the restart\'s own stop of the previous pid is not', async t => {
  const logcat = fakeLogcat();
  const f = phone(t, logcat);
  await f.driver.prepare({ app: { package: 'example.app', activity: '.Main' } }, live());
  assert.deepEqual([f.driver.appRunning(), f.driver.appProblem()], [true, undefined], 'the previous instance\'s am_kill and am_proc_died are ignored');
  logcat.events().feed('2026-10-24 10:00:05.000   680  1107 I am_crash: [4242,0,example.app,547995206,java.lang.RuntimeException,boom,Main.kt,3,0]');
  assert.deepEqual([f.driver.appRunning(), f.driver.appProblem()], [false, { code: 'APP_EXITED', note: 'crashed: RuntimeException at Main.kt:3' }]);
});

test('a native crash the previous instance logged before the force-stop is not this run\'s APP_EXITED', async t => {
  const logcat = fakeLogcat();
  let stopped = () => false;
  const oldNativeCrash = '2026-10-24 10:00:00.500   680  1107 I am_crash: [680,0,example.app,547995206,Native crash,Segmentation fault,unknown,0,0]';
  const f = phone(t, logcat, [], () => stopped() ? '1792836001.000' : DEVICE_TIME, [oldNativeCrash]);
  stopped = () => f.tools().some(tool => tool === 'jev_terminate_app' || tool === 'jev_start_activity');
  await f.driver.prepare({ app: { package: 'example.app', activity: '.Main' } }, live());
  assert.deepEqual([f.driver.appRunning(), f.driver.appProblem()], [true, undefined]);
});

test('the restart marks no stop expected: a later death of the launched pid still reads APP_EXITED', async t => {
  const logcat = fakeLogcat();
  const f = phone(t, logcat);
  await f.driver.prepare({ app: { package: 'example.app', activity: '.Main' } }, live());
  logcat.events().feed('2026-10-24 10:00:06.000  1000  1100 I am_proc_died: [0,4242,example.app,900,17]');
  assert.deepEqual([f.driver.appRunning(), f.driver.appProblem()], [false, { code: 'APP_EXITED', note: 'exited' }]);
});

test('the close\'s own terminate is expected: the stop it causes is no APP_EXITED', async t => {
  const logcat = fakeLogcat();
  const f = phone(t, logcat, [{ tool: 'jev_terminate_app', nth: 2, fault: { kind: 'held' } }]);
  await f.driver.prepare({ app: { package: 'example.app', activity: '.Main' } }, live());
  const closed = f.driver.close(live());
  for (let waited = 0; !f.tools().includes('jev_terminate_app') && waited < 10_000; waited += 10) await delay(10);
  logcat.events().feed('2026-10-24 10:00:07.000  1000  1100 I am_kill : [0,4242,example.app,900,stop example.app]');
  assert.deepEqual([f.driver.appRunning(), f.driver.appProblem()], [false, undefined]);
  f.release();
  await closed;
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('an app log stream that will not start leaves the run going with no logcat source, and the events stream still watches', async t => {
  const logcat = fakeLogcat({ refuse: args => args.includes('threadtime,year,uid') });
  const f = phone(t, logcat);
  await f.driver.prepare({ app: { package: 'example.app', activity: '.Main' } }, live());
  const snapshot = await f.driver.observe(live());
  assert.deepEqual([f.driver.logSources(), snapshot.logTails, logcat.started.map(entry => entry.args), f.driver.appRunning()], [{}, undefined, [EVENTS_ARGS], true]);
  await f.driver.close(live());
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('attach starts both streams from now and reads the pid of the app in front; capture starts none', async t => {
  const attached = fakeLogcat();
  const f = phone(t, attached);
  await f.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live());
  assert.deepEqual([attached.started.map(entry => entry.args), f.driver.appRunning(), androidReads(f)],
    [[APP_LOG_ARGS, EVENTS_ARGS], true, ['android-foreground', 'android-app-uid', 'android-device-time', 'android-app-pid']]);
  await f.driver.close(live());
  assert.deepEqual(attached.started.map(entry => entry.stops), [1, 1]);
  const captured = fakeLogcat();
  const c = phone(t, captured);
  await c.driver.capture(live());
  assert.deepEqual([captured.started, c.driver.logSources()], [[], {}]);
  await c.driver.close(live());
});

test('a stream whose stop is unconfirmed fails the close, quarantines, and a recovery fence releases the device', async t => {
  const logcat = fakeLogcat({ unconfirmed: true });
  const f = phone(t, logcat);
  await f.driver.prepare({ app: { package: 'example.app', activity: '.Main' } }, live());
  await assert.rejects(f.driver.close(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'CLEANUP_FAILED'
    && error.message === 'The logcat streams 6001, 6002 could not be confirmed stopped.');
  assert.deepEqual(logcat.started.map(entry => entry.stops), [1, 1]);
  const attempt = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!;
  assert.deepEqual([attempt.terminal?.outcome, attempt.terminal?.disposition, f.admission.readGeneration(attempt.owner).recoveries.length,
    f.admission.inspect(ANDROID_DEVICE)!.state], ['inconclusive', 'quarantined', 1, 'available'], 'a recovery claim fenced the registered streams before release');
});
