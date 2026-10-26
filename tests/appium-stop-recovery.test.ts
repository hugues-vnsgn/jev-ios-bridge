import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { teardown } from './fixtures/teardown.js';

// Phase 1's agreed seam: a controllable bridge process and its durable replies.
// This disposable journal is neither admission authority nor a device lease.
const cli = fileURLToPath(new URL('../.scratch/appium-mcp-migration/candidate-stack/experiments/stop-journal.mjs', import.meta.url));
function call(directory: string, operation: string, value: object = {}) {
  const result = spawnSync(process.execPath, [cli, directory, operation, JSON.stringify(value)], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('a fresh bridge process refuses a closed run without repeating its uncertain action', t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-stop-recovery-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const identity = { runId: 'run-one', platform: 'ios', device: '40A5E14C-7B08-43A0-844A-76FB94B4B34A' };
  call(directory, 'initialize', identity);
  assert.equal(call(directory, 'authorize', { id: 'create', tool: 'appium_session_management' }).accepted, true);
  call(directory, 'complete', { id: 'create' });
  assert.equal(call(directory, 'authorize', { id: 'press', tool: 'appium_gesture' }).accepted, true);
  call(directory, 'close');

  // Every invocation is a new OS process. Recovery cannot dispatch or rewrite
  // the action's outcome, even when a late native completion arrives afterward.
  const recovered = call(directory, 'recover');
  assert.equal(recovered.closed, true);
  assert.equal(recovered.outcome, 'inconclusive');
  assert.equal(recovered.leaseReleased, false);
  assert.equal(recovered.quarantined, true);
  assert.deepEqual(recovered.commands.map((x: { id: string; disposition: string }) => [x.id, x.disposition]), [['create', 'terminal'], ['press', 'uncertain']]);
  assert.deepEqual(call(directory, 'authorize', { id: 'retry', tool: 'appium_gesture' }), { accepted: false, reason: 'DISPATCH_CLOSED' });
  assert.equal(call(directory, 'complete', { id: 'press' }).accepted, false);
  assert.deepEqual(call(directory, 'recover'), recovered);
});

test('partial native evidence cannot settle uncertainty or publish a released lease', t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-native-stop-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  call(directory, 'initialize', { runId: 'one', platform: 'android', device: 'private-avd' });
  call(directory, 'authorize', { id: 'tap', tool: 'appium_gesture' });
  call(directory, 'close');
  const proof = { device: 'private-avd', receiptSha256: 'a'.repeat(64), hostGroupStopped: true, deviceOffline: true, ownedPortsClosed: true };
  assert.deepEqual(call(directory, 'record-fence', { ...proof, deviceOffline: false }), { accepted: false, reason: 'FENCE_UNPROVEN' });
  assert.equal(call(directory, 'recover').commands[0].disposition, 'uncertain');
  assert.deepEqual(call(directory, 'record-fence', { ...proof, device: 'foreign-device' }), { accepted: false, reason: 'FENCE_UNPROVEN' });
  assert.equal(call(directory, 'record-fence', proof).accepted, true);
  const recovered = call(directory, 'recover');
  assert.equal(recovered.commands[0].disposition, 'fenced');
  assert.equal(recovered.outcome, 'inconclusive');
  assert.equal(recovered.quarantined, true);
  assert.equal(recovered.leaseReleased, false);
});

