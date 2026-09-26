import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ActionScenarioContext, DeviceDriver } from '../src/contracts/index.js';
import { DeviceCliError, MobileBuildMcpDriver, StaleSnapshotError, parseSnapshot, type CliRunner } from '../src/device/index.js';

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const scenario: ActionScenarioContext = { app: { bundleId: 'com.apple.Preferences' }, values: {}, device: { udid } };

function envelope(data: unknown, didError = false, schema = 'mobilebuildmcp.output.capture-result'): string {
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return JSON.stringify({ schema, schemaVersion: '2', didError,
    error: didError ? 'Snapshot expired' : null,
    data: { summary: { status: didError ? 'FAILED' : 'SUCCEEDED' }, ...payload,
      artifacts: { simulatorId: udid, ...(payload.artifacts as Record<string, unknown> | undefined) },
      ...(schema === 'mobilebuildmcp.output.launch-result' || schema === 'mobilebuildmcp.output.stop-result' ? { diagnostics: {} } : {}) } });
}

function actionEnvelope(): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.ui-action-result', schemaVersion: '2', didError: false,
    error: null, data: { summary: { status: 'SUCCEEDED' }, action: { type: 'tap', elementRef: 'e1' },
      artifacts: { simulatorId: udid } } });
}

function commandEnvelope(args: string[], data: unknown = {}): string {
  if (args.includes('launch-app')) return envelope(data, false, 'mobilebuildmcp.output.launch-result');
  if (args.includes('stop')) return envelope(data, false, 'mobilebuildmcp.output.stop-result');
  if (args.includes('tap') || args.includes('type-text') || args.includes('swipe')) return actionEnvelope();
  return envelope(data);
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
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
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
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture(snapshots === 1 ? 'old' : 'new', Date.now() - 1) : {}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const snapshot = await driver.observe(new AbortController().signal);
    await assert.rejects(driver.act({ kind: 'tap', targetRef: 'e1' }, snapshot, scenario, new AbortController().signal), StaleSnapshotError);
    assert.equal(taps, 0);
    assert.deepEqual((driver as DeviceDriver).metrics?.(), { referenceRefreshes: 1, referenceExpiries: 0, nearTtlRefreshes: 1 });
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
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const original = await driver.observe(new AbortController().signal);
    await driver.act({ kind: 'tap', targetRef: 'e1' }, original, scenario, new AbortController().signal);
    assert.equal(snapshots, 2);
    assert.equal(taps, 2);
    assert.deepEqual((driver as DeviceDriver).metrics?.(), { referenceRefreshes: 1, referenceExpiries: 1, nearTtlRefreshes: 0 });
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
        didError: true, error: 'Snapshot expired', data: { action: { type: 'tap', elementRef: 'e1' },
          artifacts: { simulatorId: udid }, uiError: { code: 'SNAPSHOT_EXPIRED', message: 'Snapshot expired' } } }),
        stderr: '', exitCode: 1 };
    }
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
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
  const runner: CliRunner = async args => ({ stdout: commandEnvelope(args), stderr: '', exitCode: 0 });
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

