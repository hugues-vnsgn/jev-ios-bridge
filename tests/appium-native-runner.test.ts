import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeLogSource } from '../src/device/logs.js';
import { launchIosConsole } from '../src/appium/native/ios.js';
import { ownedNativeRunner, runNativeCommand, type NativeChild, type NativeSpawn } from '../src/appium/native/process.js';

class Child extends EventEmitter implements NativeChild {
  pid = 702;
  stdout = new PassThrough(); stderr = new PassThrough();
  signals: NodeJS.Signals[] = [];
  ignoreTerm = false; ignoreKill = false;
  kill(signal: NodeJS.Signals) {
    this.signals.push(signal);
    if (signal === 'SIGTERM' && this.ignoreTerm || signal === 'SIGKILL' && this.ignoreKill) return true;
    this.stdout.end(); this.stderr.end(); this.emit('close', null, signal); return true;
  }
}
const command = { kind: 'ios-boot', file: 'xcrun', args: ['simctl', 'boot', 'udid'] } as const;
const output = { stdout: (_text: string) => {}, stderr: (_text: string) => {}, lost: () => {} };
function fixture(options: { record?: () => void; identity?: () => string | undefined } = {}) {
  const child = new Child(); const calls: unknown[] = []; const records: unknown[] = [];
  const spawn: NativeSpawn = (file, args, settings) => { calls.push({ file, args, settings }); return child; };
  const runner = ownedNativeRunner({ environment: { PATH: '/usr/bin', TYPESAFE_API_KEY: 'must-not-reach-child', ANDROID_ADB_SERVER_PORT: '5038' }, spawn,
    incarnation: options.identity ?? (() => 'Fri Oct 23 09:00:00 2026'), record: entry => { options.record?.(); records.push(entry); }, stopGraceMs: 5, killWaitMs: 5 });
  return { child, calls, records, runner };
}

test('native runner records PID/start identity before returning and strips the Jev key from child environment', async () => {
  const f = fixture(); const child = await f.runner(command, output, new AbortController().signal);
  assert.deepEqual(child.process, { pid: 702, incarnation: 'Fri Oct 23 09:00:00 2026' });
  assert.deepEqual(f.records, [{ command, process: child.process }]);
  assert.deepEqual(f.calls, [{ file: 'xcrun', args: ['simctl', 'boot', 'udid'], settings: { env: { PATH: '/usr/bin', ANDROID_ADB_SERVER_PORT: '5038' }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] } }]);
  await Promise.all([child.stop(), child.stop()]);
  assert.deepEqual(f.child.signals, ['SIGTERM']);
});

test('native runner owns stdout/stderr and reports lost streams without inventing an app failure', async () => {
  const f = fixture(); const received: string[] = [];
  const child = await f.runner(command, { stdout: text => received.push(`out ${text}`), stderr: text => received.push(`err ${text}`), lost: () => received.push('lost') }, new AbortController().signal);
  f.child.stdout.write('print'); f.child.stderr.write('error'); f.child.stdout.emit('error', new Error('lost'));
  assert.deepEqual(received, ['out print', 'err error', 'lost']);
  f.child.emit('close', 0, null);
  assert.deepEqual(await child.exited, { kind: 'exited', code: 0 });
});

test('a bounded native step expires once, stops its owned child and reports an unknown outcome', async () => {
  const f = fixture();
  await assert.rejects(runNativeCommand({ command, runner: f.runner, timeoutMs: 5, signal: new AbortController().signal }), { code: 'NATIVE_OUTCOME_UNKNOWN' });
  assert.deepEqual([f.calls.length, f.records.length, f.child.signals], [1, 1, ['SIGTERM']]);
});

test('native stop escalates once and refuses to signal a reused PID', async () => {
  const f = fixture(); f.child.ignoreTerm = true;
  const child = await f.runner(command, output, new AbortController().signal);
  await child.stop();
  assert.deepEqual(f.child.signals, ['SIGTERM', 'SIGKILL']);
  let identity = 'first'; const reused = fixture({ identity: () => identity });
  const second = await reused.runner(command, output, new AbortController().signal); identity = 'replacement';
  await assert.rejects(second.stop(), { code: 'NATIVE_OUTCOME_UNKNOWN' });
  assert.deepEqual(reused.child.signals, []);
});

