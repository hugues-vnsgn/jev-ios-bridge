import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { appLine, masker, osLine } from '../src/logpane/format.js';
import { startLogStream } from '../src/logpane/stream.js';
import { attachLogPane } from '../src/logpane/attach.js';
import { paneWindowBlocked } from '../src/logpane/window.js';

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

class Capture extends Writable {
  text = '';
  _write(chunk: Buffer, _encoding: string, done: () => void) { this.text += chunk.toString(); done(); }
}

test('a pane attached to a live run shows masked app and system lines, then the verdict, and closes after a pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-pane-'));
  const runtime = join(root, 'app.log');
  const os = join(root, 'os.log');
  await writeFile(runtime, '');
  await writeFile(os, '');
  const runId = `pane-${process.pid}-${Date.now()}`;
  const stream = await startLogStream({ runId, bundleId: 'com.example.app', sources: { runtime, os },
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
  const exited = spawnSync(process.execPath, ['-e', '0']).pid;
  const runtime = join(root, `com.example.app_2026_helperpid${exited}_ownerpid1_abc.log`);
  await writeFile(runtime, '');
  const runId = `exit-${process.pid}-${Date.now()}`;
  const stream = await startLogStream({ runId, bundleId: 'com.example.app', sources: { runtime }, values: {}, pollMs: 20 });
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