test('mixed-case spellings of one simulator UUID share the lock and canonical device identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-case-lock-'));
  const calls: string[][] = [];
  const runner: CliRunner = async args => {
    calls.push(args);
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare({ app: scenario.app, device: { udid: udid.toLowerCase() } }, new AbortController().signal);
    const observed = await first.observe(new AbortController().signal);
    assert.equal(observed.deviceId, udid);
    await assert.rejects(second.prepare({ app: scenario.app, device: { udid } }, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    assert.ok(calls.every(args => !args.includes(udid.toLowerCase())));
    await first.close(new AbortController().signal);
    await second.prepare({ app: scenario.app, device: { udid } }, new AbortController().signal);
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
    stdout: commandEnvelope(args, args.includes('screenshot')
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
    stdout: commandEnvelope(args, args.includes('launch-app')
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

test('typing a supported literal uses JSON transport and replaces existing field text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-replace-'));
  const calls: string[][] = [];
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner: async args => {
    calls.push(args); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  } });
  const editing = { ...scenario, values: { lastName: 'Stone-' } };
  try {
    await driver.prepare(editing, new AbortController().signal);
    await driver.act({ kind: 'type', targetRef: 'surname', valueKey: 'lastName' }, {
      deviceId: udid, capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: 1, truncated: false,
      elements: [{ ref: 'surname', role: 'text-field', value: 'Vale', actions: ['typeText'] }],
    }, editing, new AbortController().signal);
    const command = calls.find(args => args.includes('type-text'))!;
    const payload = JSON.parse(command[command.indexOf('--json') + 1]!) as Record<string, unknown>;
    assert.deepEqual(payload, { simulatorId: udid, elementRef: 'surname', text: 'Stone-', replaceExisting: true });
    assert.ok(!command.includes('--text'));
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('leading hyphen value fails before MobileBuildMCP type-text is invoked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-unsupported-text-'));
  const calls: string[][] = [];
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner: async args => {
    calls.push(args);
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  } });
  const editing = { ...scenario, values: { query: '--London' } };
  try {
    await driver.prepare(editing, new AbortController().signal);
    await assert.rejects(driver.act({ kind: 'type', targetRef: 'search', valueKey: 'query' }, {
      deviceId: udid, capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: 1, truncated: false,
      elements: [{ ref: 'search', role: 'text-field', actions: ['typeText'] }],
    }, editing, new AbortController().signal),
    (error: unknown) => error instanceof DeviceCliError && error.code === 'UNSUPPORTED_LEADING_DASH_TEXT');
    assert.ok(!calls.some(args => args.includes('type-text')));
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('cancelled run waits for an issued CLI action acknowledgement before stop and unlock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-action-ack-'));
  const calls: string[] = [];
  let actionStarted!: () => void;
  let finishDaemonAction!: (result: { stdout: string; stderr: string; exitCode: number }) => void;
  let issuedSignal: AbortSignal | undefined;
  const started = new Promise<void>(resolve => { actionStarted = resolve; });
  const daemonResult = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { finishDaemonAction = resolve; });
  const runner: CliRunner = async (args, signal) => {
    if (args.includes('snapshot-ui')) {
      return { stdout: envelope(capture()), stderr: '', exitCode: 0 };
    }
    if (args.includes('tap')) {
      calls.push('tap'); actionStarted();
      issuedSignal = signal;
      return daemonResult;
    }
    if (args.includes('stop')) calls.push('stop');
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    const observed = await first.observe(new AbortController().signal);
    const cancelled = new AbortController();
    const action = first.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, cancelled.signal);
    await started;
    cancelled.abort();
    assert.equal(issuedSignal?.aborted, false);
    const closing = first.close(new AbortController().signal);
    assert.strictEqual(first.close(new AbortController().signal), closing);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['tap']);
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    finishDaemonAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await action;
    await closing;
    assert.deepEqual(calls, ['tap', 'stop']);
    await first.close(new AbortController().signal);
    assert.deepEqual(calls, ['tap', 'stop']);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    finishDaemonAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await first.close(new AbortController().signal);
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('independent UI command deadline retains lock when terminal outcome is lost', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-action-timeout-'));
  let stops = 0;
  let actionStarted!: () => void;
  let rejectLate!: (error: Error) => void;
  const started = new Promise<void>(resolve => { actionStarted = resolve; });
  const runner: CliRunner = async args => {
    if (args.includes('snapshot-ui')) return { stdout: envelope(capture()), stderr: '', exitCode: 0 };
    if (args.includes('tap')) {
      actionStarted();
      return new Promise((_resolve, reject) => { rejectLate = reject; }); // Runner ignores abort until after our deadline.
    }
    if (args.includes('stop')) stops++;
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, uiCommandTimeoutMs: 20 });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    const observed = await first.observe(new AbortController().signal);
    const cancelled = new AbortController();
    const action = first.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, cancelled.signal);
    await started;
    cancelled.abort();
    await assert.rejects(action);
    rejectLate(new Error('late CLI rejection'));
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(first.close(new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'UI_ACTION_UNCONFIRMED');
    assert.equal(stops, 0);
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
  } finally {
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('generic CLI transport error is not mistaken for terminal UI acknowledgement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-generic-error-'));
  let stops = 0;
  const runner: CliRunner = async args => {
    if (args.includes('snapshot-ui')) return { stdout: envelope(capture()), stderr: '', exitCode: 0 };
    if (args.includes('tap')) return { stdout: JSON.stringify({
      schema: 'mobilebuildmcp.output.error', schemaVersion: '1', didError: true,
      error: 'Daemon request timed out', data: { summary: { status: 'FAILED' } },
    }), stderr: '', exitCode: 1 };
    if (args.includes('stop')) stops++;
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    const observed = await first.observe(new AbortController().signal);
    await assert.rejects(first.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, new AbortController().signal));
    await assert.rejects(first.close(new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'UI_ACTION_UNCONFIRMED');
    assert.equal(stops, 0);
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
  } finally {
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('cleanup deadline retains lock until the pending CLI later acknowledges and close is retried', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-cleanup-deadline-'));
  let actionStarted!: () => void;
  let finishAction!: (result: { stdout: string; stderr: string; exitCode: number }) => void;
  const started = new Promise<void>(resolve => { actionStarted = resolve; });
  const terminal = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { finishAction = resolve; });
  let stops = 0;
  const runner: CliRunner = async args => {
    if (args.includes('snapshot-ui')) return { stdout: envelope(capture()), stderr: '', exitCode: 0 };
    if (args.includes('tap')) { actionStarted(); return terminal; }
    if (args.includes('stop')) stops++;
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, uiCommandTimeoutMs: 1_000 });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    const observed = await first.observe(new AbortController().signal);
    const runAbort = new AbortController();
    const action = first.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, runAbort.signal);
    await started;
    runAbort.abort();
    const cleanup = new AbortController();
    const closing = first.close(cleanup.signal);
    cleanup.abort();
    await assert.rejects(closing, (error: unknown) => error instanceof DeviceCliError && error.code === 'UI_ACTION_UNCONFIRMED');
    assert.equal(stops, 0);
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    finishAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await action;
    await first.close(new AbortController().signal);
    assert.equal(stops, 1);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    finishAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('a late acknowledgement finishes cleanup and releases the lock without another close call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-late-ack-'));
  let actionStarted!: () => void;
  let finishAction!: (result: { stdout: string; stderr: string; exitCode: number }) => void;
  const started = new Promise<void>(resolve => { actionStarted = resolve; });
  const terminal = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { finishAction = resolve; });
  let stops = 0;
  const runner: CliRunner = async args => {
    if (args.includes('snapshot-ui')) return { stdout: envelope(capture()), stderr: '', exitCode: 0 };
    if (args.includes('tap')) { actionStarted(); return terminal; }
    if (args.includes('stop')) stops++;
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, uiCommandTimeoutMs: 1_000 });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    const observed = await first.observe(new AbortController().signal);
    const runAbort = new AbortController();
    const action = first.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, runAbort.signal).catch(() => {});
    await started;
    runAbort.abort();
    const cleanup = new AbortController();
    const closing = first.close(cleanup.signal);
    cleanup.abort();
    await assert.rejects(closing, (error: unknown) => error instanceof DeviceCliError && error.code === 'UI_ACTION_UNCONFIRMED');
    finishAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await action;
    for (let attempt = 0; attempt < 100 && stops === 0; attempt++) await new Promise(done => setTimeout(done, 10));
    assert.equal(stops, 1);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    finishAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('a lock left by an exited bridge process is cleared by the next run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-stale-lock-'));
  const { spawnSync } = await import('node:child_process');
  const exited = spawnSync(process.execPath, ['-e', '0']).pid;
  await writeFile(join(root, `${udid}.lock`), JSON.stringify({ pid: exited, token: 'old' }));
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root,
    runner: async args => ({ stdout: commandEnvelope(args), stderr: '', exitCode: 0 }) });
  try {
    await driver.prepare(scenario, new AbortController().signal);
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('a lock held by a live process names its holder and the lock file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-live-lock-'));
  await writeFile(join(root, `${udid}.lock`), JSON.stringify({ pid: process.pid, token: 'other' }));
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root,
    runner: async args => ({ stdout: commandEnvelope(args), stderr: '', exitCode: 0 }) });
  try {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal), (error: unknown) =>
      error instanceof DeviceCliError && error.code === 'DEVICE_BUSY' &&
      error.message.includes(`bridge process ${process.pid}`) && error.message.includes(join(root, `${udid}.lock`)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unconfirmed app stop keeps the bridge device lock until cleanup retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-stop-retry-'));
  let stopFails = true;
  const runner: CliRunner = async args => {
    if (args.includes('stop') && stopFails) throw new Error('stop transport failed');
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    await assert.rejects(first.close(new AbortController().signal));
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    stopFails = false;
    await first.close(new AbortController().signal);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    stopFails = false;
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelled prepare waits for the issued launch acknowledgement before stop and unlock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-prepare-ack-'));
  let launchStarted!: () => void;
  let finishLaunch!: (result: { stdout: string; stderr: string; exitCode: number }) => void;
  const started = new Promise<void>(resolve => { launchStarted = resolve; });
  const terminal = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { finishLaunch = resolve; });
  let launches = 0;
  let issuedSignal: AbortSignal | undefined;
  const calls: string[] = [];
  const runner: CliRunner = async (args, signal) => {
    if (args.includes('launch-app')) {
      launches++;
      if (launches === 1) { issuedSignal = signal; calls.push('launch'); launchStarted(); return terminal; }
    }
    if (args.includes('stop')) calls.push('stop');
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    const aborted = new AbortController();
    const preparing = first.prepare(scenario, aborted.signal);
    await started;
    aborted.abort();
    assert.equal(issuedSignal?.aborted, false);
    const closing = first.close(new AbortController().signal);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['launch']);
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    finishLaunch({ stdout: commandEnvelope(['launch-app']), stderr: '', exitCode: 0 });
    await preparing;
    await closing;
    assert.deepEqual(calls, ['launch', 'stop']);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    finishLaunch({ stdout: commandEnvelope(['launch-app']), stderr: '', exitCode: 0 });
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelled observe waits for the issued snapshot acknowledgement before stop and unlock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-observe-ack-'));
  let snapshotStarted!: () => void;
  let finishSnapshot!: (result: { stdout: string; stderr: string; exitCode: number }) => void;
  const started = new Promise<void>(resolve => { snapshotStarted = resolve; });
  const terminal = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { finishSnapshot = resolve; });
  let snapshots = 0;
  let issuedSignal: AbortSignal | undefined;
  const calls: string[] = [];
  const runner: CliRunner = async (args, signal) => {
    if (args.includes('snapshot-ui')) {
      snapshots++;
      if (snapshots === 1) { issuedSignal = signal; calls.push('snapshot'); snapshotStarted(); return terminal; }
    }
    if (args.includes('stop')) calls.push('stop');
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    const aborted = new AbortController();
    const observing = first.observe(aborted.signal);
    await started;
    aborted.abort();
    assert.equal(issuedSignal?.aborted, false);
    const closing = first.close(new AbortController().signal);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['snapshot']);
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    finishSnapshot({ stdout: envelope(capture()), stderr: '', exitCode: 0 });
    await observing;
    await closing;
    assert.deepEqual(calls, ['snapshot', 'stop']);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    finishSnapshot({ stdout: envelope(capture()), stderr: '', exitCode: 0 });
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('missing launch or snapshot terminal result retains the device lock', async () => {
  for (const phase of ['launch-app', 'snapshot-ui']) {
    const root = await mkdtemp(join(tmpdir(), `jev-device-${phase}-unknown-`));
    let stops = 0;
    const runner: CliRunner = async args => {
      if (args.includes(phase)) return { stdout: JSON.stringify({
        schema: 'mobilebuildmcp.output.error', schemaVersion: '1', didError: true,
        error: 'Daemon transport lost', data: {},
      }), stderr: '', exitCode: 1 };
      if (args.includes('stop')) stops++;
      return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
    };
    const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
    const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
    try {
      if (phase === 'launch-app') await assert.rejects(first.prepare(scenario, new AbortController().signal));
      else {
        await first.prepare(scenario, new AbortController().signal);
        await assert.rejects(first.observe(new AbortController().signal));
      }
      await assert.rejects(first.close(new AbortController().signal),
        (error: unknown) => error instanceof DeviceCliError && error.code === 'UI_ACTION_UNCONFIRMED');
      assert.equal(stops, 0);
      await assert.rejects(second.prepare(scenario, new AbortController().signal),
        (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    } finally {
      await first.close(new AbortController().signal).catch(() => {});
      await second.close(new AbortController().signal);
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('acknowledged launch failure releases the lock without attempting app stop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-launch-failed-'));
  let launches = 0;
  let stops = 0;
  const runner: CliRunner = async args => {
    if (args.includes('launch-app')) {
      launches++;
      if (launches === 1) return { stdout: envelope({ diagnostics: {} }, true, 'mobilebuildmcp.output.launch-result'), stderr: '', exitCode: 1 };
    }
    if (args.includes('stop')) stops++;
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await assert.rejects(first.prepare(scenario, new AbortController().signal), DeviceCliError);
    await first.close(new AbortController().signal);
    assert.equal(stops, 0);
    await second.prepare(scenario, new AbortController().signal);
  } finally {
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('pre-dispatch cancellation does not invoke launch or snapshot CLI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-predispatch-'));
  const calls: string[] = [];
  const runner: CliRunner = async args => {
    calls.push(args[1] ?? 'unknown');
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(driver.prepare(scenario, cancelled.signal));
    assert.deepEqual(calls, []);
    await driver.prepare(scenario, new AbortController().signal);
    await assert.rejects(driver.observe(cancelled.signal));
    assert.deepEqual(calls, ['launch-app']);
    await driver.close(new AbortController().signal);
  } finally {
    await driver.close(new AbortController().signal).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects booted aliases from defaults before any device command', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-explicit-id-'));
  let calls = 0;
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, defaultUdid: 'booted', runner: async args => {
    calls++;return {stdout:commandEnvelope(args),stderr:'',exitCode:0};
  } });
  const { device: _device, ...withoutDevice } = scenario;
  try {
    await assert.rejects(driver.prepare(withoutDevice,new AbortController().signal),/dedicated simulator UUID/);
    assert.equal(calls,0);
  } finally {await driver.close(new AbortController().signal);await rm(root,{recursive:true,force:true});}
});

