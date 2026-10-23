import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFenceRunner } from '../src/appium/fence/runner.js';
import { fenceEffectSchema } from '../src/appium/fence/schema.js';

const signal = new AbortController().signal;
const result = (stdout: string, exitCode = 0, stderr = '') => ({ stdout, stderr, exitCode });
const stat = (pid: number, start: string) => `${pid} (uia server) S ${Array(18).fill('0').join(' ')} ${start} 0\n`;
function host() { return { inventory: async () => [], signalGroup: async () => {}, signalProcess: async () => {} }; }

test('Android settings restore uses recorded values, global policy keys, secure accessibility and deletion for absence', async () => {
  const calls: string[][] = [];
  const runner = createFenceRunner({ host: host(), adb: async args => {
    calls.push(args);
    if (args.at(-1) === "'settings' 'list' 'global'") return result('hidden_api_policy_p_apps=0\nhidden_api_policy_pre_p_apps=2\nunrelated=kept\n');
    if (args.at(-1) === "'settings' 'list' 'secure'") return result('accessibility_enabled=0\n');
    return result('');
  }, simctl: async () => { throw new Error('Unexpected iOS command'); } });
  const read = await runner(fenceEffectSchema.parse({ kind: 'settings-read', serial: 'one' }), signal);
  assert.deepEqual(read, { hidden_api_policy: null, hidden_api_policy_p_apps: '0', hidden_api_policy_pre_p_apps: '2', accessibility_enabled: '0' });
  assert.deepEqual(await runner(fenceEffectSchema.parse({ kind: 'settings-write', serial: 'one', key: 'hidden_api_policy', value: null }), signal), { ok: true });
  assert.deepEqual(await runner(fenceEffectSchema.parse({ kind: 'settings-write', serial: 'one', key: 'accessibility_enabled', value: '0' }), signal), { ok: true });
  assert.deepEqual(calls, [
    ['-s', 'one', 'shell', "'settings' 'list' 'global'"], ['-s', 'one', 'shell', "'settings' 'list' 'secure'"],
    ['-s', 'one', 'shell', "'settings' 'delete' 'global' 'hidden_api_policy'"], ['-s', 'one', 'shell', "'settings' 'put' 'secure' 'accessibility_enabled' '0'"],
  ]);
});

test('Android instrumentation is matched by proc start time before stopping only its recorded PID', async () => {
  const calls: string[][] = [];
  const runner = createFenceRunner({ host: host(), adb: async args => { calls.push(args); return args.at(-1)?.includes("'cat'") ? result(stat(300, '12345')) : result(''); }, simctl: async () => result('') });
  assert.deepEqual(await runner(fenceEffectSchema.parse({ kind: 'android-stop', serial: 'one', process: { pid: 300, startTime: '12345' } }), signal), { ok: true });
  assert.deepEqual(calls, [['-s', 'one', 'shell', "'cat' '/proc/300/stat'"], ['-s', 'one', 'shell', "'kill' '-TERM' '300'"]]);
  await assert.rejects(() => runner(fenceEffectSchema.parse({ kind: 'android-stop', serial: 'one', process: { pid: 300, startTime: '99999' } }), signal), /identity/i);
  assert.equal(calls.length, 3);
});

test('forward removal rechecks the recorded pair and never uses a fixed port', async () => {
  const calls: string[][] = [];
  const runner = createFenceRunner({ host: host(), adb: async args => { calls.push(args); return result(args[0] === 'forward' ? 'one tcp:19333 tcp:6790\nother tcp:19334 tcp:6790\n' : ''); }, simctl: async () => result('') });
  assert.deepEqual(await runner(fenceEffectSchema.parse({ kind: 'forward-remove', serial: 'one', local: 'tcp:19333', remote: 'tcp:6790' }), signal), { ok: true });
  assert.deepEqual(calls, [['forward', '--list'], ['-s', 'one', 'forward', '--remove', 'tcp:19333']]);
  await assert.rejects(() => runner(fenceEffectSchema.parse({ kind: 'forward-remove', serial: 'one', local: 'tcp:19334', remote: 'tcp:6790' }), signal), /identity/i);
  assert.equal(calls.length, 3);
});

