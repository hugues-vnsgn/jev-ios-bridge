import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeLogSource } from '../src/device/logs.js';
import { launchIosConsole, observeIosLogs, observedIosPreparation } from '../src/appium/native/ios.js';
import { androidNativeHelpers } from '../src/appium/native/android.js';
import type { NativeCommand, NativeOutput, NativeProcess, NativeRunner, NativeExit } from '../src/appium/native/process.js';

function fakeRunner() {
  const calls: { command: NativeCommand; output: NativeOutput; child: NativeProcess; exit: (exit: NativeExit) => void; stops: number }[] = [];
  const runner: NativeRunner = async (command, output, signal) => {
    signal.throwIfAborted();
    let exit!: (exit: NativeExit) => void;
    const exited = new Promise<NativeExit>(resolve => { exit = resolve; });
    const child: NativeProcess = {
      process: { pid: 400 + calls.length, incarnation: 'Fri Oct 23 09:00:00 2026' }, exited,
      stop: async () => { call.stops++; exit({ kind: 'exited', code: 0 }); },
    };
    const call = { command, output, child, exit, stops: 0 };
    calls.push(call);
    return child;
  };
  return { runner, calls };
}
const signal = () => new AbortController().signal;
async function log(t: { after(fn: () => Promise<void>): void }, name = 'console.log', values = {}) {
  const root = await mkdtemp(join(tmpdir(), 'native-helper-'));
  const source = await createNativeLogSource({ path: join(root, name), values });
  t.after(async () => { await source.finish(); await rm(root, { recursive: true, force: true }); });
  return source;
}
const target = { udid: '12345678-1234-1234-1234-123456789ABC', bundleId: 'com.example.app', deviceSet: '/private/sim set' };

test('iOS console records its PID at launch and sends literal launch arguments in the private set', async t => {
  const fake = fakeRunner(); const source = await log(t);
  const console = await launchIosConsole({ ...target, args: ['--name', 'two words', '$(no-shell)'], runner: fake.runner, source, signal: signal() });
  assert.deepEqual(fake.calls[0]!.command, { kind: 'ios-console', file: 'xcrun', args: ['simctl', '--set', '/private/sim set', 'launch', '--console-pty', '--terminate-running-process', target.udid, target.bundleId, '--name', 'two words', '$(no-shell)'] });
  assert.deepEqual(console.process, { pid: 400, incarnation: 'Fri Oct 23 09:00:00 2026' });
  assert.equal(console.running(), true);
  assert.equal(await source.readTail(), '');
  fake.calls[0]!.output.stdout('hello\n'); fake.calls[0]!.output.stderr('failure\n');
  assert.equal(await source.readTail(), 'hello\nfailure\n');
  await console.stop();
});

test('console exit reports APP_EXITED by its owned PID, while lost observation is unknown', async t => {
  const fake = fakeRunner(); const source = await log(t);
  const console = await launchIosConsole({ ...target, runner: fake.runner, source, signal: signal() });
  fake.calls[0]!.exit({ kind: 'exited', code: 0 }); await console.exited;
  assert.equal(console.running(), false);
  assert.deepEqual(console.problem(), { code: 'APP_EXITED', note: 'The app stopped unexpectedly: its console output ended while the run was still going.' });
  assert.equal(await source.readTail(), '[unavailable: SOURCE_ENDED]');
  const lostSource = await log(t); const lost = await launchIosConsole({ ...target, runner: fake.runner, source: lostSource, signal: signal() });
  fake.calls[1]!.output.lost();
  assert.equal(lost.running(), undefined);
  assert.deepEqual(lost.problem(), undefined);
  assert.equal(await lostSource.readTail(), '[unavailable: SOURCE_LOST]');
  fake.calls[1]!.exit({ kind: 'lost' }); await lost.exited;
  assert.equal(lost.running(), undefined);
  await lost.stop();
});

test('restart and repeated close mark expected before stopping and reject late output from old launches', async t => {
  const fake = fakeRunner(); const source = await log(t);
  const old = await launchIosConsole({ ...target, runner: fake.runner, source, signal: signal() });
  old.expectStop();
  await Promise.all([old.stop(), old.stop()]);
  assert.deepEqual([old.running(), old.problem(), fake.calls[0]!.stops], [false, undefined, 1]);
  fake.calls[0]!.output.stdout('late old output\n');
  assert.equal(await readFile(source.path, 'utf8'), '');
  const freshSource = await log(t);
  const fresh = await launchIosConsole({ ...target, runner: fake.runner, source: freshSource, signal: signal() });
  fake.calls[0]!.exit({ kind: 'exited', code: 1 });
  fake.calls[1]!.output.stdout('fresh\n');
  assert.deepEqual([fresh.process.pid, fresh.running(), await freshSource.readTail()], [401, true, 'fresh\n']);
  await fresh.stop();
});