function verboseActionEnvelope(capturePayload?: unknown): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.ui-action-result', schemaVersion: '3', didError: false, error: null,
    data: { summary: { status: 'SUCCEEDED' }, action: { type: 'tap', elementRef: 'e1' }, artifacts: { simulatorId: udid },
      ...(capturePayload ? { capture: capturePayload } : {}) } });
}

const settledFullCapture = { type: 'runtime-snapshot', protocol: 'rs/1', screenHash: 'after', seq: 9,
  capturedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
  elements: [{ ref: 'e7', role: 'text', label: 'Settled', frame: { x: 0, y: 0, width: 100, height: 20 },
    state: { enabled: true, visible: true }, actions: [] }] };

test('with reuse enabled, actions request the settled capture and return it, with its screenshot, as the next observation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-reuse-'));
  const shot = join(root, 'shot.png');
  await writeFile(shot, Buffer.from([0x89, 0x50]));
  const calls: string[][] = [];
  const runner: CliRunner = async args => {
    calls.push(args);
    if (args.includes('tap')) return { stdout: verboseActionEnvelope(settledFullCapture), stderr: '', exitCode: 0 };
    if (args.includes('screenshot')) return { stdout: envelope({ artifacts: { screenshotPath: shot }, capture: { format: 'image/png' } }), stderr: '', exitCode: 0 };
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, capture: 'full', screenshots: true, reuseActionCapture: true });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const observed = await driver.observe(new AbortController().signal);
    const snapshotsBefore = calls.filter(args => args.includes('snapshot-ui')).length;
    const next = await driver.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, new AbortController().signal);
    assert.ok(calls.find(args => args.includes('tap'))!.includes('--verbose'));
    assert.equal(next?.reusedFromAction, true);
    assert.equal(next?.screenHash, 'after');
    assert.equal(next?.elements[0]?.label, 'Settled');
    assert.equal(next?.screenshotPath, shot);
    assert.equal(calls.filter(args => args.includes('snapshot-ui')).length, snapshotsBefore, 'no extra capture after the action');
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('an action without a settled capture returns nothing, so the run captures again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-no-settle-'));
  const runner: CliRunner = async args => args.includes('tap')
    ? { stdout: verboseActionEnvelope(), stderr: '', exitCode: 0 }
    : { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, capture: 'full', reuseActionCapture: true });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const observed = await driver.observe(new AbortController().signal);
    assert.equal(await driver.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, new AbortController().signal), undefined);
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('observe starts the capture and the screenshot together, and can check they show the same screen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-concurrent-'));
  const shot = join(root, 'shot.png');
  await writeFile(shot, Buffer.from([0x89, 0x50]));
  let inFlight = 0, peak = 0;
  const runner: CliRunner = async args => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(done => setTimeout(done, 20));
    inFlight--;
    if (args.includes('screenshot')) return { stdout: envelope({ artifacts: { screenshotPath: shot }, capture: { format: 'image/png' } }), stderr: '', exitCode: 0 };
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, screenshots: true, verifyScreenshotAgreement: true });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const observed = await driver.observe(new AbortController().signal);
    assert.equal(peak, 2);
    assert.equal(observed.screenshotPath, shot);
    assert.equal(observed.screenshotAgreement, true);
    assert.ok((observed.verifyMs ?? -1) >= 0);
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('the default runner executes the pinned MobileBuildMCP CLI with Node, not npx', async () => {
  const { pinnedMobileBuildMcpCli } = await import('../src/device/index.js');
  assert.match(pinnedMobileBuildMcpCli(), /node_modules\/mobilebuildmcp\/build\/cli\.js$/);
  const { readFile: read } = await import('node:fs/promises');
  const pinned = JSON.parse(await read(join(pinnedMobileBuildMcpCli(), '../../package.json'), 'utf8')) as { version: string };
  assert.equal(pinned.version, '2.7.1');
});

