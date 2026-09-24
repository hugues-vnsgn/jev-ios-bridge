import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Scenario } from '../src/contracts/index.js';
import { DeviceCliError, MobileBuildMcpDriver, StaleSnapshotError, parseSnapshot, type CliRunner } from '../src/device/index.js';

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const scenario: Scenario = {
  goal: 'Open Settings', app: { bundleId: 'com.apple.Preferences' },
  assertions: [{ id: 'open', claim: 'Settings is open' }], values: {}, device: { udid },
};

function envelope(data: unknown, didError = false): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.capture-result', schemaVersion: '2', didError,
    error: didError ? { code: 'SNAPSHOT_EXPIRED', message: 'Snapshot expired' } : null, data });
}

function capture(hash = 'same', expiresAtMs = Date.now() + 60_000): unknown {
  return { capture: { type: 'runtime-snapshot', rs: '1', screenHash: hash, seq: 3, count: 1,
    capturedAtMs: expiresAtMs - 60_000, expiresAtMs, targets: ['e1|tap|button|Settings||Settings'], scroll: [],
    text: ['e2|text|text|Page title: Settings||'] } };
}

test('runs pinned CLI actions in one workspace and normalizes compact captures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-test-'));
  const calls: string[][] = [];
  const runner: CliRunner = async (args) => {
    calls.push(args);
    return { stdout: envelope(args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const snapshot = await driver.observe(new AbortController().signal);
    assert.equal(snapshot.deviceId, udid);
    assert.equal(snapshot.screenHash, 'same');
    assert.deepEqual(snapshot.elements[0], { ref: 'e1', role: 'button', label: 'Settings', identifier: 'Settings', actions: ['tap'] });
    assert.deepEqual(snapshot.elements[1], { ref: 'e2', role: 'text', label: 'Page title: Settings', actions: [] });
    assert.equal(snapshot.logTails?.runtime, '[unavailable: vendor supplied no log path]');
    await driver.act({ kind: 'tap', targetRef: 'e1' }, snapshot, scenario, new AbortController().signal);
    assert.ok(calls.some(args => args.slice(0, 2).join(' ') === 'simulator launch-app'));
    assert.ok(calls.some(args => args.slice(0, 2).join(' ') === 'ui-automation tap'));
    assert.ok(calls.every(args => args.includes('--simulator-id') && args.includes(udid) && args.slice(-2).join(' ') === '--output json'));
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('refreshes expired refs but refuses to act after a screen change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-stale-'));
  let snapshots = 0;
  let taps = 0;
  const runner: CliRunner = async (args) => {
    if (args.includes('tap')) taps++;
    if (args.includes('snapshot-ui')) snapshots++;
    return { stdout: envelope(args.includes('snapshot-ui') ? capture(snapshots === 1 ? 'old' : 'new', Date.now() - 1) : {}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const snapshot = await driver.observe(new AbortController().signal);
    await assert.rejects(driver.act({ kind: 'tap', targetRef: 'e1' }, snapshot, scenario, new AbortController().signal), StaleSnapshotError);
    assert.equal(taps, 0);
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('refreshes after actual MobileBuildMCP uiError SNAPSHOT_EXPIRED envelope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-vendor-error-'));
  let snapshots = 0;
  let taps = 0;
  const runner: CliRunner = async (args) => {
    if (args.includes('snapshot-ui')) {
      snapshots++;
      const data = capture();
      const result = data as { capture: { targets: string[] } };
      result.capture.targets = [`e${snapshots}|tap|button|Settings||Settings`];
      return { stdout: envelope(result), stderr: '', exitCode: 0 };
    }
    if (args.includes('tap')) {
      taps++;
      if (taps === 1) {
        return { stdout: JSON.stringify({
          schema: 'mobilebuildmcp.output.ui-action-result', schemaVersion: '2', didError: true,
          error: 'Runtime snapshot expired; capture again.',
          data: { summary: { status: 'FAILED' }, action: { type: 'tap', elementRef: 'e1' },
            artifacts: { simulatorId: udid }, uiError: { code: 'SNAPSHOT_EXPIRED', message: 'Runtime snapshot expired; capture again.', recoveryHint: 'Capture again.' } },
        }), stderr: '', exitCode: 1 };
      }
    }
    return { stdout: envelope({}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const original = await driver.observe(new AbortController().signal);
    await driver.act({ kind: 'tap', targetRef: 'e1' }, original, scenario, new AbortController().signal);
    assert.equal(snapshots, 2);
    assert.equal(taps, 2);
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('recoverable vendor error requires rejudgment if refreshed screen changed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-error-changed-'));
  let snapshots = 0;
  let taps = 0;
  const runner: CliRunner = async (args) => {
    if (args.includes('snapshot-ui')) return { stdout: envelope(capture(++snapshots === 1 ? 'old' : 'changed')), stderr: '', exitCode: 0 };
    if (args.includes('tap')) {
      taps++;
      return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.ui-action-result', schemaVersion: '2',
        didError: true, error: 'Snapshot expired', data: { uiError: { code: 'SNAPSHOT_EXPIRED', message: 'Snapshot expired' } } }),
        stderr: '', exitCode: 1 };
    }
    return { stdout: envelope({}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const original = await driver.observe(new AbortController().signal);
    await assert.rejects(driver.act({ kind: 'tap', targetRef: 'e1' }, original, scenario, new AbortController().signal), StaleSnapshotError);
    assert.equal(snapshots, 2);
    assert.equal(taps, 1);
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('locks a device across drivers and releases it after close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-lock-'));
  const runner: CliRunner = async () => ({ stdout: envelope({}), stderr: '', exitCode: 0 });
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    await assert.rejects(second.prepare(scenario, new AbortController().signal), (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    await first.close(new AbortController().signal);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    await first.close(new AbortController().signal);
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('normalizes full captures and preserves structured CLI errors', () => {
  const snapshot = parseSnapshot({ capture: { type: 'runtime-snapshot', protocol: 'rs/1', seq: 4,
    elements: [{ ref: 'e3', role: 'text-field', label: 'Name', state: { enabled: true, visible: true }, actions: ['tap', 'typeText'] }] } }, udid);
  assert.equal(snapshot.elements[0]?.state?.visible, true);
  assert.equal(snapshot.elements[0]?.actions[1], 'typeText');
});

test('keeps screenshot path as local evidence without adding it to screen elements', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-shot-'));
  const runner: CliRunner = async (args) => ({
    stdout: envelope(args.includes('screenshot')
      ? { artifacts: { screenshotPath: '/tmp/example-screen.jpg' }, capture: { format: 'image/jpeg' } }
      : args.includes('snapshot-ui') ? capture() : {}),
    stderr: '', exitCode: 0,
  });
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, screenshots: true, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const snapshot = await driver.observe(new AbortController().signal);
    assert.equal(snapshot.screenshotPath, '/tmp/example-screen.jpg');
    assert.ok(!JSON.stringify(snapshot.elements).includes('example-screen.jpg'));
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('reads only the last 4 KiB from vendor launch logs and records unavailable tails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-logs-'));
  const runtime = join(root, 'runtime.log');
  const missingOs = join(root, 'missing-os.log');
  await writeFile(runtime, `BEGIN-ONLY\n${'before-tail\n'.repeat(600)}END-OF-APP-LOG`);
  const runner: CliRunner = async (args) => ({
    stdout: envelope(args.includes('launch-app')
      ? { artifacts: { simulatorId: udid, runtimeLogPath: runtime, osLogPath: missingOs } }
      : args.includes('snapshot-ui') ? capture() : {}),
    stderr: '', exitCode: 0,
  });
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const observed = await driver.observe(new AbortController().signal);
    assert.ok(observed.logTails?.runtime?.endsWith('END-OF-APP-LOG'));
    assert.ok(Buffer.byteLength(observed.logTails?.runtime ?? '') <= 4_096);
    assert.ok(!observed.logTails?.runtime?.includes('BEGIN-ONLY'));
    assert.equal(observed.logTails?.os, '[unavailable: ENOENT]');
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('typing a complete scenario value replaces existing field text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-replace-'));
  const calls: string[][] = [];
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner: async args => {
    calls.push(args); return { stdout: envelope({}), stderr: '', exitCode: 0 };
  } });
  const editing = { ...scenario, values: { lastName: 'Stone' } };
  try {
    await driver.prepare(editing, new AbortController().signal);
    await driver.act({ kind: 'type', targetRef: 'surname', valueKey: 'lastName' }, {
      deviceId: udid, capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: 1, truncated: false,
      elements: [{ ref: 'surname', role: 'text-field', value: 'Vale', actions: ['typeText'] }],
    }, editing, new AbortController().signal);
    const command = calls.find(args => args.includes('type-text'))!;
    assert.ok(command.includes('--replace-existing'));
    assert.equal(command[command.indexOf('--text') + 1], 'Stone');
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});