test('log stream filters the app subsystem, distinguishes empty from lost and cannot diagnose an app exit', async t => {
  const fake = fakeRunner(); const source = await log(t, 'os.log');
  const stream = await observeIosLogs({ ...target, runner: fake.runner, source, signal: signal() });
  assert.deepEqual(fake.calls[0]!.command, { kind: 'ios-log-stream', file: 'xcrun', args: ['simctl', '--set', '/private/sim set', 'spawn', target.udid, 'log', 'stream', '--level=debug', '--predicate', 'subsystem == "com.example.app"'] });
  assert.deepEqual([await source.readTail(), stream.available()], ['', true]);
  fake.calls[0]!.exit({ kind: 'exited', code: 143 }); await stream.exited;
  assert.deepEqual([await source.readTail(), stream.available()], ['[unavailable: SOURCE_ENDED]', false]);
  await stream.stop();
});

test('native log sources mask split stdout and stderr values before persistence and cap incomplete lines', async t => {
  const source = await log(t, 'masked.log', { password: 'hunter2', card: '4111 1111', short: '4111' });
  source.write('stdout', 'password hun'); source.write('stdout', 'ter2\n');
  source.write('stderr', '4111 1111 then 4111'); await source.finish();
  assert.equal(await source.readTail(), 'password [value:password]\n[value:card] then [value:short]');
  assert.equal(await readFile(source.path, 'utf8'), 'password [value:password]\n[value:card] then [value:short]');
  const overflow = await log(t); overflow.write('stdout', 'x'.repeat(65_537));
  assert.equal(await overflow.readTail(), '[unavailable: LINE_TOO_LONG]');
});

test('observed preparation alone exposes bounded boot and install, without an automatic retry', async () => {
  const fake = fakeRunner();
  const preparation = observedIosPreparation({ role: 'observed-preparation', ...target, runner: fake.runner, timeoutMs: 25 });
  const boot = preparation.boot(signal()); await Promise.resolve(); fake.calls[0]!.exit({ kind: 'exited', code: 0 });
  assert.deepEqual(await boot, { exitCode: 0, stdout: '', stderr: '' });
  const install = preparation.install('/build/My App.app', signal()); await Promise.resolve(); fake.calls[1]!.exit({ kind: 'exited', code: 0 });
  assert.deepEqual(await install, { exitCode: 0, stdout: '', stderr: '' });
  assert.deepEqual(fake.calls.map(x => x.command), [
    { kind: 'ios-boot', file: 'xcrun', args: ['simctl', '--set', '/private/sim set', 'boot', target.udid] },
    { kind: 'ios-install', file: 'xcrun', args: ['simctl', '--set', '/private/sim set', 'install', target.udid, '/build/My App.app'] },
  ]);
  await assert.rejects(preparation.install('/build/My App.app', signal()), { code: 'NATIVE_OUTCOME_UNKNOWN' });
  assert.deepEqual(fake.calls.map(x => x.stops), [0, 0, 1]);
  assert.throws(() => observedIosPreparation({ ...target, runner: fake.runner, role: 'run' as 'observed-preparation' }), { code: 'ROLE_REFUSED' });
});

test('observed preparation launches the app with one owned simctl launch, no console and no log stream', async () => {
  const fake = fakeRunner();
  const preparation = observedIosPreparation({ role: 'observed-preparation', ...target, runner: fake.runner, timeoutMs: 25 });
  const launch = preparation.launch('dev.fixture', ['--demo', 'two words'], signal()); await Promise.resolve(); fake.calls[0]!.exit({ kind: 'exited', code: 0 });
  assert.deepEqual(await launch, { exitCode: 0, stdout: '', stderr: '' });
  assert.deepEqual(fake.calls.map(x => x.command), [
    { kind: 'ios-launch', file: 'xcrun', args: ['simctl', '--set', '/private/sim set', 'launch', '--terminate-running-process', target.udid, 'dev.fixture', '--demo', 'two words'] },
  ]);
});

const policy = (showing: boolean, awake: boolean) => `KeyguardServiceDelegate\n showing=${showing}\n interactiveState=INTERACTIVE_STATE_${awake ? 'AWAKE' : 'SLEEP'}\n`;
function replyingRunner(replies: string[]) {
  const commands: NativeCommand[] = [];
  const runner: NativeRunner = async (command, output) => {
    commands.push(command); output.stdout(replies.shift() ?? '');
    return { process: { pid: 500, incarnation: 'start' }, exited: Promise.resolve({ kind: 'exited', code: 0 }), stop: async () => {} };
  };
  return { commands, runner };
}

