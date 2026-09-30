import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adbRunner } from '../src/device/android/adb.js';
import { OutcomeUnknownError } from '../src/device/android/ledger.js';
import { DeviceReasonError } from '../src/device/index.js';
import { fakeSpawn } from './fixtures/adb-spawn.js';

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

test('an abort doesn\'t kill the child: the runner waits for it to exit, then throws the abort reason', async () => {
  const fake = fakeSpawn();
  const controller = new AbortController();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['-s', 'emulator-5554', 'shell', 'am', 'start', '-W'], controller.signal);
  let ended = false;
  void pending.then(() => { ended = true; }, () => { ended = true; });
  const reason = new Error('cancelled');
  controller.abort(reason);
  for (let turn = 0; turn < 5; turn++) await new Promise(resolveTurn => setImmediate(resolveTurn));
  assert.equal(ended, false, 'still waiting for the child');
  fake.child().exit(0, 'Status: ok\n');
  await assert.rejects(pending, (error: unknown) => error === reason);
});

test('a child killed from outside, with no exit status, has an unknown outcome', async () => {
  const fake = fakeSpawn();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['-s', 'emulator-5554', 'push', 'a', 'b'], new AbortController().signal);
  setImmediate(() => fake.child().emit('close', null, 'SIGTERM'));
  const error = await pending.then(() => undefined, (thrown: unknown) => thrown);
  assert.ok(error instanceof OutcomeUnknownError);
  assert.ok(error instanceof DeviceReasonError);
  assert.equal(error.code, 'DEVICE_ERROR');
  assert.equal(error.vendorCode, 'adb');
});

test('a child that ends with no exit status after an abort still has an unknown outcome, caused by the abort', async () => {
  const fake = fakeSpawn();
  const controller = new AbortController();
  const pending = adbRunner({ adb, environment: {}, spawn: fake.spawn })(['forward', '--list'], controller.signal);
  const reason = new Error('cancelled');
  controller.abort(reason);
  setImmediate(() => fake.child().emit('close', null, 'SIGTERM'));
  await assert.rejects(pending, (error: unknown) => error instanceof OutcomeUnknownError && error.cause === reason);
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
