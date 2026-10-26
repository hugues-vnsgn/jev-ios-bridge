import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { teardown } from './fixtures/teardown.js';

const experiments = fileURLToPath(new URL('../.scratch/appium-mcp-migration/candidate-stack/experiments/', import.meta.url));
test('recorded native children remain stoppable after escaping their MCP group and parent death', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-native-processes-'));
  const owner = join(directory, 'owner.json');
  const fixture = fileURLToPath(new URL('./fixtures/appium-native-processes.mjs', import.meta.url));
  const foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const child = spawn('python3', [join(experiments, 'owned-launcher.py'), owner, process.execPath, fixture, directory], { stdio: ['ignore', 'pipe', 'pipe'] });
  teardown(t, directory, [child, foreign], () => {
    spawnSync('python3', [join(experiments, 'stop-native-children.py'), directory, owner, 'stop'], { timeout: 15_000 });
  });
  let stderr = ''; child.stderr!.on('data', data => { stderr += data; });
  const ready = await Promise.race([once(child.stdout!, 'data'), once(child, 'exit').then(() => { throw new Error(stderr); })]);
  const helper = JSON.parse(String(ready[0])).helperPid as number;
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  process.kill(helper, 0);
  const result = spawnSync('python3', [join(experiments, 'stop-native-children.py'), directory, owner, 'stop'], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.recordedChildrenStopped, true);
  assert.ok(receipt.components.some((x: { pid: number; stopped: boolean }) => x.pid === helper && x.stopped));
  assert.equal(foreign.exitCode, null); process.kill(foreign.pid!, 0);
});

test('a second experiment process cannot enter its device lifecycle while the first holds the device', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-experiment-lock-'));
  const launcher = join(experiments, 'experiment-device-lock.py');
  const lock = join(directory, 'device.lock');
  const first = spawn('python3', [launcher, lock, process.execPath, '-e', 'console.log("held"); setInterval(() => {}, 1000)'], { stdio: ['ignore', 'pipe', 'pipe'] });
  teardown(t, directory, [first]);
  let stderr = ''; first.stderr!.on('data', data => { stderr += data; });
  await Promise.race([once(first.stdout!, 'data'), once(first, 'exit').then(() => { throw new Error(stderr); })]);
  const second = spawnSync('python3', [launcher, lock, process.execPath, '-e', 'console.log("entered device lifecycle")'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(second.status, 11); assert.equal(second.stdout, ''); assert.match(second.stderr, /EXPERIMENT_DEVICE_BUSY/);
});

test('a completed native protocol cannot pass when cleanup or the recorded automation fence is missing', t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-live-result-'));
  teardown(t, directory);
  const path = join(directory, 'result.json');
  const settled = {
    roundTrip: 'passed-live-fault-control', dispatchClosed: true, final: { closed: true },
    descendantVerification: { verified: true }, hostStop: { groupStopped: true }, childStop: { recordedChildrenStopped: true },
    nativeStop: { deviceOffline: true, ownedPortsClosed: true }, releasePredicateRecorded: true,
    automationFence: { ownedAutomationInert: true, deviceRemainsRunning: true, deviceShutdownIssued: false },
    faultExpected: true, lostReply: { failure: 'Connection closed' }, retryBlockedBeforeWire: true,
    localClosureProof: { commandsUnchanged: true },
  };
  const run = (state: object) => {
    writeFileSync(path, JSON.stringify(state));
    return spawnSync(process.execPath, [join(experiments, 'live-experiment-result.mjs'), path, 'automation'], { encoding: 'utf8', timeout: 5000 });
  };
  assert.equal(run(settled).status, 0);
  for (const missing of ['descendantVerification', 'dispatchClosed', 'final', 'hostStop', 'childStop', 'nativeStop', 'releasePredicateRecorded', 'automationFence', 'localClosureProof']) {
    const partial: Record<string, unknown> = { ...settled }; delete partial[missing];
    assert.equal(run(partial).status, 1, missing);
  }
  assert.equal(run({ ...settled, lostReply: { reply: { isError: false } } }).status, 1);
  assert.equal(run({ ...settled, automationFenceFailure: 'Native automation remained active' }).status, 1);
});