test('Android wake is convergent and launcher/foreground/keyguard probes emit only the allowed argv', async () => {
  const fake = replyingRunner([policy(false, false), '', policy(false, true), policy(false, true), 'com.example.app/.Main\n', 'topResumedActivity=ActivityRecord{a u0 com.example.app/.Main t1}']);
  const helper = androidNativeHelpers({ serial: 'emulator-5554', adb: '/sdk/adb', runner: fake.runner });
  assert.deepEqual(await helper.wake(signal()), { awake: true, keyguard: false });
  assert.deepEqual(await helper.wake(signal()), { awake: true, keyguard: false });
  assert.equal(await helper.launcher(target.bundleId, signal()), 'com.example.app/.Main');
  assert.equal(await helper.foreground(signal()), 'com.example.app');
  assert.deepEqual(fake.commands, [
    { kind: 'android-keyguard', file: '/sdk/adb', args: ['-s', 'emulator-5554', 'shell', "'dumpsys' 'window' 'policy'"] },
    { kind: 'android-wake', file: '/sdk/adb', args: ['-s', 'emulator-5554', 'shell', "'input' 'keyevent' 'KEYCODE_WAKEUP'"] },
    { kind: 'android-keyguard', file: '/sdk/adb', args: ['-s', 'emulator-5554', 'shell', "'dumpsys' 'window' 'policy'"] },
    { kind: 'android-keyguard', file: '/sdk/adb', args: ['-s', 'emulator-5554', 'shell', "'dumpsys' 'window' 'policy'"] },
    { kind: 'android-launcher', file: '/sdk/adb', args: ['-s', 'emulator-5554', 'shell', "'cmd' 'package' 'resolve-activity' '--brief' '-a' 'android.intent.action.MAIN' '-c' 'android.intent.category.LAUNCHER' 'com.example.app'"] },
    { kind: 'android-foreground', file: '/sdk/adb', args: ['-s', 'emulator-5554', 'shell', "'dumpsys' 'activity' 'activities'"] },
  ]);
});

test('Android refuses a locked screen before wake, including a keyguard appearing after wake', async () => {
  for (const replies of [[policy(true, true)], [policy(false, false), '', policy(true, true)]]) {
    const expectedCount = replies.length;
    const fake = replyingRunner(replies);
    const helper = androidNativeHelpers({ serial: 'serial', runner: fake.runner });
    await assert.rejects(helper.wake(signal()), { code: 'DEVICE_LOCKED' });
    assert.equal(fake.commands.length, expectedCount);
  }
});

test('malformed native probes refuse instead of treating lost observation as an unlocked foreground app', async () => {
  const fake = replyingRunner(['', 'no activity']); const helper = androidNativeHelpers({ serial: 'serial', runner: fake.runner });
  await assert.rejects(helper.wake(signal()), { code: 'NATIVE_UNAVAILABLE' });
  await assert.rejects(helper.launcher(target.bundleId, signal()), { code: 'NATIVE_UNAVAILABLE' });
  assert.equal(fake.commands.length, 2);
});


test('close cannot erase an app exit that happened before the expected-stop marker', async t => {
  const fake = fakeRunner(); const source = await log(t);
  const console = await launchIosConsole({ ...target, runner: fake.runner, source, signal: signal() });
  fake.calls[0]!.exit({ kind: 'exited', code: 1 }); await console.exited;
  await console.stop();
  assert.deepEqual(console.problem(), { code: 'APP_EXITED', note: 'The app stopped unexpectedly: its console output ended while the run was still going.' });
});

test('observer startup failure closes the log source and an aborted observer stops as expected', async t => {
  const source = await log(t);
  const runner: NativeRunner = async () => { throw new Error('spawn refused'); };
  await assert.rejects(launchIosConsole({ ...target, runner, source, signal: signal() }), /spawn refused/);
  assert.equal(await source.readTail(), '[unavailable: SOURCE_LOST]');
  assert.equal(source.available(), false);
  const fake = fakeRunner(); const controller = new AbortController(); const live = await log(t);
  const console = await launchIosConsole({ ...target, runner: fake.runner, source: live, signal: controller.signal });
  controller.abort(); await console.exited;
  assert.deepEqual([console.running(), console.problem(), fake.calls[0]!.stops], [false, undefined, 1]);
});

test('a missing native log file makes health unknown instead of reporting empty healthy output', async t => {
  const fake = fakeRunner(); const source = await log(t);
  const console = await launchIosConsole({ ...target, runner: fake.runner, source, signal: signal() });
  await rm(source.path);
  assert.equal(await source.readTail(), '[unavailable: ENOENT]');
  assert.equal(console.running(), undefined);
  await console.stop();
});

test('iOS default-set helpers never add private-set flags and invalid log predicates never dispatch', async t => {
  const fake = fakeRunner(); const source = await log(t);
  const console = await launchIosConsole({ udid: target.udid, bundleId: target.bundleId, runner: fake.runner, source, signal: signal() });
  assert.deepEqual(fake.calls[0]!.command.args, ['simctl', 'launch', '--console-pty', '--terminate-running-process', target.udid, target.bundleId]);
  await console.stop();
  const refused = await log(t);
  await assert.rejects(observeIosLogs({ ...target, bundleId: 'x" OR TRUEPREDICATE', runner: fake.runner, source: refused, signal: signal() }), { code: 'NATIVE_UNAVAILABLE' });
  await refused.finish();
  assert.equal(fake.calls.length, 1);
});

test('native log output cannot grow an unbounded queue while the file writer is pending', async t => {
  const source = await log(t);
  for (let index = 0; index < 20; index++) source.write('stdout', 'x'.repeat(65_535) + '\n');
  assert.equal(await source.readTail(), '[unavailable: BACKPRESSURE]');
  await source.finish();
  assert.equal((await readFile(source.path)).length, 1_048_576);
});
