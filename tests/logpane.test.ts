import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appLine, masker, osLine } from '../src/logpane/format.js';
import { startLogStream } from '../src/logpane/stream.js';
import { attachLogPane } from '../src/logpane/attach.js';
import { paneWindowBlocked } from '../src/logpane/window.js';
import { Capture } from './fixtures/capture.js';

test('app lines keep the NSLog time without its prefix; error words turn red', () => {
  assert.deepEqual(appLine('2026-09-25 16:42:17.603 cmp[66994:3743334] MODALPERF === RUN START ==='),
    { source: 'app', time: '16:42:17.603', text: 'MODALPERF === RUN START ===', level: 'normal' });
  assert.equal(appLine('Fatal error: index out of range')?.level, 'error');
  assert.equal(appLine('   '), undefined);
});

test('system log lines keep type and category, and log stream chatter is dropped', () => {
  const line = osLine('2026-09-25 16:42:18.112233+0700 0x1a2b3c  Error       0x0    66994  0    cmp: (Network) [com.example:net] request failed');
  assert.deepEqual(line, { source: 'os', time: '16:42:18.112', text: '[com.example:net] request failed', level: 'error' });
  assert.equal(osLine('Filtering the log data using "subsystem == \\"com.example\\""'), undefined);
  assert.equal(osLine('Timestamp                       Thread     Type        Activity             PID    TTL'), undefined);
  assert.equal(osLine('getpwuid_r did not find a match for uid 501'), undefined);
});

test('script values are masked, longest first', () => {
  const mask = masker({ card: '4111 1111', short: '4111', empty: '' });
  assert.equal(mask('paid with 4111 1111 then 4111'), 'paid with [value:card] then [value:short]');
});

test('a pane attached to a live run shows masked app and system lines, then the verdict, and closes after a pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-pane-'));
  const runtime = join(root, 'app.log');
  const os = join(root, 'os.log');
  await writeFile(runtime, '');
  await writeFile(os, '');
  const runId = `pane-${process.pid}-${Date.now()}`;
  const stream = await startLogStream({ runId, app: { bundleId: 'com.example.app' }, sources: { runtime, os },
    values: { secret: 'hunter2' }, pollMs: 20 });
  try {
    const output = new Capture() as unknown as NodeJS.WriteStream;
    const attached = attachLogPane(runId, output, { keepOpen: false });
    await appendFile(runtime, 'login with hunter2 done\n');
    await appendFile(os, '2026-09-25 16:42:18.112233+0700 0x1  Default     0x0    1  0    app: (Lib) [com.example.app:ui] screen shown\n');
    await new Promise(done => setTimeout(done, 150));
    await stream.finish({ verdict: 'passed', reason: 'ALL_CHECKPOINTS_PASSED', evidencePath: root, closeAfterMs: 10 });
    assert.equal(await attached, true);
    const text = (output as unknown as Capture).text;
    assert.match(text, /jev-ios-bridge log pane · com\.example\.app/);
    assert.match(text, /\[app\] login with \[value:secret\] done/);
    assert.doesNotMatch(text, /hunter2/);
    assert.match(text, /\[os\] +\[com\.example\.app:ui\] screen shown/);
    assert.match(text, /run finished: passed/);
  } finally { await stream.finish({ verdict: 'passed', reason: 'x', evidencePath: root }); await rm(root, { recursive: true, force: true }); }
});

test('the pane notes an unexpected app exit, and no live run means attach reports false', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-pane-exit-'));
  const runtime = join(root, 'com.example.app_2026.log');
  await writeFile(runtime, '');
  const runId = `exit-${process.pid}-${Date.now()}`;
  // The driver's answer: the iOS driver's, once its console helper has exited.
  const appProblem = () => ({ code: 'APP_EXITED' as const,
    note: 'The app stopped unexpectedly: its console output ended while the run was still going.' });
  const stream = await startLogStream({ runId, app: { bundleId: 'com.example.app' }, sources: { runtime }, values: {}, pollMs: 20, appProblem });
  try {
    const output = new Capture() as unknown as NodeJS.WriteStream;
    void attachLogPane(runId, output, { keepOpen: false });
    await new Promise(done => setTimeout(done, 150));
    assert.match((output as unknown as Capture).text, /The app stopped unexpectedly/);
    assert.equal(await attachLogPane(`missing-${Date.now()}`, new Capture() as unknown as NodeJS.WriteStream, { keepOpen: false }), false);
  } finally { await stream.finish({ verdict: 'inconclusive', reason: 'x', evidencePath: root }); await rm(root, { recursive: true, force: true }); }
});

test('no window opens when turned off, over SSH, or in CI', async () => {
  assert.equal(await paneWindowBlocked({ JEV_LOG_PANE: 'off' }), 'turned off with JEV_LOG_PANE=off');
  if (process.platform === 'darwin') {
    assert.equal(await paneWindowBlocked({ SSH_CONNECTION: '1 2 3 4' }), 'running over SSH');
    assert.equal(await paneWindowBlocked({ CI: 'true' }), 'running in CI');
  }
});

/* Phase 5 (Issue 20): an Android run's pane follows the app's logcat file, and the driver answers the app check. */