test('unconfirmed stop is bounded and retains the failed cleanup result on a repeated close', async () => {
  const f = fixture(); f.child.ignoreTerm = true; f.child.ignoreKill = true;
  const child = await f.runner(command, output, new AbortController().signal);
  await assert.rejects(child.stop(), { code: 'NATIVE_OUTCOME_UNKNOWN' });
  await assert.rejects(child.stop(), { code: 'NATIVE_OUTCOME_UNKNOWN' });
  assert.deepEqual(f.child.signals, ['SIGTERM', 'SIGKILL']);
});

test('ownership-recording failure stops the child and pre-aborted work never starts', async () => {
  const f = fixture({ record: () => { throw new Error('store failed'); } });
  await assert.rejects(f.runner(command, output, new AbortController().signal), /store failed/);
  assert.deepEqual(f.child.signals, ['SIGTERM']);
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(f.runner(command, output, controller.signal), /cancelled/);
  assert.equal(f.calls.length, 1);
});

test('abort after dispatch waits for owned cleanup and nonzero exit is a known failure', async () => {
  const f = fixture(); const controller = new AbortController();
  const pending = runNativeCommand({ command, runner: f.runner, signal: controller.signal, timeoutMs: 100 });
  await Promise.resolve(); controller.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/);
  assert.deepEqual(f.child.signals, ['SIGTERM']);
  const nonzero = fixture();
  const failed = runNativeCommand({ command, runner: nonzero.runner, signal: new AbortController().signal, timeoutMs: 100 });
  nonzero.child.emit('close', 3, null);
  await assert.rejects(failed, { code: 'NATIVE_FAILED' });
  assert.equal(nonzero.records.length, 1);
});

test('a process error after spawn cannot prove the owned child exited', async () => {
  const f = fixture(); const child = await f.runner(command, output, new AbortController().signal);
  f.child.emit('error', new Error('signal failed'));
  await child.stop();
  assert.deepEqual(f.child.signals, ['SIGTERM']);
});

test('missing start identity refuses without sending a signal to an unbound PID', async () => {
  const f = fixture({ identity: () => undefined });
  await assert.rejects(f.runner(command, output, new AbortController().signal), { code: 'NATIVE_OUTCOME_UNKNOWN' });
  assert.deepEqual([f.records, f.child.signals], [[], []]);
});

test('synchronous spawn failure clears the one-shot deadline without dispatching again', async () => {
  let starts = 0;
  const runner = ownedNativeRunner({ environment: {}, record: () => {}, spawn: () => { starts++; throw new Error('spawn refused'); } });
  await assert.rejects(runNativeCommand({ command, runner, signal: new AbortController().signal, timeoutMs: 5 }), /spawn refused/);
  assert.equal(starts, 1);
});

const realRunner = (spawnAs?: NativeSpawn) => ownedNativeRunner({ environment: { PATH: '/usr/bin:/bin' }, record: () => {}, ...(spawnAs ? { spawn: spawnAs } : {}) });
const runReal = (file: string, args: string[]) => runNativeCommand({ command: { kind: 'android-keyguard', file, args }, runner: realRunner(),
  signal: new AbortController().signal, timeoutMs: 10_000 });

test('real short commands that exit on their own report their exit, every time', async () => {
  for (let i = 0; i < 40; i++) {
    assert.deepEqual(await runReal('/bin/echo', ['hi']), { exitCode: 0, stdout: 'hi\n', stderr: '' });
    await assert.rejects(runReal('/bin/sh', ['-c', 'echo out; echo err >&2; exit 3']), { code: 'NATIVE_FAILED' });
  }
});

test('a real command killed by a signal has an unknown outcome', async () => {
  await assert.rejects(runReal('/bin/sh', ['-c', 'kill -9 $$']), { code: 'NATIVE_OUTCOME_UNKNOWN' });
});

test('a real iOS console that ends on its own is an app exit, not a lost source', async t => {
  for (let i = 0; i < 10; i++) {
    const root = await mkdtemp(join(tmpdir(), 'native-console-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = await createNativeLogSource({ path: join(root, 'console.log'), values: {} });
    const runner = realRunner((_file, _args, settings) => spawn('/bin/sh', ['-c', 'echo hello'], settings));
    const console = await launchIosConsole({ udid: 'udid', bundleId: 'com.example.app', runner, source, signal: new AbortController().signal });
    await console.exited;
    assert.deepEqual(console.problem()?.code, 'APP_EXITED');
    assert.equal(await source.readTail(), '[unavailable: SOURCE_ENDED]');
  }
});
