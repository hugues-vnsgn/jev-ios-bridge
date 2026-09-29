import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DeviceLease, DeviceLeaseBusyError, DeviceLeaseKeptError } from '../src/device/lease.js';

const deviceId = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid!;

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-lease-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('take holds the device in <ID>.lock, keyed by the device identity, and release gives it back', async () => {
  await withRoot(async (root) => {
    const lease = new DeviceLease({ root });
    assert.equal(await lease.take(deviceId.toLowerCase()), undefined, 'no earlier holder to hand over');
    assert.equal(lease.held, true);
    assert.deepEqual(await readdir(root), [`${deviceId}.lock`]);
    await assert.rejects(new DeviceLease({ root }).take(deviceId), DeviceLeaseBusyError);
    await lease.release();
    assert.equal(lease.held, false);
    assert.deepEqual(await readdir(root), []);
    await new DeviceLease({ root }).take(deviceId);
  });
});

test('the lease file keeps the fields a 1.1 bridge reads: its process as pid, plus the run and what it owns', async () => {
  await withRoot(async (root) => {
    const lease = new DeviceLease({ root, processId: 4242 });
    await lease.take(deviceId, { runId: 'run-7' });
    const written = JSON.parse(await readFile(join(root, `${deviceId}.lock`), 'utf8')) as Record<string, unknown>;
    assert.equal(written.pid, 4242);
    assert.equal(typeof written.token, 'string');
    assert.equal(written.deviceId, deviceId);
    assert.equal(written.runId, 'run-7');
    assert.equal(written.ownedProcesses, undefined, 'nothing owned: the file carries no list');
  });
});

test('a live holder, including a 1.1 bridge, makes the device busy with the 1.1 wording', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    await writeFile(path, JSON.stringify({ pid: process.pid, token: 'v1.1', deviceId, createdAt: '2026-09-26T00:00:00.000Z' }));
    await assert.rejects(new DeviceLease({ root }).take(deviceId), (error: unknown) => error instanceof DeviceLeaseBusyError &&
      error.message === `Device ${deviceId} is locked by bridge process ${process.pid} (lock file ${path}). ` +
        'Wait for that run to finish, or stop that process; the next run then clears the lock.');
    await writeFile(path, 'not json');
    await assert.rejects(new DeviceLease({ root }).take(deviceId), (error: unknown) => error instanceof DeviceLeaseBusyError &&
      error.message.startsWith(`Device ${deviceId} is locked by another bridge process (lock file ${path}).`),
      'an unknown owner is never assumed dead');
  });
});

test('a dead holder loses the lease to the next run, which gets the dead holder\'s record to sweep', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const pid = deadPid();
    await writeFile(path, JSON.stringify({ pid, token: 'old', deviceId, runId: 'crashed-run', ownedProcesses: ['agent:1234', 'forward:9008'] }));
    const lease = new DeviceLease({ root });
    assert.deepEqual(await lease.take(deviceId), { runId: 'crashed-run', processId: pid, ownedProcesses: ['agent:1234', 'forward:9008'] });
    assert.equal((JSON.parse(await readFile(path, 'utf8')) as { pid: number }).pid, process.pid);

    await lease.release();
    const legacyPid = deadPid();
    await writeFile(path, JSON.stringify({ pid: legacyPid, token: 'v1.1', deviceId, createdAt: '2026-09-26T00:00:00.000Z' }));
    assert.deepEqual(await new DeviceLease({ root }).take(deviceId), { processId: legacyPid, ownedProcesses: [] },
      'a crashed 1.1 bridge started nothing the lease tracked');
  });
});

test('a command in flight or with an unknown outcome keeps the lease; one that exited does not', async () => {
  await withRoot(async (root) => {
    const lease = new DeviceLease({ root });
    await lease.take(deviceId);
    const done = lease.command('ui');
    const lost = lease.command('ui');
    assert.equal(done.state, 'in flight');
    assert.equal(lease.releasable, false);
    done.exited();
    assert.equal(done.state, 'exited');
    lost.unknown();
    assert.equal(lost.state, 'unknown');
    assert.equal(lease.releasable, false);
    await assert.rejects(lease.release(), DeviceLeaseKeptError);
    assert.equal(lease.held, true);
    assert.deepEqual(await readdir(root), [`${deviceId}.lock`], 'kept: the lost command might still act on the device');
  });
});

test('the fence hook fences every unknown command of one kind, which frees the lease', async () => {
  await withRoot(async (root) => {
    const lease = new DeviceLease({ root });
    await lease.take(deviceId);
    const agentCall = lease.command('agent');
    const adbCall = lease.command('adb');
    const running = lease.command('agent');
    agentCall.unknown();
    adbCall.unknown();
    lease.fence('agent');
    assert.equal(agentCall.state, 'fenced');
    assert.equal(adbCall.state, 'unknown', 'fencing one kind leaves the others');
    assert.equal(running.state, 'in flight', 'only commands with an unknown outcome are fenced');
    adbCall.exited();
    running.exited();
    assert.equal(lease.releasable, true);
    await lease.release();
    assert.deepEqual(await readdir(root), []);
  });
});

test('what the run owns is recorded in the lease file as it starts, and keeps the lease until it stops', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const lease = new DeviceLease({ root });
    await lease.take(deviceId);
    await lease.own('agent:5555');
    assert.deepEqual((JSON.parse(await readFile(path, 'utf8')) as { ownedProcesses: string[] }).ownedProcesses, ['agent:5555']);
    assert.equal(lease.releasable, false);
    await lease.disown('agent:5555');
    assert.equal(lease.releasable, true);
    await lease.release();
  });
});

test('late release: once every operation the run started settles, the kept lease is finished off', async () => {
  await withRoot(async (root) => {
    const lease = new DeviceLease({ root });
    let acknowledge!: () => void;
    const operation = lease.track(() => new Promise<void>(resolve => { acknowledge = resolve; }));
    await lease.take(deviceId);
    assert.equal(lease.operationsInFlight, true);
    let finished!: () => void;
    const lateFinish = new Promise<void>(resolve => { finished = resolve; });
    lease.releaseLate(async () => { await lease.release(); finished(); });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(await readdir(root), [`${deviceId}.lock`], 'kept while the operation is in flight');
    acknowledge();
    await operation;
    await lateFinish;
    assert.equal(lease.operationsInFlight, false);
    assert.deepEqual(await readdir(root), []);
  });
});

test('releasing a lease this run no longer holds leaves the new holder\'s file alone', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const lease = new DeviceLease({ root });
    await lease.take(deviceId);
    await writeFile(path, JSON.stringify({ pid: process.pid, token: 'someone-else', deviceId }));
    await lease.release();
    assert.equal((JSON.parse(await readFile(path, 'utf8')) as { token: string }).token, 'someone-else');
  });
});
