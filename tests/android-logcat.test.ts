import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { writeSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { adbEnvironment } from '../src/device/android/tools.js';
import { deleteOldLogs, LOG_FOLDER, logcatStarter, privateLogFolder, type LogcatChild, type LogcatSpawn } from '../src/device/android/logcat.js';

/**
 * The logcat stream starter's production form, with a fake spawn, a fake process lister and fake time,
 * and the private log folder in a temporary folder. No `adb` runs.
 */

/** A fake `adb logcat` child: it runs until the test ends it or a signal it doesn't ignore arrives. */
class FakeLogcat extends EventEmitter implements LogcatChild {
  readonly stdout = new PassThrough();
  readonly signals: NodeJS.Signals[] = [];
  private ended = false;

  constructor(readonly pid: number | undefined, private readonly ignores: NodeJS.Signals[] = []) { super(); }

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    if (!this.ignores.includes(signal)) this.exit();
    return true;
  }

  exit(): void {
    if (this.ended) return;
    this.ended = true;
    this.stdout.end();
    setImmediate(() => this.emit('close', null, 'SIGTERM'));
  }
}

type Spawned = { file: string; args: readonly string[]; options: Parameters<LogcatSpawn>[2]; child: FakeLogcat };

function fakeSpawn(make: (options: Parameters<LogcatSpawn>[2]) => FakeLogcat = () => new FakeLogcat(4242)) {
  const spawned: Spawned[] = [];
  const spawn: LogcatSpawn = (file, args, options) => {
    const child = make(options);
    spawned.push({ file, args, options, child });
    return child;
  };
  return { spawn, spawned };
}

/** Fake time for the escalation: each sleep is recorded and lets pending exits land first. */
function fakeSleep() {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => { sleeps.push(ms); await new Promise(resolveTurn => setImmediate(resolveTurn)); } };
}

const ENVIRONMENT = { PATH: '/usr/bin', TYPESAFE_API_KEY: 'key-must-not-reach-adb', ANDROID_ADB_SERVER_PORT: '5099' };
const ADB = '/sdk/platform-tools/adb';
const ARGS = ['-s', 'emulator-5554', 'logcat', '-v', 'threadtime,year,uid', '--uid=10226', '-T', '1759075200.123'];

async function withFolder(fn: (folder: string) => Promise<void>): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'jev-android-logcat-'));
  try { await fn(folder); } finally { await rm(folder, { recursive: true, force: true }); }
}

test('a file stream spawns adb directly with the adb environment, its stdout on a new 0600 file', async () => {
  await withFolder(async folder => {
    const path = join(folder, 'run-1.log');
    const { spawn, spawned } = fakeSpawn(options => {
      // The child writes straight to the descriptor it was handed: nothing passes through the bridge.
      writeSync(options.stdio[1] as number, '2026-09-28 23:16:14.927 10226  9784  9784 D JevProbe: debug line\n');
      return new FakeLogcat(4242);
    });
    const starter = logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn });
    const stream = await starter.start(ARGS, path);
    assert.equal(stream.pid, 4242);
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0]!.file, ADB);
    assert.deepEqual(spawned[0]!.args, ARGS);
    assert.equal(spawned[0]!.options.shell, false);
    assert.equal(spawned[0]!.options.stdio[0], 'ignore');
    assert.equal(typeof spawned[0]!.options.stdio[1], 'number');
    assert.equal('TYPESAFE_API_KEY' in spawned[0]!.options.env, false, 'the Jev key never reaches adb');
    assert.equal(spawned[0]!.options.env.ANDROID_ADB_SERVER_PORT, '5099', 'the private adb server is kept');
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
    assert.match(await readFile(path, 'utf8'), /JevProbe: debug line/);
    spawned[0]!.child.exit();
    await stream.exited;
  });
});

test('with the driver\'s adbEnvironment(), a stream has no Jev key and keeps the private adb server', async () => {
  const { spawn, spawned } = fakeSpawn();
  await logcatStarter({ adb: ADB, environment: adbEnvironment(ENVIRONMENT), spawn }).start(ARGS, () => {});
  assert.equal('TYPESAFE_API_KEY' in spawned[0]!.options.env, false);
  assert.equal(spawned[0]!.options.env.ANDROID_ADB_SERVER_PORT, '5099');
  spawned[0]!.child.exit();
});

test('a file stream never writes into a file or link that already exists, and spawns nothing', async () => {
  await withFolder(async folder => {
    const { spawn, spawned } = fakeSpawn();
    const starter = logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn });
    await writeFile(join(folder, 'taken.log'), 'earlier');
    await assert.rejects(starter.start(ARGS, join(folder, 'taken.log')));
    await symlink(join(folder, 'elsewhere.log'), join(folder, 'link.log'));
    await assert.rejects(starter.start(ARGS, join(folder, 'link.log')));
    assert.equal(spawned.length, 0);
    assert.equal(await readFile(join(folder, 'taken.log'), 'utf8'), 'earlier');
    assert.deepEqual((await readdir(folder)).sort(), ['link.log', 'taken.log'], 'the link\'s target was never created');
  });
});

