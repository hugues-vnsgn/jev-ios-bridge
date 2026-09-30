import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createExitWatch, type AppExitWatch } from '../src/device/android/exit-watch.js';

const captures = join(import.meta.dirname, 'fixtures/android/logcat');
/** The captures' device clock ran at UTC+07:00. */
const UTC_OFFSET = 420;
/** 2026-09-28 23:00:00.000 on the device, before every captured line. */
const BEFORE_CAPTURES = Date.UTC(2026, 8, 28, 16, 0, 0) / 1000;

function capture(run: string) {
  const meta = readFileSync(join(captures, run, 'meta.txt'), 'utf8');
  const restart = meta.match(/^restart pid=(\d+)/m);
  return {
    package: run.startsWith('twin-') ? 'dev.jevbridge.diagnostic' : 'dev.jevbridge.logprobe',
    pid: Number(meta.match(/^(?:t0=\d+ )?pid=(\d+)/)![1]),
    restartPid: restart ? Number(restart[1]) : undefined,
    events: readFileSync(join(captures, run, 'events.log'), 'utf8').split('\n').filter(line => line !== ''),
    appLog: readFileSync(join(captures, run, 'uid.log'), 'utf8').split('\n').filter(line => line !== ''),
  };
}

function watch(run: string, startTime = BEFORE_CAPTURES): AppExitWatch {
  return createExitWatch({ package: capture(run).package, startTime, utcOffsetMinutes: UTC_OFFSET });
}

/** The run as the driver would see it: launched with the pid `pidof` found, then every events line. */
function replay(run: string, pid?: number): AppExitWatch {
  const recorded = capture(run);
  const watcher = watch(run);
  watcher.launched(pid ?? recorded.pid);
  for (const line of recorded.events) watcher.feed(line);
  return watcher;
}

const exited = (note: string) => ({ code: 'APP_EXITED', note });

test('the watcher sorts every captured run as the prototype did', () => {
  const expected: Record<string, { running: boolean; problem: unknown }> = {
    'twin-normal': { running: true, problem: undefined },
    'twin-home': { running: true, problem: undefined },
    'probe-finish': { running: true, problem: undefined },
    'twin-amcrash': { running: false, problem: exited('crashed: CrashedByAdbException at ActivityThread.java:2513') },
    'probe-crash': { running: false, problem: exited('crashed: IllegalStateException at MainActivity.java:59') },
    'probe-bgcrash': { running: false, problem: exited('crashed: IllegalStateException at MainActivity.java:61') },
    'twin-segv': { running: false, problem: exited('native crash: SIGSEGV') },
    'probe-native': { running: false, problem: exited('native crash: SIGSEGV') },
    'twin-kill9': { running: false, problem: exited('exited') },
    'probe-exit': { running: false, problem: exited('exited') },
    'twin-forcestop': { running: false, problem: exited('force-stopped by another process') },
    'probe-anr': { running: true, problem: { code: 'APP_NOT_RESPONDING', note: 'not responding' } },
  };
  for (const [run, { running, problem }] of Object.entries(expected)) {
    const watcher = replay(run);
    assert.deepEqual({ running: watcher.running(), problem: watcher.problem() }, { running, problem }, run);
  }
});

test('probe-normal restarted the app: the new pid is running, and the old one\'s force-stop was the restart\'s', () => {
  const watcher = replay('probe-normal', capture('probe-normal').restartPid);
  assert.equal(watcher.running(), true);
  assert.equal(watcher.problem(), undefined);
});

test('a stale native crash for the package, stamped before the start time, is ignored', () => {
  const { pid, events } = capture('twin-normal');
  const startTime = Date.UTC(2026, 8, 28, 16, 22, 40, 900) / 1000; // 23:22:40.900 on the device, just before the launch
  const watcher = watch('twin-normal', startTime);
  watcher.feed('2026-09-28 23:22:40.899   680 15495 I am_crash: [680,0,dev.jevbridge.diagnostic,547995206,Native crash,Segmentation fault,unknown,0,0]');
  watcher.feed('2026-09-27 09:12:03.000   680 15495 I am_crash: [680,0,dev.jevbridge.diagnostic,547995206,Native crash,Segmentation fault,unknown,0,0]');
  watcher.launched(pid);
  for (const line of events) watcher.feed(line);
  assert.equal(watcher.running(), true);
  assert.equal(watcher.problem(), undefined);
  watcher.feed('2026-09-28 23:22:40.900   680 15495 I am_crash: [680,0,dev.jevbridge.diagnostic,547995206,Native crash,Segmentation fault,unknown,0,0]');
  assert.deepEqual(watcher.problem(), exited('native crash: SIGSEGV'));
});