async function paneOf(runId: string, options: Omit<Parameters<typeof startLogStream>[0], 'runId' | 'pollMs'>,
  during: () => Promise<void> = async () => {}) {
  const stream = await startLogStream({ runId, pollMs: 20, ...options });
  const output = new Capture();
  try {
    void attachLogPane(runId, output as unknown as NodeJS.WriteStream, { keepOpen: false });
    await new Promise(done => setTimeout(done, 60));
    await during();
    await new Promise(done => setTimeout(done, 150));
  } finally { await stream.finish({ verdict: 'inconclusive', reason: 'x', evidencePath: '/tmp' }); }
  return output.text;
}

test('an Android pane names the logcat file and the uid filter in its header, and shows its lines masked, with the driver\'s cause note', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-pane-android-'));
  const logcat = join(root, 'run-1.log');
  await writeFile(logcat, '');
  let problem: { code: 'APP_EXITED'; note: string } | undefined;
  try {
    const text = await paneOf(`android-${process.pid}-${Date.now()}`, { app: { package: 'com.example.android' }, sources: { logcat },
      values: { city: 'Ha Noi' }, appProblem: () => problem }, async () => {
      await appendFile(logcat, '--------- beginning of main\n' +
        '2026-09-28 23:16:14.927 10226  9784  9784 I System.out: city is Ha Noi\n' +
        '2026-09-28 23:17:00.570 10226 10160 10160 E AndroidRuntime: FATAL EXCEPTION: main\n');
      await new Promise(done => setTimeout(done, 100));
      problem = { code: 'APP_EXITED', note: 'crashed: IllegalStateException at MainActivity.java:59' };
    });
    const lines = text.split('\n');
    assert.deepEqual(lines.slice(0, 3), [
      `jev-ios-bridge log pane · com.example.android · run ${lines[0]!.split(' · run ')[1]}`,
      `device log (logcat, the app's uid only): ${logcat}`,
      'Local only: nothing here goes to Jev or the host agent. Values from the script are masked.',
    ]);
    assert.doesNotMatch(text, /app output:|system log \(subsystem/);
    assert.match(text, /\[app\] city is \[value:city\]/);
    assert.doesNotMatch(text, /Ha Noi/);
    assert.match(text, /\[os\] +\[AndroidRuntime\] FATAL EXCEPTION: main/);
    assert.equal(text.split('!! crashed: IllegalStateException at MainActivity.java:59').length, 2, 'the note, once');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the driver\'s cause note is masked like every line', async () => {
  const runId = `note-masked-${process.pid}-${Date.now()}`;
  let problem: { code: 'APP_EXITED'; note: string } | undefined;
  const text = await paneOf(runId, { app: { package: 'com.example.android' }, sources: {}, values: { secret: 'IllegalStateException' },
    appProblem: () => problem }, async () => {
    problem = { code: 'APP_EXITED', note: 'crashed: IllegalStateException at MainActivity.java:59' };
    await new Promise(done => setTimeout(done, 100));
  });
  assert.match(text, /!! crashed: \[value:secret\] at MainActivity\.java:59/);
  assert.doesNotMatch(text, /IllegalStateException/);
});

test('an Android pane without a logcat file says the device log is unavailable, never naming the iOS sources', async () => {
  const runId = `android-no-file-${process.pid}-${Date.now()}`;
  const text = await paneOf(runId, { app: { package: 'com.example.android' }, sources: {}, values: {} });
  assert.deepEqual(text.split('\n').slice(0, 3), [
    `jev-ios-bridge log pane · com.example.android · run ${runId}`,
    'device log (logcat): unavailable',
    'Local only: nothing here goes to Jev or the host agent. Values from the script are masked.',
  ]);
});

test('an iOS pane\'s header is unchanged', async () => {
  const runId = `ios-header-${process.pid}-${Date.now()}`;
  const text = await paneOf(runId, { app: { bundleId: 'com.example.app' }, sources: { runtime: '/tmp/app.log' }, values: {} });
  assert.deepEqual(text.split('\n').slice(0, 4), [
    `jev-ios-bridge log pane · com.example.app · run ${runId}`,
    'app output: /tmp/app.log',
    'system log (subsystem com.example.app): unavailable',
    'Local only: nothing here goes to Jev or the host agent. Values from the script are masked.',
  ]);
});

test('an expected stop gives no note, even when the driver then reports the app exited', async () => {
  const runId = `expected-${process.pid}-${Date.now()}`;
  let problem: { code: 'APP_EXITED'; note: string } | undefined;
  const stream = await startLogStream({ runId, app: { package: 'com.example.android' }, sources: {}, values: {}, pollMs: 20,
    appProblem: () => problem });
  const output = new Capture();
  try {
    void attachLogPane(runId, output as unknown as NodeJS.WriteStream, { keepOpen: false });
    await new Promise(done => setTimeout(done, 60));
    stream.expectStop();
    problem = { code: 'APP_EXITED', note: 'exited' };
    await new Promise(done => setTimeout(done, 100));
  } finally { await stream.finish({ verdict: 'passed', reason: 'x', evidencePath: '/tmp' }); }
  assert.match(output.text, /run finished: passed/);
  assert.doesNotMatch(output.text, /!! /);
});