test('stopping the owned process group ends a surviving child and leaves an independent process alive', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-group-stop-'));
  const launcher = fileURLToPath(new URL('../.scratch/appium-mcp-migration/candidate-stack/experiments/owned-launcher.py', import.meta.url));
  const stop = fileURLToPath(new URL('../.scratch/appium-mcp-migration/candidate-stack/experiments/stop-group.py', import.meta.url));
  const fixture = fileURLToPath(new URL('./fixtures/appium-stop-group.mjs', import.meta.url));
  const owner = join(directory, 'owner.json');
  const foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const child = spawn('python3', [launcher, owner, process.execPath, fixture], { stdio: ['ignore', 'pipe', 'pipe'] });
  teardown(t, directory, [child, foreign], () => {
    if (existsSync(owner)) spawnSync('python3', [stop, owner], { timeout: 15_000 });
  });
  const ready = await Promise.race([once(child.stdout!, 'data'), once(child, 'exit').then(() => { throw new Error('Owned launcher exited before readiness'); })]);
  const helper = JSON.parse(String(ready[0])).helperPid;
  const mismatched = join(directory, 'wrong-incarnation.json');
  writeFileSync(mismatched, JSON.stringify({ ...JSON.parse(readFileSync(owner, 'utf8')), incarnation: 'different process incarnation' }));
  const refusal = spawnSync('python3', [stop, mismatched], { encoding: 'utf8', timeout: 15_000 });
  assert.notEqual(refusal.status, 0);
  assert.match(refusal.stderr, /Owner incarnation mismatch/);
  assert.equal(child.exitCode, null); process.kill(helper, 0);
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  process.kill(helper, 0); // Parent death alone is deliberately insufficient.
  const result = spawnSync('python3', [stop, owner], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.groupStopped, true);
  assert.ok(receipt.before.some((x: { pid: number }) => x.pid === helper));
  assert.equal(receipt.after.some((x: { pid: number; state: string }) => x.pid === helper && !x.state.startsWith('Z')), false);
  assert.equal(foreign.exitCode, null);
  process.kill(foreign.pid!, 0);
});

test('the native shutdown helper refuses a foreign simulator before probing or controlling devices', t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-foreign-device-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preparation = join(directory, 'preparation.json');
  writeFileSync(preparation, JSON.stringify({ ios: { udid: 'FA791D0E-4E55-42EA-ABDB-663D6D85AD5D' } }));
  const helper = fileURLToPath(new URL('../.scratch/appium-mcp-migration/candidate-stack/experiments/stop-owned-device.py', import.meta.url));
  const result = spawnSync('python3', [helper, preparation, 'ios', 'stop'], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refuse foreign device/);
  assert.equal(result.stdout, '');
});

test('a bridge waits for a competing SQLite writer before closing dispatch', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-journal-contention-'));
  call(directory, 'initialize', { runId: 'contended', platform: 'ios', device: 'private-device' });
  const fixture = fileURLToPath(new URL('./fixtures/appium-journal-writer.mjs', import.meta.url));
  // The controlled external writer holds a real SQLite lock. Assertions stay
  // at the bridge's public process boundary; no stored outcome is queried.
  const peer = spawn(process.execPath, [fixture, directory], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  teardown(t, directory, [peer]);
  const ready = await Promise.race([once(peer, 'message'), once(peer, 'exit').then(() => { throw new Error('Writer exited before holding its lock'); })]);
  assert.deepEqual(ready[0], { holding: true });
  call(directory, 'close');
  const recovered = call(directory, 'recover');
  assert.equal(recovered.closed, true);
  assert.equal(recovered.outcome, 'inconclusive');
  assert.equal(recovered.leaseReleased, false);
  assert.ok(recovered.commands.length <= 1);
});

test('a complete automation-only fence settles the command while retaining its inconclusive outcome', t => {
  const directory = mkdtempSync(join(tmpdir(), 'appium-automation-fence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  call(directory, 'initialize', { runId: 'automation-fence', platform: 'ios', device: 'private-device' });
  call(directory, 'authorize', { id: 'tap', tool: 'appium_gesture' }); call(directory, 'close');
  const proof = { device: 'private-device', receiptSha256: 'b'.repeat(64), hostGroupStopped: true, recordedChildrenStopped: true, completeCoverage: true, ownedAutomationInert: true, automationPortsClosed: true };
  assert.deepEqual(call(directory, 'record-automation-fence', { ...proof, completeCoverage: false }), { accepted: false, reason: 'FENCE_UNPROVEN' });
  assert.deepEqual(call(directory, 'record-automation-fence', { ...proof, recordedChildrenStopped: false }), { accepted: false, reason: 'FENCE_UNPROVEN' });
  assert.equal(call(directory, 'inspect').commands[0].disposition, 'uncertain');
  assert.equal(call(directory, 'record-automation-fence', proof).accepted, true);
  const result = call(directory, 'inspect');
  assert.equal(result.commands[0].disposition, 'fenced');
  assert.equal(result.closed, true); assert.equal(result.outcome, 'inconclusive');
  assert.equal(result.leaseReleased, false); assert.equal(result.quarantined, true);
});
