import { mkdirSync, realpathSync } from 'node:fs';
import { Admission } from '../src/device/admission.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Snapshot } from '../src/contracts/index.js';
import { MobileBuildMcpDriver, type CliRunner } from '../src/device/index.js';

const udid = '12345678-1234-4234-8234-123456789ABC';
const context = { app: { bundleId: 'dev.jevbridge.observedfixture' }, device: { udid }, values: {} };
const snapshot = (actions = ['tap', 'touch']): Snapshot => ({ deviceId: udid, sequence: 1,
  capturedAt: Date.now(), expiresAt: Date.now() + 60_000, truncated: false,
  elements: [{ ref: 'e15', role: 'button', identifier: 'open.details', actions,
    frame: { x: 153, y: 516, width: 96, height: 22.33 }, state: { visible: true, enabled: true } }] });

async function withDriver(check: (driver: MobileBuildMcpDriver, calls: string[][]) => Promise<void>, loseReply = false) {
  const root = await mkdtemp(join(tmpdir(), 'observed-touch-'));
  const calls: string[][] = [];
  const runner: CliRunner = async args => {
    calls.push(args);
    const action = args[0] === 'ui-automation';
    if (action && loseReply) throw new Error('LOST_REPLY');
    return { stdout: JSON.stringify({ schema: action ? 'mobilebuildmcp.output.ui-action-result' : 'mobilebuildmcp.output.launch-result',
      schemaVersion: '2', didError: false, data: { summary: { status: 'SUCCEEDED' },
        ...(action ? { action: { type: 'touch', elementRef: 'e15', event: 'touch down+up', x: 201, y: 527 } } : {}),
        artifacts: { simulatorId: udid }, diagnostics: {} } }), stderr: '', exitCode: 0 };
  };
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner, stopAppOnClose: false });
  try { await driver.prepare(context, new AbortController().signal); await check(driver, calls); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('experimental tap uses one vendor touch down/up with hold; no semantic tap fallback', async () => {
  await withDriver(async (driver, calls) => {
    await driver.tapOnce('e15', snapshot(), context, new AbortController().signal);
    const actions = calls.filter(args => args[0] === 'ui-automation');
    assert.equal(actions.length, 1);
    assert.deepEqual(actions[0]?.slice(0, 3), ['ui-automation', 'touch', '--json']);
    assert.deepEqual(JSON.parse(actions[0]![3]!), { simulatorId: udid, elementRef: 'e15', down: true, up: true, delay: 0.05 });
    assert.deepEqual(actions[0]?.slice(4), ['--output', 'json']);
    await driver.close(new AbortController().signal);
  });
});

test('missing touch capability refuses before submission', async () => {
  await withDriver(async (driver, calls) => {
    await assert.rejects(driver.tapOnce('e15', snapshot(['tap']), context, new AbortController().signal), /touch/);
    assert.equal(calls.filter(args => args[0] === 'ui-automation').length, 0);
    await driver.close(new AbortController().signal);
  });
});

test('lost touch reply never invokes semantic tap or another touch', async () => {
  await withDriver(async (driver, calls) => {
    await assert.rejects(driver.tapOnce('e15', snapshot(), context, new AbortController().signal), /LOST_REPLY/);
    assert.equal(calls.filter(args => args[0] === 'ui-automation').length, 1);
    await assert.rejects(driver.close(new AbortController().signal), /unknown/);
  }, true);
});

function fakeDriver(options: import('../src/device/index.js').MobileBuildMcpDriverOptions): MobileBuildMcpDriver {
  const storeRoot = join(options.cwd, 'admission');
  mkdirSync(storeRoot, { recursive: true, mode: 0o700 });
  const admission = Admission.forTesting({ root: realpathSync(storeRoot), backend: 'fake' });
  return new MobileBuildMcpDriver({ ...options, admission,
    deviceWindow: options.deviceWindow ?? (async () => {}),
    fakeBackend: { runner: options.runner!, window: options.deviceWindow } });
}