test('a line stream delivers each line, split chunks included, and ends after the last one', async () => {
  const { spawn, spawned } = fakeSpawn();
  const lines: string[] = [];
  const stream = await logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn }).start(['-s', 'emulator-5554', 'logcat', '-b', 'events'], line => { lines.push(line); });
  assert.equal(spawned[0]!.options.stdio[1], 'pipe');
  const child = spawned[0]!.child;
  child.stdout.write('2026-09-28 23:22:52.533  680  700 I am_proc_start: [0,9784,10226,dev.jevbridge.logprobe,');
  child.stdout.write('next-top-activity,{dev.jevbridge.logprobe/dev.jevbridge.logprobe.MainActivity}]\n');
  child.stdout.write('2026-09-28 23:22:55.001  680  700 I am_proc_died: [0,9784,dev.jevbridge.logprobe,0,2]\n');
  child.exit();
  await stream.exited;
  assert.deepEqual(lines, [
    '2026-09-28 23:22:52.533  680  700 I am_proc_start: [0,9784,10226,dev.jevbridge.logprobe,next-top-activity,{dev.jevbridge.logprobe/dev.jevbridge.logprobe.MainActivity}]',
    '2026-09-28 23:22:55.001  680  700 I am_proc_died: [0,9784,dev.jevbridge.logprobe,0,2]',
  ]);
});

test('stop sends SIGTERM and resolves once the stream has exited', async () => {
  const { spawn, spawned } = fakeSpawn();
  const time = fakeSleep();
  const stream = await logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn, sleep: time.sleep }).start(ARGS.slice(0, 3), () => {});
  await stream.stop();
  assert.deepEqual(spawned[0]!.child.signals, ['SIGTERM']);
  await stream.exited;
});

test('stop escalates to SIGKILL after 1 s when SIGTERM is ignored', async () => {
  const { spawn, spawned } = fakeSpawn(() => new FakeLogcat(4242, ['SIGTERM']));
  const time = fakeSleep();
  const stream = await logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn, sleep: time.sleep }).start(ARGS.slice(0, 3), () => {});
  await stream.stop();
  assert.deepEqual(spawned[0]!.child.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(time.sleeps[0], 1_000);
});

test('stop resolves at once for a stream that already exited, and sends nothing', async () => {
  const { spawn, spawned } = fakeSpawn();
  const stream = await logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn }).start(ARGS.slice(0, 3), () => {});
  spawned[0]!.child.exit();
  await stream.exited;
  await stream.stop();
  assert.deepEqual(spawned[0]!.child.signals, []);
});

test('stop rejects when the stream outlives SIGKILL too', async () => {
  const { spawn, spawned } = fakeSpawn(() => new FakeLogcat(4242, ['SIGTERM', 'SIGKILL']));
  const time = fakeSleep();
  const stream = await logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn, sleep: time.sleep }).start(ARGS.slice(0, 3), () => {});
  await assert.rejects(stream.stop(), /did not exit/);
  assert.deepEqual(spawned[0]!.child.signals, ['SIGTERM', 'SIGKILL']);
});

test('a stream that fails to spawn rejects start, and a cancelled start spawns nothing', async () => {
  const { spawn } = fakeSpawn(() => {
    const child = new FakeLogcat(undefined);
    setImmediate(() => child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
    return child;
  });
  const starter = logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn });
  await assert.rejects(starter.start(ARGS, () => {}), /ENOENT/);
  const cancelled = fakeSpawn();
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await assert.rejects(logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn: cancelled.spawn }).start(ARGS, () => {}, controller.signal), /cancelled/);
  assert.equal(cancelled.spawned.length, 0);
});

test('isLeftover is true only for an adb command line that still holds -s <serial> and logcat', async () => {
  const lines = new Map<number, string>([
    [101, '/sdk/platform-tools/adb -s emulator-5554 logcat -v threadtime,year,uid --uid=10226 -T 1759075200.123'],
    [102, '/sdk/platform-tools/adb -s emulator-5556 logcat -b events -v threadtime,year'],
    [103, '/usr/bin/python3 -s emulator-5554 logcat'],
    [104, '/sdk/platform-tools/adb -s emulator-5554 shell ps'],
    [105, 'adb -s emulator-5554 logcat -b events'],
    [106, '/usr/bin/vim /tmp/adb -s emulator-5554 logcat'],
  ]);
  const starter = logcatStarter({ adb: ADB, environment: ENVIRONMENT, commandLine: async pid => lines.get(pid) });
  assert.equal(await starter.isLeftover(101, 'emulator-5554'), true);
  assert.equal(await starter.isLeftover(102, 'emulator-5554'), false, 'another serial\'s stream');
  assert.equal(await starter.isLeftover(103, 'emulator-5554'), false, 'not adb');
  assert.equal(await starter.isLeftover(104, 'emulator-5554'), false, 'adb, but not logcat');
  assert.equal(await starter.isLeftover(105, 'emulator-5554'), true, 'adb found on PATH');
  assert.equal(await starter.isLeftover(106, 'emulator-5554'), false, 'adb only as an argument');
  assert.equal(await starter.isLeftover(107, 'emulator-5554'), false, 'gone');
});