test('the device\'s UTC offset places a line against the start time', () => {
  const line = '2026-09-28 23:22:54.803   680  1107 I am_crash: [15149,0,dev.jevbridge.diagnostic,547995206,java.lang.RuntimeException,boom,Main.kt,3,0]';
  const at = Date.UTC(2026, 8, 28, 16, 22, 54, 803) / 1000;
  const onTime = createExitWatch({ package: 'dev.jevbridge.diagnostic', startTime: at, utcOffsetMinutes: UTC_OFFSET });
  onTime.launched(15149);
  onTime.feed(line);
  assert.deepEqual(onTime.problem(), exited('crashed: RuntimeException at Main.kt:3'));
  const east = createExitWatch({ package: 'dev.jevbridge.diagnostic', startTime: at, utcOffsetMinutes: 480 });
  east.launched(15149);
  east.feed(line);
  assert.equal(east.problem(), undefined, 'read at UTC+08:00, the line is an hour before the start time');
});

test('a line whose time doesn\'t parse is ignored', () => {
  const watcher = createExitWatch({ package: 'dev.jevbridge.logprobe', startTime: BEFORE_CAPTURES, utcOffsetMinutes: UTC_OFFSET });
  watcher.launched(11064);
  watcher.feed('I am_proc_died: [0,11064,dev.jevbridge.logprobe,0,2]');
  watcher.feed('2026-09-28 25:17:41.866  1000   680   721 I am_proc_died: [0,11064,dev.jevbridge.logprobe,0,2]');
  watcher.feed('2026-02-30 23:17:41.866  1000   680   721 I am_proc_died: [0,11064,dev.jevbridge.logprobe,0,2]');
  assert.equal(watcher.running(), true);
  assert.equal(watcher.problem(), undefined);
});

test('the bridge\'s own stop, a stop am_kill or am_proc_died after expectStop(), gives no problem', () => {
  const forceStop = watch('probe-normal');
  forceStop.launched(capture('probe-normal').pid);
  forceStop.expectStop();
  for (const line of capture('probe-normal').events) forceStop.feed(line);
  assert.equal(forceStop.running(), false);
  assert.equal(forceStop.problem(), undefined);

  const died = watch('twin-kill9');
  died.launched(capture('twin-kill9').pid);
  died.expectStop();
  for (const line of capture('twin-kill9').events) died.feed(line);
  assert.equal(died.running(), false);
  assert.equal(died.problem(), undefined);
});

test('a crash seen before expectStop() still counts', () => {
  const { pid, events } = capture('probe-crash');
  const watcher = watch('probe-crash');
  watcher.launched(pid);
  const crash = events.findIndex(line => line.includes('am_crash'));
  for (const line of events.slice(0, crash + 1)) watcher.feed(line);
  watcher.expectStop();
  for (const line of events.slice(crash + 1)) watcher.feed(line);
  assert.deepEqual(watcher.problem(), exited('crashed: IllegalStateException at MainActivity.java:59'));
});

test('a freeze seen before expectStop() still counts after the bridge\'s own stop', () => {
  const watcher = replay('probe-anr');
  watcher.expectStop();
  watcher.feed('2026-09-28 23:19:02.000  1000   680   923 I am_kill : [0,11656,dev.jevbridge.logprobe,0,stop dev.jevbridge.logprobe due to from pid 12001,131212]');
  assert.equal(watcher.running(), false);
  assert.deepEqual(watcher.problem(), { code: 'APP_NOT_RESPONDING', note: 'not responding' });
});

