import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { adbRunner, inLedger, OutcomeUnknownError, type AdbChild, type AdbSpawn } from '../src/device/android/adb.js';
import { DeviceReasonError } from '../src/device/index.js';
import type { DeviceCommandKind } from '../src/device/lease.js';

class FakeChild extends EventEmitter implements AdbChild {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kills: string[] = [];
  /** What a kill does: by default the child dies with no exit status, as SIGKILL leaves it. */
  onKill: (signal: NodeJS.Signals) => void = signal => { setImmediate(() => this.emit('close', null, signal)); };

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.kills.push(signal);
    this.onKill(signal);
    return true;
  }

  exit(code: number, stdout = '', stderr = ''): void {
    this.stdout.end(stdout);
    this.stderr.end(stderr);
    setImmediate(() => this.emit('close', code, null));
  }
}

function fakeSpawn(): { spawn: AdbSpawn; calls: Array<{ file: string; args: readonly string[]; options: Parameters<AdbSpawn>[2] }>; child: () => FakeChild } {
  const calls: Array<{ file: string; args: readonly string[]; options: Parameters<AdbSpawn>[2] }> = [];
  const children: FakeChild[] = [];
  return {
    calls,
    child: () => children.at(-1)!,
    spawn: (file, args, options) => {
      calls.push({ file, args, options });
      const child = new FakeChild();
      children.push(child);
      return child;
    },
  };
}

const adb = '/Users/someone/Library/Android/sdk/platform-tools/adb';

test('the adb runner spawns the given adb directly, never through a shell, and returns its output and exit code', async () => {
  const fake = fakeSpawn();
  const run = adbRunner({ adb, environment: { PATH: '/usr/bin' }, spawn: fake.spawn });
  const pending = run(['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'], new AbortController().signal);
  fake.child().exit(0, '1\n', '');
  assert.deepEqual(await pending, { stdout: '1\n', stderr: '', exitCode: 0 });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0]!.file, adb);
  assert.deepEqual(fake.calls[0]!.args, ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed']);
  assert.equal(fake.calls[0]!.options.shell, false);
  assert.deepEqual(fake.calls[0]!.options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('a non-zero exit is a known outcome: the runner returns it rather than throwing', async () => {
  const fake = fakeSpawn();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['-s', 'emulator-5554', 'shell', 'pm', 'path', 'org.example'], new AbortController().signal);
  fake.child().exit(1, '', 'error: device offline\n');
  assert.deepEqual(await pending, { stdout: '', stderr: 'error: device offline\n', exitCode: 1 });
});

test('the adb runner never passes the Jev key to adb, and keeps ANDROID_ADB_SERVER_PORT for the private adb server', async () => {
  const fake = fakeSpawn();
  const run = adbRunner({ adb, environment: { PATH: '/usr/bin', TYPESAFE_API_KEY: 'secret-key', ANDROID_ADB_SERVER_PORT: '5099' }, spawn: fake.spawn });
  const pending = run(['devices', '-l'], new AbortController().signal);
  fake.child().exit(0);
  await pending;
  const env = fake.calls[0]!.options.env;
  assert.equal('TYPESAFE_API_KEY' in env, false);
  assert.equal(env.ANDROID_ADB_SERVER_PORT, '5099');
  assert.equal(env.PATH, '/usr/bin');
});

test('an abort kills the child, and a child killed with no exit status has an unknown outcome', async () => {
  const fake = fakeSpawn();
  const controller = new AbortController();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['-s', 'emulator-5554', 'shell', 'am', 'start', '-W'], controller.signal);
  const reason = new Error('cancelled');
  controller.abort(reason);
  const error = await pending.then(() => undefined, (thrown: unknown) => thrown);
  assert.deepEqual(fake.child().kills, ['SIGKILL']);
  assert.ok(error instanceof OutcomeUnknownError);
  assert.ok(error instanceof DeviceReasonError);
  assert.equal(error.code, 'DEVICE_ERROR');
  assert.equal(error.vendorCode, 'adb');
  assert.equal(error.cause, reason);
});

test('a child killed from outside, with no exit status, has an unknown outcome', async () => {
  const fake = fakeSpawn();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['-s', 'emulator-5554', 'push', 'a', 'b'], new AbortController().signal);
  setImmediate(() => fake.child().emit('close', null, 'SIGTERM'));
  await assert.rejects(pending, (error: unknown) => error instanceof OutcomeUnknownError && error.vendorCode === 'adb');
});

test('an abort that races a child already exiting with a status is a known outcome: it throws the abort reason', async () => {
  const fake = fakeSpawn();
  const controller = new AbortController();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['forward', '--list'], controller.signal);
  const child = fake.child();
  child.onKill = () => { child.exit(0); };
  const reason = new Error('cancelled');
  controller.abort(reason);
  await assert.rejects(pending, (error: unknown) => error === reason);
});

test('a signal already aborted spawns nothing', async () => {
  const fake = fakeSpawn();
  const reason = new Error('cancelled');
  await assert.rejects(adbRunner({ adb, environment: {}, spawn: fake.spawn })(['devices'], AbortSignal.abort(reason)), (error: unknown) => error === reason);
  assert.equal(fake.calls.length, 0);
});

test('adb that fails to start is a known outcome: the spawn error is thrown as is', async () => {
  const fake = fakeSpawn();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['devices'], new AbortController().signal);
  const missing = Object.assign(new Error('spawn adb ENOENT'), { code: 'ENOENT' });
  fake.child().emit('error', missing);
  await assert.rejects(pending, (error: unknown) => error === missing);
});

function ledger(): { log: string[]; lease: { command(kind: DeviceCommandKind): { exited(): void; unknown(): void } } } {
  const log: string[] = [];
  return {
    log,
    lease: { command: (kind) => { log.push(kind); return { exited: () => log.push('exited'), unknown: () => log.push('unknown') }; } },
  };
}

test('inLedger records the command before it runs and marks it exited when it returns', async () => {
  const { log, lease } = ledger();
  const result = await inLedger(lease, 'adb', async () => { log.push('run'); return 'done'; });
  assert.equal(result, 'done');
  assert.deepEqual(log, ['adb', 'run', 'exited']);
});

test('inLedger marks a command that failed with a known outcome exited, and rethrows', async () => {
  const { log, lease } = ledger();
  const failure = new Error('agent refused');
  await assert.rejects(inLedger(lease, 'agent', async () => { throw failure; }), (error: unknown) => error === failure);
  assert.deepEqual(log, ['agent', 'exited']);
});

test('inLedger marks a command whose outcome is unknown as unknown, and rethrows', async () => {
  const { log, lease } = ledger();
  const lost = new OutcomeUnknownError('agent', 'The device agent request timed out');
  await assert.rejects(inLedger(lease, 'agent', async () => { throw lost; }), (error: unknown) => error === lost);
  assert.deepEqual(log, ['agent', 'unknown']);
});