test('isLeftover recognises a leftover of this bridge\'s own adb when its path holds a space', async () => {
  const adb = '/Users/me/Android SDK/platform-tools/adb';
  const starter = logcatStarter({ adb, environment: ENVIRONMENT, commandLine: async () => `${adb} -s emulator-5554 logcat -b events` });
  assert.equal(await starter.isLeftover(101, 'emulator-5554'), true);
  assert.equal(await starter.isLeftover(101, 'emulator-5556'), false);
});

test('a file stream whose adb fails to spawn leaves no file behind', async () => {
  await withFolder(async folder => {
    const { spawn } = fakeSpawn(() => {
      const child = new FakeLogcat(undefined);
      setImmediate(() => child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
      return child;
    });
    await assert.rejects(logcatStarter({ adb: ADB, environment: ENVIRONMENT, spawn }).start(ARGS, join(folder, 'run-1.log')), /ENOENT/);
    assert.deepEqual(await readdir(folder), []);
  });
});

/** A fake Mac process table for `kill`: each pid dies on the signals it doesn't ignore. */
function fakeProcesses(ignores: Record<number, NodeJS.Signals[]>) {
  const running = new Set(Object.keys(ignores).map(Number));
  const sent: string[] = [];
  return {
    sent,
    running,
    sendSignal: (pid: number, signal: NodeJS.Signals) => {
      if (!running.has(pid)) return false;
      sent.push(`${String(pid)} ${signal}`);
      if (!ignores[pid]!.includes(signal)) running.delete(pid);
      return true;
    },
    alive: (pid: number) => running.has(pid),
  };
}

test('kill sends SIGTERM, then SIGKILL after 1 s, and resolves once the pid is gone', async () => {
  const processes = fakeProcesses({ 201: [], 202: ['SIGTERM'] });
  const time = fakeSleep();
  const starter = logcatStarter({ adb: ADB, environment: ENVIRONMENT, sendSignal: processes.sendSignal, alive: processes.alive, sleep: time.sleep });
  await starter.kill(201);
  await starter.kill(202);
  await starter.kill(203);
  assert.deepEqual(processes.sent, ['201 SIGTERM', '202 SIGTERM', '202 SIGKILL']);
  assert.equal(time.sleeps.reduce((total, ms) => total + ms, 0) >= 1_000, true, 'SIGKILL only after 1 s');
  assert.deepEqual([...processes.running], []);
});

test('kill rejects when the pid outlives SIGKILL', async () => {
  const processes = fakeProcesses({ 301: ['SIGTERM', 'SIGKILL'] });
  const starter = logcatStarter({ adb: ADB, environment: ENVIRONMENT, sendSignal: processes.sendSignal, alive: processes.alive, sleep: fakeSleep().sleep });
  await assert.rejects(starter.kill(301), /did not exit/);
});

test('the log folder is jev-android-logs/ under the OS temp folder', () => {
  assert.equal(LOG_FOLDER, join(tmpdir(), 'jev-android-logs'));
});

test('the log folder is created 0700, and an existing one of this user\'s is used', async () => {
  await withFolder(async parent => {
    const folder = join(parent, 'jev-android-logs');
    assert.equal(await privateLogFolder(folder), folder);
    assert.equal((await lstat(folder)).mode & 0o777, 0o700);
    assert.equal(await privateLogFolder(folder), folder);
  });
});

test('a log folder that is a symlink, not a directory, or another user\'s is refused', async () => {
  await withFolder(async parent => {
    await mkdir(join(parent, 'real'), { mode: 0o700 });
    await symlink(join(parent, 'real'), join(parent, 'link'));
    assert.equal(await privateLogFolder(join(parent, 'link')), undefined);
    await writeFile(join(parent, 'file'), '');
    assert.equal(await privateLogFolder(join(parent, 'file')), undefined);
    assert.equal(await privateLogFolder(join(parent, 'real'), { uid: (process.getuid?.() ?? 0) + 1 }), undefined);
  });
});

test('files older than 3 days are deleted; newer files, live files and folders are kept', async () => {
  await withFolder(async folder => {
    const now = Date.now();
    const days = (count: number) => new Date(now - count * 24 * 60 * 60 * 1_000);
    for (const [name, age] of [['old.log', days(3.1)], ['recent.log', days(2.9)], ['live.log', days(0)]] as const) {
      await writeFile(join(folder, name), '');
      await utimes(join(folder, name), age, age);
    }
    await mkdir(join(folder, 'old-folder'));
    await utimes(join(folder, 'old-folder'), days(10), days(10));
    await deleteOldLogs(folder, now);
    assert.deepEqual((await readdir(folder)).sort(), ['live.log', 'old-folder', 'recent.log']);
  });
});

test('a failed clean-up never throws', async () => {
  await deleteOldLogs(join(tmpdir(), 'jev-android-logs-that-does-not-exist'));
});