test('an event for the launched pid matches by pid, as the prototype does, whatever process name it carries', () => {
  const watcher = createExitWatch({ package: 'dev.jevbridge.logprobe', startTime: BEFORE_CAPTURES, utcOffsetMinutes: UTC_OFFSET });
  watcher.launched(11064);
  watcher.feed('2026-09-28 23:17:41.866  1000   680   721 I am_proc_died: [0,11064,dev.jevbridge.logprobe:main,0,2]');
  assert.deepEqual(watcher.problem(), exited('exited'));
});

test('a freeze with a later exit is an exit', () => {
  const watcher = replay('probe-anr');
  watcher.feed('2026-09-28 23:19:02.000  1000   680   721 I am_proc_died: [0,11656,dev.jevbridge.logprobe,0,2]');
  assert.equal(watcher.running(), false);
  assert.deepEqual(watcher.problem(), exited('exited'));
});

test('an am_kill for another reason is a kill', () => {
  const watcher = createExitWatch({ package: 'dev.jevbridge.diagnostic', startTime: BEFORE_CAPTURES, utcOffsetMinutes: UTC_OFFSET });
  watcher.launched(15898);
  watcher.feed('2026-09-28 23:23:20.386   680   784 I am_kill : [0,15898,dev.jevbridge.diagnostic,900,excessive cpu, 12000 during 30000,172000]');
  assert.equal(watcher.running(), false);
  assert.deepEqual(watcher.problem(), exited('killed'));
});

test('can\'t tell before launched, after launched(undefined), or once the stream ended with nothing seen', () => {
  const before = watch('twin-amcrash');
  for (const line of capture('twin-amcrash').events) before.feed(line);
  assert.equal(before.running(), undefined);
  assert.equal(before.problem(), undefined);

  const none = watch('twin-amcrash');
  none.launched(undefined);
  for (const line of capture('twin-amcrash').events) none.feed(line);
  assert.equal(none.running(), undefined);
  assert.equal(none.problem(), undefined);

  const ended = replay('twin-normal');
  ended.streamEnded();
  assert.equal(ended.running(), undefined);
  assert.equal(ended.problem(), undefined);
  ended.feed('2026-09-28 23:22:44.000   680  1794 I am_proc_died: [0,14688,dev.jevbridge.diagnostic,0,2]');
  assert.equal(ended.problem(), undefined, 'a line after the stream ended is ignored');

  const crashed = replay('twin-amcrash');
  crashed.streamEnded();
  assert.equal(crashed.running(), false);
  assert.equal(crashed.problem()?.code, 'APP_EXITED');
});

test('a native crash matched by package counts before launched', () => {
  const watcher = watch('twin-segv');
  for (const line of capture('twin-segv').events) watcher.feed(line);
  assert.equal(watcher.running(), false);
  assert.deepEqual(watcher.problem(), exited('native crash: SIGSEGV'));
});

test('a crash fed before launched() counts once the pid is known', () => {
  const { pid, events } = capture('probe-bgcrash');
  const watcher = watch('probe-bgcrash');
  for (const line of events) watcher.feed(line);
  watcher.launched(pid);
  assert.deepEqual(watcher.problem(), exited('crashed: IllegalStateException at MainActivity.java:61'));
});

test('notes come from the event\'s own fields, never from the app log', () => {
  const notes = ['twin-amcrash', 'probe-crash', 'probe-bgcrash', 'twin-segv', 'probe-native', 'twin-kill9', 'probe-exit', 'twin-forcestop', 'probe-anr']
    .map(run => ({ run, note: replay(run).problem()!.note }));
  for (const { run, note } of notes) {
    assert.match(note, /^[^\n]{1,80}$/, run);
    for (const line of capture(run).appLog) {
      const message = line.match(/: (.+)$/)?.[1]?.trim();
      if (message && message.length > 8) assert.ok(!note.includes(message), `${run}: "${note}" holds an app log line`);
    }
  }
  const watcher = createExitWatch({ package: 'dev.example', startTime: BEFORE_CAPTURES, utcOffsetMinutes: UTC_OFFSET });
  watcher.launched(4242);
  watcher.feed('2026-09-28 23:30:00.000   680  1107 I am_crash: [4242,0,dev.example,1,java.lang.IllegalArgumentException,bad token hunter2, try again,Login.kt,17,0]');
  assert.deepEqual(watcher.problem(), exited('crashed: IllegalArgumentException at Login.kt:17'));
});
