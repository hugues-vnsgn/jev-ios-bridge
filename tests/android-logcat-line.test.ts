import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { logcatLine } from '../src/logpane/format.js';

const captures = join(import.meta.dirname, 'fixtures/android/logcat');

/** Lines each captured app log (`uid.log`) parses to, as the prototype counted them; every other line is a divider. */
const parsedLines: Record<string, number> = {
  'probe-anr': 89, 'probe-bgcrash': 95, 'probe-crash': 85, 'probe-exit': 69, 'probe-finish': 89, 'probe-native': 156,
  'probe-normal': 153, 'twin-amcrash': 47, 'twin-forcestop': 31, 'twin-home': 32, 'twin-kill9': 31, 'twin-normal': 31,
  'twin-segv': 101,
};

test('every captured app-log line parses or is a divider', () => {
  const runs = readdirSync(captures, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(runs, Object.keys(parsedLines).sort());
  for (const run of runs) {
    const lines = readFileSync(join(captures, run, 'uid.log'), 'utf8').split('\n').filter(line => line !== '');
    const dividers = lines.filter(line => line.startsWith('--------- beginning of '));
    const parsed = lines.filter(line => logcatLine(line) !== undefined);
    assert.equal(parsed.length, parsedLines[run], run);
    assert.equal(parsed.length + dividers.length, lines.length, `${run}: a line neither parsed nor a divider`);
    for (const divider of dividers) assert.equal(logcatLine(divider), undefined);
  }
});

test('System.out and System.err are the app console; other tags are [os] [Tag]', () => {
  assert.deepEqual(logcatLine('2026-09-28 23:18:45.704 10226 11656 11656 I System.out: System.out println line'),
    { source: 'app', time: '23:18:45.704', level: 'normal', text: 'System.out println line' });
  assert.deepEqual(logcatLine('2026-09-28 23:18:45.704 10226 11656 11656 W System.err: System.err line'),
    { source: 'app', time: '23:18:45.704', level: 'normal', text: 'System.err line' });
  assert.deepEqual(logcatLine('2026-09-28 23:17:02.101 10226 10160 10160 W System.err: \tat dev.jevbridge.logprobe.MainActivity.onCreate(MainActivity.java:59)'),
    { source: 'app', time: '23:17:02.101', level: 'normal', text: '\tat dev.jevbridge.logprobe.MainActivity.onCreate(MainActivity.java:59)' });
  assert.deepEqual(logcatLine('2026-09-28 23:16:57.567 10226 10160 10160 I JevProbe: unicode line: café ✓ Tiếng Việt'),
    { source: 'os', time: '23:16:57.567', level: 'normal', text: '[JevProbe] unicode line: café ✓ Tiếng Việt' });
  assert.deepEqual(logcatLine('2026-09-28 23:18:45.658 10226 11656 11656 V GraphicsEnvironment: Currently set values for:'),
    { source: 'os', time: '23:18:45.658', level: 'dim', text: '[GraphicsEnvironment] Currently set values for:' });
});

test('E, F and A are errors, V and D dim, I and W normal; the padded tag is trimmed', () => {
  assert.deepEqual(logcatLine('2026-09-28 23:17:14.255 10226 10460 10543 E AndroidRuntime: FATAL EXCEPTION: bg'),
    { source: 'os', time: '23:17:14.255', level: 'error', text: '[AndroidRuntime] FATAL EXCEPTION: bg' });
  assert.deepEqual(logcatLine('2026-09-28 23:17:28.378 10226 10850 10850 F DEBUG   : Build fingerprint: \'google/sdk_gphone64_arm64/emu64a:16\''),
    { source: 'os', time: '23:17:28.378', level: 'error', text: '[DEBUG] Build fingerprint: \'google/sdk_gphone64_arm64/emu64a:16\'' });
  assert.equal(logcatLine('2026-09-28 23:17:28.380 10226 10850 10850 A DEBUG   : Abort message: \'probe\'')?.level, 'error');
  assert.deepEqual(logcatLine('2026-09-28 23:16:14.524 10226  9784  9784 D nativeloader: Load libframework-connectivity-tiramisu-jni.so: ok'),
    { source: 'os', time: '23:16:14.524', level: 'dim', text: '[nativeloader] Load libframework-connectivity-tiramisu-jni.so: ok' });
  assert.equal(logcatLine('2026-09-28 23:16:14.372 10226  9784  9784 I Zygote  : Process 9784 created for dev.jevbridge.logprobe')?.level, 'normal');
  assert.equal(logcatLine('2026-09-28 23:16:14.372 10226  9784  9784 W JevProbe: warn line')?.level, 'normal');
});

test('blank lines, dividers and lines that don\'t parse give nothing', () => {
  assert.equal(logcatLine(''), undefined);
  assert.equal(logcatLine('   '), undefined);
  assert.equal(logcatLine('--------- beginning of crash'), undefined);
  assert.equal(logcatLine('login with hunter2 done'), undefined);
  assert.equal(logcatLine('2026-09-28 23:16:14.372 10226  9784  9784 X Zygote  : unknown level'), undefined);
});