test('WDA termination matches simulator, runner bundle and PID, with launchctl readback', async () => {
  const calls: string[][] = [];
  const udid = 'ABCDEF00-0000-4000-8000-000000000001';
  const bundleId = 'com.facebook.WebDriverAgentRunner.xctrunner';
  let running = true;
  const runner = createFenceRunner({ host: host(), adb: async () => { throw new Error('Unexpected Android command'); }, simctl: async args => {
    calls.push(args);
    if (args[0] === 'terminate') { running = false; return result(''); }
    return result(`PID\tStatus\tLabel\n${running ? '200' : '-'}\t0\tUIKitApplication:${bundleId}[test][rb-legacy]\n500\t0\tUIKitApplication:com.example.app[test]\n501\t0\tUIKitApplication:com.example.UnitTests.xctrunner[test]\n`);
  } });
  assert.deepEqual(await runner(fenceEffectSchema.parse({ kind: 'wda-inventory', udid }), signal), [{ udid, bundleId, pid: 200 }]);
  assert.deepEqual(await runner(fenceEffectSchema.parse({ kind: 'wda-stop', udid, bundleId, pid: 200 }), signal), { ok: true });
  assert.deepEqual(await runner(fenceEffectSchema.parse({ kind: 'wda-inventory', udid }), signal), []);
  assert.deepEqual(calls, [['spawn', udid, 'launchctl', 'list'], ['spawn', udid, 'launchctl', 'list'], ['terminate', udid, bundleId], ['spawn', udid, 'launchctl', 'list']]);
});

test('a group signal refuses a foreign or reused group member at the signal boundary', async () => {
  const calls: unknown[] = [];
  let rows = [
    { pid: 100, startTime: 'one', ppid: 1, pgid: 100, state: 'running', executable: '/node' },
    { pid: 101, startTime: 'two', ppid: 100, pgid: 100, state: 'running', executable: '/driver' },
  ];
  const runner = createFenceRunner({ host: { inventory: async () => rows, signalGroup: async (pgid, signal) => { calls.push({ pgid, signal }); }, signalProcess: async () => {} }, adb: async () => result(''), simctl: async () => result('') });
  const effect = fenceEffectSchema.parse({ kind: 'host-signal-group', pgid: 100, signal: 'SIGTERM', members: [{ pid: 100, startTime: 'one' }, { pid: 101, startTime: 'two' }] });
  assert.deepEqual(await runner(effect, signal), { ok: true });
  rows = [...rows, { pid: 102, startTime: 'foreign', ppid: 1, pgid: 100, state: 'running', executable: '/other' }];
  await assert.rejects(() => runner(effect, signal), /identity/i);
  rows = rows.slice(0, 2); rows[0]!.startTime = 'reused';
  await assert.rejects(() => runner(effect, signal), /identity/i);
  assert.deepEqual(calls, [{ pgid: 100, signal: 'SIGTERM' }]);
});

test('a late native read cannot dispatch a stop after cleanup cancellation', async () => {
  const controller = new AbortController();
  const calls: string[][] = [];
  const runner = createFenceRunner({ host: host(), adb: async args => {
    calls.push(args); controller.abort(new Error('cleanup budget expired')); return result(stat(300, '12345'));
  }, simctl: async () => result('') });
  await assert.rejects(() => runner(fenceEffectSchema.parse({ kind: 'android-stop', serial: 'one', process: { pid: 300, startTime: '12345' } }), controller.signal), /budget/);
  assert.deepEqual(calls, [['-s', 'one', 'shell', "'cat' '/proc/300/stat'"]]);
});
