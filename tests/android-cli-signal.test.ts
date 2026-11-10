import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Admission } from '../src/device/admission.js';
import { readRunEvents } from '../src/log/index.js';
import { androidScript } from './fixtures/android-script.js';
import { ANDROID_DEVICE, SERIAL } from './fixtures/appium-wire/matrix.js';
import { androidScreen, world } from './fixtures/appium-wire/world.js';

const screens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Marker', bounds: [16, 100, 216, 140] }]) };

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  test(`${signal} during an Android run closes the service: the run ends inconclusive, its cut screen read is fenced, the phone is released, and the CLI exits ${String(exitCode)}`, { timeout: 60_000 }, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-android-cli-signal-')));
    t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    mkdirSync(join(root, 'project'), { recursive: true });
    const script = join(root, 'project', 'script.json');
    writeFileSync(script, JSON.stringify(androidScript({ app: { package: 'example.app', activity: '.Main' }, device: { serial: SERIAL } })));
    const { TYPESAFE_API_KEY: _key, JEV_ANDROID_DEVICE: _device, ...inherited } = process.env;
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/appium-wire/cli-entry.ts', root], { stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...inherited, JEV_LOG_PANE: 'off', JEV_TEST_PLATFORM: 'android', TYPESAFE_API_KEY: 'synthetic-key-not-for-children',
        JEV_TEST_WORLDS: JSON.stringify([world('android', screens, [{ tool: 'appium_get_page_source', nth: 1, fault: { kind: 'held' } }])]),
        JEV_TEST_CLI_ARGS: JSON.stringify(['run', script, '--no-log-pane']) } });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    let stderr = '';
    child.stderr!.on('data', bytes => { stderr += String(bytes); });
    const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
    const trace = join(root, 'host', 'trace-0.jsonl');
    for (let waited = 0; !(existsSync(trace) && readFileSync(trace, 'utf8').includes('appium_get_page_source')); waited += 20) {
      assert.ok(waited < 30_000 && child.exitCode === null, `the run never reached its screen read: ${stderr}`);
      await delay(20);
    }
    child.kill(signal);
    assert.equal(await exited, exitCode, stderr);
    const [runId] = readdirSync(join(root, 'runs')).filter(name => !name.startsWith('.'));
    const report = JSON.parse(readFileSync(join(root, 'runs', runId!, 'report.json'), 'utf8')) as { verdict: string };
    assert.equal(report.verdict, 'inconclusive');
    const errors = (await readRunEvents(join(root, 'runs'), runId!)).filter(event => event.type === 'error').map(event => [event.data.phase, event.data.code]);
    assert.deepEqual(errors[0], ['observe', 'CANCELLED']);
    const admission = Admission.forTesting({ root: join(root, 'host', 'admission'), backend: 'fake', initialize: false });
    const attempt = admission.readAttempt({ kind: 'legacy', id: runId! });
    assert.equal(attempt?.terminal?.outcome, 'inconclusive', 'the run closed its admission before the CLI exited');
    assert.equal(admission.inspect(ANDROID_DEVICE)?.state, 'available', 'the screen read cut by its deadline is fenced with the whole Appium stack');
    const generation = admission.readGeneration(attempt!.owner);
    assert.deepEqual(generation.recoveries.map(recovery => recovery.closure), ['accepted'], 'one recovery claim covers the cut read');
    assert.deepEqual(generation.commands.filter(command => command.state !== 'settled').map(command => [command.operation, command.state]),
      [['appium-observe', 'uncertain']], 'the cut read is fenced, never reported settled');
  });
}
