import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Admission } from '../src/device/admission.js';
import { readRunEvents } from '../src/log/index.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { IOS_DEVICE } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world } from './fixtures/appium-wire/world.js';

const screens = { login: iosScreen([{ type: 'Button', name: 'sign.in', label: 'Sign in', frame: [20, 200, 200, 44] }]) };
const local = { version: 2, app: { bundleId: 'example.app' }, values: {}, steps: [
  { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none', localOnly: true },
  { id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] };

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`stdin closed, then ${signal} 2 s later while cleanup still runs (the MCP SDK client's close): the paused run ends CANCELLED with its verdict and the device released`, { timeout: 60_000 }, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-mcp-close-signal-')));
    t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const slowDelete = { tool: 'appium_session_management', match: { action: 'delete' }, fault: { kind: 'late' as const, ms: 3500 } };
    const { TYPESAFE_API_KEY: _key, ...inherited } = process.env;
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/appium-wire/cli-entry.ts', root], { stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...inherited, JEV_TEST_WORLDS: JSON.stringify([world('ios', screens, [slowDelete])]), JEV_EXPERIMENTAL_DRIVEN: '1', JEV_LOG_PANE: 'off',
        JEV_DEVICE_WINDOW: 'off', JEV_DEVICE_UDID: UDID, TYPESAFE_API_KEY: 'synthetic-key-not-for-children' } });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    let stderr = '';
    child.stderr.on('data', bytes => { stderr += String(bytes); });
    const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
    const pending = new Map<number, (value: { result: { content: { text: string }[] } }) => void>();
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => { const value = JSON.parse(line); pending.get(value.id)?.(value); pending.delete(value.id); });
    let nextId = 1;
    const request = (method: string, params: object) => new Promise<{ result: { content: { text: string }[] } }>(done => {
      const id = nextId++; pending.set(id, done); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    const call = async (name: string, args: object) => (await request('tools/call', { name, arguments: args })).result.content[0]!.text;
    await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'close-signal', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const { runId } = JSON.parse(await call('start_scenario', { scenario: local })) as { runId: string };
    assert.match(await call('get_report', { runId, waitMs: 45_000 }), /^Status: needs_claude/, stderr);

    child.stdin.end();
    lines.close();
    await delay(2000);
    assert.equal(child.exitCode, null, 'cleanup is still running when the signal arrives');
    child.kill(signal);
    await exited;

    assert.deepEqual(readdirSync(join(root, 'runs')).filter(name => !name.startsWith('.')), [runId]);
    const report = JSON.parse(readFileSync(join(root, 'runs', runId, 'report.json'), 'utf8')) as { verdict: string };
    assert.equal(report.verdict, 'inconclusive', stderr);
    const events = await readRunEvents(join(root, 'runs'), runId);
    assert.deepEqual(events.filter(event => event.type === 'error').map(event => [event.data.phase, event.data.code]), [['handback', 'CANCELLED'], ['cleanup', 'CANCELLED']]);
    assert.equal(events.find(event => event.type === 'verdict')?.data.reason, 'CANCELLED', 'the verdict is written before the process exits');
    const admission = Admission.forTesting({ root: join(root, 'host', 'admission'), backend: 'fake', initialize: false });
    assert.equal(admission.readAttempt({ kind: 'legacy', id: runId })?.terminal?.outcome, 'completed', 'the attempt is closed, not left active');
    assert.equal(admission.inspect(IOS_DEVICE)?.state, 'available', 'the device is released');
  });
}
