import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostFenceIo } from '../src/appium/fence/host.js';
import { hostIdentitySchema } from '../src/appium/fence/schema.js';

const signal = new AbortController().signal;
const marker = '0123456789abcdef0123456789abcdef';
const chain = Buffer.from(JSON.stringify([{ pid: 100, incarnation: 'Fri Oct 23 10:00:00 2026' }])).toString('base64url');

test('the host sampler records PID/start/group and inherited ancestry without persisting process environments', async () => {
  const calls: unknown[] = [];
  const io = hostFenceIo({ controllerPid: 900, run: async (args, abort) => {
    assert.equal(abort, signal); calls.push(args);
    return { exitCode: 0, stderr: '', stdout: `1 0 1 Ss Fri Oct 23 09:00:00 2026 /sbin/launchd\n100 1 100 S Fri Oct 23 10:00:00 2026 /node private.js HOME=/private TYPESAFE_API_KEY=fake-not-a-key JEV_PHASE1_RUN_MARKER=${marker} JEV_PHASE1_ANCESTRY=${chain}\n101 1 101 Z Fri Oct 23 10:00:01 2026 /driver\n` };
  }, kill: () => { throw new Error('Read-only inventory'); } });
  assert.deepEqual(await io.inventory(signal), [
    { pid: 100, startTime: 'Fri Oct 23 10:00:00 2026', ppid: 1, pgid: 100, state: 'running', executable: '/node', runMarker: marker, launchChain: [{ pid: 100, startTime: 'Fri Oct 23 10:00:00 2026' }] },
    { pid: 101, startTime: 'Fri Oct 23 10:00:01 2026', ppid: 1, pgid: 101, state: 'zombie', executable: '/driver' },
  ]);
  assert.deepEqual(calls, [['-Eww', '-axo', 'pid=,ppid=,pgid=,stat=,lstart=,command=']]);
});

test('the host signal adapter addresses only the supplied group or matched PID and refuses its controller group', async () => {
  const calls: unknown[] = [];
  const io = hostFenceIo({ controllerPid: 900, run: async args => {
    calls.push(args); return { exitCode: 0, stdout: '900\n', stderr: '' };
  }, kill: (pid, signal) => { calls.push({ pid, signal }); } });
  await io.signalGroup(100, 'SIGTERM', signal);
  await io.signalProcess(hostIdentitySchema.parse({ pid: 101, startTime: 'one' }), 'SIGKILL', signal);
  await assert.rejects(() => io.signalGroup(900, 'SIGKILL', signal), /controller/i);
  assert.deepEqual(calls, [
    ['-p', '900', '-o', 'pgid='], { pid: -100, signal: 'SIGTERM' }, { pid: 101, signal: 'SIGKILL' }, ['-p', '900', '-o', 'pgid='],
  ]);
});

for (const stdout of ['unparseable row\n', `100 1 100 S Fri Oct 23 10:00:00 2026 /node JEV_PHASE1_RUN_MARKER=${marker} JEV_PHASE1_ANCESTRY=not-json\n`, '']) test(`incomplete host inventory refuses ${JSON.stringify(stdout.slice(0, 20))}`, async () => {
  const io = hostFenceIo({ run: async () => ({ exitCode: 0, stderr: '', stdout }), kill: () => {} });
  await assert.rejects(() => io.inventory(signal), /inventory|ancestry/i);
});

test('a native host query that returns after cancellation cannot publish an inventory', async () => {
  const controller = new AbortController();
  const io = hostFenceIo({ run: async () => { controller.abort(new Error('budget expired')); return { exitCode: 0, stderr: '', stdout: '100 1 100 S Fri Oct 23 10:00:00 2026 /node\n' }; }, kill: () => {} });
  await assert.rejects(() => io.inventory(controller.signal), /budget/);
});

test('the host sampler identifies shared services without retaining daemon arguments', async () => {
  const io = hostFenceIo({ run: async () => ({ exitCode: 0, stderr: '', stdout: '500 1 500 S Fri Oct 23 10:00:00 2026 /usr/bin/adb -L tcp:5037 fork-server server --reply-fd 4\n' }), kill: () => {} });
  assert.deepEqual(await io.inventory(signal), [{ pid: 500, startTime: 'Fri Oct 23 10:00:00 2026', ppid: 1, pgid: 500, state: 'running', executable: '/usr/bin/adb', sharedService: true }]);
});
