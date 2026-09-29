import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
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
    const done = lease.command('mobilebuildmcp');
    assert.equal(lease.releasable, false, 'in flight');
    done.exited();
    assert.equal(lease.releasable, true, 'exited');
    const lost = lease.command('mobilebuildmcp');
    lost.unknown();
    assert.equal(lease.releasable, false, 'unknown');
    await assert.rejects(lease.release(), DeviceLeaseKeptError);
    assert.equal(lease.held, true);
    assert.deepEqual(await readdir(root), [`${deviceId}.lock`], 'kept: the lost command might still act on the device');
  });
});

test('the fence hook fences the unknown commands of its kind, which frees the lease, but not those still in flight', async () => {
  await withRoot(async (root) => {
    const lease = new DeviceLease({ root });
    await lease.take(deviceId);
    const lost = lease.command('mobilebuildmcp');
    const running = lease.command('mobilebuildmcp');
    lost.unknown();
    lease.fence('mobilebuildmcp');
    assert.equal(lease.releasable, false, 'a command in flight is not fenced');
    running.exited();
    assert.equal(lease.releasable, true, 'the fenced command can no longer act on the device');
    lost.exited();
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
    let finished!: () => void;
    const lateFinish = new Promise<void>(resolve => { finished = resolve; });
    lease.releaseLate(async () => { await lease.release(); finished(); });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(await readdir(root), [`${deviceId}.lock`], 'kept while the operation is in flight');
    acknowledge();
    await operation;
    await lateFinish;
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

test('rewrite writes via a private temp file: an interrupted write leaves the lease file holding its previous complete record, and cleans up the temp file', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const injectedWriter = async (tempPath: string, data: string) => {
      await writeFile(tempPath, data, { mode: 0o600 });
      throw new Error('interrupted after the temp file was created');
    };
    const lease = new DeviceLease({ root, writeTempFile: injectedWriter });
    await lease.take(deviceId, { runId: 'run-9' });
    const before = await readFile(path, 'utf8');

    await assert.rejects(lease.own('agent:5555'), /interrupted after the temp file was created/);

    assert.equal(await readFile(path, 'utf8'), before, 'the lease file still holds the previous complete record, never emptied');
    assert.deepEqual(await readdir(root), [`${deviceId}.lock`], 'the temp file was cleaned up after the failed write');
  });
});

test('after an interrupted rewrite, a dead holder\'s lease can still be taken over', async () => {
  await withRoot(async (root) => {
    const injectedWriter = async (tempPath: string, data: string) => {
      await writeFile(tempPath, data, { mode: 0o600 });
      throw new Error('interrupted after the temp file was created');
    };
    const pid = deadPid();
    const lease = new DeviceLease({ root, processId: pid, writeTempFile: injectedWriter });
    await lease.take(deviceId, { runId: 'crashed-run' });
    await assert.rejects(lease.own('agent:5555'), /interrupted after the temp file was created/);

    const takenOver = await new DeviceLease({ root }).take(deviceId);
    assert.deepEqual(takenOver, { runId: 'crashed-run', processId: pid, ownedProcesses: [] },
      'the pre-interruption record is still intact and readable');
  });
});

test('rewrite\'s temp file lives in the lease root and its name never ends in .lock, so a 1.1 bridge, which only opens <ID>.lock, ignores it', async () => {
  await withRoot(async (root) => {
    let seenPath: string | undefined;
    const capturingWriter = async (tempPath: string, data: string) => {
      seenPath = tempPath;
      await writeFile(tempPath, data, { mode: 0o600 });
    };
    const lease = new DeviceLease({ root, writeTempFile: capturingWriter });
    await lease.take(deviceId);
    await lease.own('agent:5555');

    assert.equal(seenPath !== undefined && seenPath.startsWith(`${root}/`), true, 'temp file is in the lease root');
    assert.equal(seenPath!.endsWith('.lock'), false, 'temp file name never ends in .lock');
  });
});

test('rewrite writes the temp file mode 0600', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const lease = new DeviceLease({ root });
    await lease.take(deviceId);
    await lease.own('agent:5555');
    assert.equal((await stat(path)).mode & 0o777, 0o600, 'the renamed file keeps the temp file\'s mode');
  });
});

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