test('capture reuse is off by default, so actions stay non-verbose and the run captures again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-reuse-off-'));
  const calls: string[][] = [];
  const runner: CliRunner = async args => {
    calls.push(args);
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, capture: 'full' });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const observed = await driver.observe(new AbortController().signal);
    assert.equal(await driver.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, new AbortController().signal), undefined);
    assert.ok(!calls.find(args => args.includes('tap'))!.includes('--verbose'));
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('launch arguments go to MobileBuildMCP as JSON, so a leading hyphen is not read as a CLI flag', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-launch-args-'));
  const calls: string[][] = [];
  const runner: CliRunner = async args => { calls.push(args); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 }; };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare({ app: { bundleId: 'com.example.app', launchArgs: ['-of-evidence-gallery'] }, device: { udid } },
      new AbortController().signal);
    const launch = calls.find(args => args.includes('launch-app'))!;
    assert.deepEqual(JSON.parse(launch[launch.indexOf('--json') + 1]!), { launchArgs: ['-of-evidence-gallery'] });
    await driver.close(new AbortController().signal);
    calls.length = 0;
    await driver.prepare(scenario, new AbortController().signal);
    assert.ok(!calls.find(args => args.includes('launch-app'))!.includes('--json'));
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('an acknowledged stop failure (the app already exited) still releases the lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-stop-dead-'));
  const failedStop = JSON.stringify({ schema: 'mobilebuildmcp.output.stop-result', schemaVersion: '2', didError: true,
    error: 'App is not running', data: { summary: { status: 'FAILED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
  const runner: CliRunner = async args => args.includes('stop')
    ? { stdout: failedStop, stderr: '', exitCode: 1 }
    : { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  const first = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  const second = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    await first.close(new AbortController().signal);
    await second.prepare(scenario, new AbortController().signal);
  } finally { await second.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('measurement mode never leaves the run holding references from an older capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-verify-retry-'));
  const shot = join(root, 'shot.png');
  await writeFile(shot, Buffer.from([0x89, 0x50]));
  const hashes = ['moving-1', 'moving-2', 'moving-3', 'settled', 'settled'];
  let captures = 0;
  const runner: CliRunner = async args => {
    if (args.includes('screenshot')) return { stdout: envelope({ artifacts: { screenshotPath: shot }, capture: { format: 'image/png' } }), stderr: '', exitCode: 0 };
    if (args.includes('snapshot-ui')) return { stdout: envelope(capture(hashes[Math.min(captures++, hashes.length - 1)])), stderr: '', exitCode: 0 };
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, screenshots: true, verifyScreenshotAgreement: true });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const observed = await driver.observe(new AbortController().signal);
    // Attempt 1 disagreed (moving-1 vs moving-2); attempt 2 disagreed (moving-3 vs settled); attempt 3 agreed.
    assert.equal(observed.screenshotAgreement, true);
    assert.equal(observed.verifyAttempts, 3);
    assert.equal(observed.screenHash, 'settled');
    captures = 0;
    hashes.splice(0, hashes.length, 'a', 'b', 'c', 'd', 'e', 'f');
    const neverSettles = await driver.observe(new AbortController().signal);
    assert.equal(neverSettles.screenshotAgreement, false);
    assert.equal(neverSettles.screenHash, 'f', 'the run gets the newest capture, the one MobileBuildMCP resolves references against');
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});