test('own() and disown() calls on one lease serialize their writes, so concurrent updates can\'t interleave', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const starts = [deferred<void>(), deferred<void>()];
    const releases = [deferred<void>(), deferred<void>()];
    let callIndex = 0;
    const writer = async (tempPath: string, data: string) => {
      const index = callIndex++;
      starts[index]!.resolve();
      await releases[index]!.promise;
      await writeFile(tempPath, data, { mode: 0o600 });
    };
    const lease = new DeviceLease({ root, writeTempFile: writer });
    await lease.take(deviceId);

    const first = lease.own('agent:1111');
    const second = lease.own('agent:2222');

    await starts[0]!.promise;
    assert.equal(callIndex, 1, 'the second write has not started until the first one finishes');
    releases[0]!.resolve();

    await starts[1]!.promise;
    assert.equal(callIndex, 2, 'the second write starts only once the first has settled');
    releases[1]!.resolve();

    await Promise.all([first, second]);

    const written = JSON.parse(await readFile(path, 'utf8')) as { ownedProcesses: string[] };
    assert.deepEqual([...written.ownedProcesses].sort(), ['agent:1111', 'agent:2222']);
  });
});

test('release waits for a write already in flight, so a pending rename can\'t restore the file release just deleted', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const heldWrite = deferred<void>();
    let calls = 0;
    const writer = async (tempPath: string, data: string) => {
      calls++;
      if (calls === 2) await heldWrite.promise; // hold the disown()'s write open
      await writeFile(tempPath, data, { mode: 0o600 });
    };
    const lease = new DeviceLease({ root, writeTempFile: writer });
    await lease.take(deviceId);
    await lease.own('agent:5555'); // call 1, completes normally

    const disowning = lease.disown('agent:5555'); // call 2, held open by heldWrite
    assert.equal(lease.releasable, true, 'owned is already empty even though the write has not landed yet');

    const releasing = lease.release();
    heldWrite.resolve(); // let the pending disown write, and its rename, finish
    await disowning;
    await releasing;

    assert.deepEqual(await readdir(root), [], 'the lease file is gone once release actually completes');
    await new DeviceLease({ root }).take(deviceId);
  });
});

test('release rechecks releasable once its own turn comes: an own() that arrives after release is queued loses to it and fails "not held", instead of putting the file back', async () => {
  await withRoot(async (root) => {
    const path = join(root, `${deviceId}.lock`);
    const heldWrite = deferred<void>();
    let calls = 0;
    const writer = async (tempPath: string, data: string) => {
      calls++;
      if (calls === 2) await heldWrite.promise; // hold the disown()'s write open
      await writeFile(tempPath, data, { mode: 0o600 });
    };
    const lease = new DeviceLease({ root, writeTempFile: writer });
    await lease.take(deviceId);
    await lease.own('agent:5555'); // call 1, completes normally

    const disowning = lease.disown('agent:5555'); // call 2, held open by heldWrite
    const releasing = lease.release(); // queued right behind the held disown write

    const owning = lease.own('agent:7777'); // arrives after release is already queued

    heldWrite.resolve(); // let the disown write, then release's check and delete, then own's run in turn
    await assert.rejects(owning, /Device lease is not held/, 'too late: it lost the race to release');
    await disowning;
    await releasing;

    assert.deepEqual(await readdir(root), [], 'release deleted the file; the late own() never put it back');
    await new DeviceLease({ root }).take(deviceId);
  });
});

test('settle waits for every tracked operation, including one started meanwhile, and gives up when its signal aborts', async () => {
  await withRoot(async (root) => {
    const lease = new DeviceLease({ root });
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    let second: Promise<void> | undefined;
    void lease.track(() => new Promise<void>(resolve => { finishFirst = () => { second = lease.track(() => new Promise<void>(done => { finishSecond = done; })); resolve(); }; }));
    await new Promise(resolve => setTimeout(resolve, 0));
    const stop = new AbortController();
    const abandoned = lease.settle(stop.signal);
    stop.abort(new Error('cleanup deadline'));
    await assert.rejects(abandoned, /cleanup deadline/);

    let settled = false;
    const waiting = lease.settle(new AbortController().signal).then(() => { settled = true; });
    finishFirst();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(settled, false, 'the operation started meanwhile is still in flight');
    finishSecond();
    await second;
    await waiting;
    assert.equal(settled, true);
  });
});

