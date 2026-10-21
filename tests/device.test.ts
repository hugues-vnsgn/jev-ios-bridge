import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { mkdirSync, realpathSync } from 'node:fs';
import { Admission } from '../src/device/admission.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ActionScenarioContext, DeviceDriver } from '../src/contracts/index.js';
import { DeviceCliError, DeviceReasonError, MobileBuildMcpDriver, StaleSnapshotError, parseSnapshot, type CliRunner } from '../src/device/index.js';
import { identityProbe } from '../src/device/android/probe.js';
import { fakeProbeSpawn } from './fixtures/adb-spawn.js';

const udid = 'ABCDEF00-0000-4000-8000-000000000001';
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
  if (args.includes('list')) return JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2', data: { simulators: [] } });
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

test('a missing simulator app refuses before admission, presentation or launch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-app-preflight-'));
  const effects: string[] = [];
  const fake = fakeProbeSpawn((_file, _args, child) => { child.exit(1); return undefined; });
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn,
    simulator: fakeSimulatorProbe(udid).simulatorSet });
  const driver = fakeDriver({ cwd: root, lockRoot: root, identityProbe: probe,
    deviceWindow: async () => { effects.push('window'); },
    runner: async args => { effects.push(args.join(' ')); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 }; } });
  try {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_ERROR' && error.vendorCode === 'APP_NOT_INSTALLED');
    assert.deepEqual(effects, []);
    assert.equal(Admission.forTesting({ root: realpathSync(join(root, 'admission')), backend: 'fake' }).inspect(udid), undefined);
    assert.deepEqual(fake.calls.map(call => [call.file, call.args]), [
      ['/usr/bin/xcrun', ['simctl', '--set', '/fake/CoreSimulator/Devices', 'get_app_container', udid, 'com.apple.Preferences', 'app']],
    ]);
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('an installed-app reply is read after identity and recorded in the admission intent before effects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-app-intent-'));
  const order: string[] = [];
  const listing = fakeSimulatorProbe(udid);
  const fake = fakeProbeSpawn(() => { order.push('app'); return '/Applications/Preferences.app\n'; });
  const probe = identityProbe({ adb: '/fake/adb', environment: { SIMCTL_DEVICE_SET_PATH: '/other-set', TYPESAFE_API_KEY: 'sentinel-key' },
    spawn: fake.spawn, simulator: async signal => { order.push('identity'); return listing.simulatorSet(signal); } });
  const driver = fakeDriver({ cwd: root, lockRoot: root, runId: 'app-intent', identityProbe: probe,
    deviceWindow: async () => { order.push('window'); },
    runner: async args => { order.push('effect'); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 }; } });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    assert.deepEqual(order.slice(0, 2), ['identity', 'app']);
    assert.ok(order.indexOf('effect') > order.indexOf('app'));
    const intent = Admission.forTesting({ root: realpathSync(join(root, 'admission')), backend: 'fake' })
      .readAttempt({ kind: 'legacy', id: 'app-intent' })?.intent;
    assert.ok(intent && typeof intent === 'object' && 'installedApp' in intent);
    assert.deepEqual(intent.installedApp, { kind: 'installed', reply: '/Applications/Preferences.app\n' });
    assert.deepEqual(fake.calls.map(call => [call.file, call.args, call.options.env]), [
      ['/usr/bin/xcrun', ['simctl', '--set', '/fake/CoreSimulator/Devices', 'get_app_container', udid, 'com.apple.Preferences', 'app'], {}],
    ]);
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('a stalled installed-app probe refuses without admission or any effect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-app-timeout-'));
  const fake = fakeProbeSpawn(() => undefined);
  const effects: string[] = [];
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn, deadlineMs: 5, slowDeadlineMs: 5,
    simulator: fakeSimulatorProbe(udid).simulatorSet });
  const driver = fakeDriver({ cwd: root, lockRoot: root, identityProbe: probe,
    runner: async args => { effects.push(args.join(' ')); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 }; } });
  try {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_IDENTITY_UNAVAILABLE' && error.vendorCode === 'PROBE_TIMEOUT');
    assert.deepEqual(effects, []);
    assert.deepEqual(fake.children[0]?.killedBy, ['SIGTERM']);
    assert.equal(Admission.forTesting({ root: realpathSync(join(root, 'admission')), backend: 'fake' }).inspect(udid), undefined);
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('a simulator device set the effects would use, other than the default, refuses NONDEFAULT_DEVICE_SET before any effect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-set-'));
  const effects: string[] = [];
  const previous = process.env.SIMCTL_DEVICE_SET_PATH;
  process.env.SIMCTL_DEVICE_SET_PATH = root;
  const driver = fakeDriver({ cwd: root, lockRoot: root, identityProbe: fakeSimulatorProbe(udid),
    runner: async args => { effects.push(args.join(' ')); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 }; } });
  try {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_IDENTITY_UNAVAILABLE' && error.vendorCode === 'NONDEFAULT_DEVICE_SET');
    assert.deepEqual(effects, []);
  } finally {
    if (previous === undefined) delete process.env.SIMCTL_DEVICE_SET_PATH; else process.env.SIMCTL_DEVICE_SET_PATH = previous;
    await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true });
  }
});

test('a missing simulator identity refuses before the effect runner or admission', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-identity-'));
  const calls: string[][] = [];
  const driver = fakeDriver({ cwd: root, lockRoot: root, identityProbe: fakeSimulatorProbe(),
    runner: async args => { calls.push(args); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 }; } });
  try {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'DEVICE_NOT_FOUND');
    assert.deepEqual(calls, []);
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('a simulator shutting down during revalidation refuses before presentation or launch', async () => {
  for (const shutdownRead of [2, 3]) {
    const root = await mkdtemp(join(tmpdir(), 'jev-device-shutdown-'));
    const calls: string[][] = [];
    let reads = 0;
    const initial = fakeSimulatorProbe(udid);
    const probe = { ...initial, simulatorSet: async (abort: AbortSignal) => {
      const inventory = await initial.simulatorSet(abort);
      return ++reads >= shutdownRead ? { ...inventory, reply: inventory.reply.replaceAll('Booted', 'Shutdown') } : inventory;
    } };
    const driver = fakeDriver({ cwd: root, lockRoot: root, identityProbe: probe,
      runner: async args => { calls.push(args); return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 }; } });
    try {
      await assert.rejects(driver.prepare(scenario, new AbortController().signal),
        (error: unknown) => error instanceof Error && 'code' in error && error.code === 'DEVICE_NOT_BOOTED');
      assert.deepEqual(calls, []);
    } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
  }
});

test('runs pinned CLI actions in one workspace and normalizes compact captures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-test-'));
  const calls: string[][] = [];
  const runner: CliRunner = async (args) => {
    calls.push(args);
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, screenshots: true, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner: async args => {
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner: async args => {
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

test('cancelled tap closes issuance and a late acknowledgement cannot stop or unlock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-cancel-tap-'));
  let began!: () => void; let late!: (value: { stdout: string; stderr: string; exitCode: number }) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const pending = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { late = resolve; });
  const calls: string[] = []; let issuedSignal: AbortSignal | undefined;
  const runner: CliRunner = async (args, signal) => {
    calls.push(args[1]!);
    if (args[1] === 'tap') { issuedSignal = signal; began(); return pending; }
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
  try {
    const cancelled = new AbortController();
    await first.prepare(scenario, new AbortController().signal);
    const snapshot = await first.observe(new AbortController().signal);
    const operation = first.act({ kind: 'tap', targetRef: 'e1' }, snapshot, scenario, cancelled.signal);
    const rejected = assert.rejects(operation);
    await started; cancelled.abort();
    assert.equal(issuedSignal?.aborted, true);
    await rejected;
    const closing = first.close(new AbortController().signal);
    assert.strictEqual(first.close(new AbortController().signal), closing);
    await assert.rejects(closing, /unknown/);
    late({ stdout: commandEnvelope(['simulator', 'tap'], {}), stderr: '', exitCode: 0 });
    await new Promise(resolve => setImmediate(resolve));
    const before = [...calls];
    await assert.rejects(first.observe(new AbortController().signal));
    await assert.rejects(first.close(new AbortController().signal), /unknown/);
    await assert.rejects(second.prepare(scenario, new AbortController().signal), /DEVICE_QUARANTINED/);
    assert.deepEqual(calls, before);
    assert.ok(!calls.includes('stop'));
    assert.equal(firstStore(root).inspect(udid)?.state, 'quarantined');
  } finally {
    late({ stdout: commandEnvelope(['simulator', 'tap']), stderr: '', exitCode: 0 });
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
  const first = fakeDriver({ cwd: root, lockRoot: root, runner, uiCommandTimeoutMs: 20 });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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

test('cleanup deadline retains admission after pending CLI acknowledges and close is retried', async () => {
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
  const first = fakeDriver({ cwd: root, lockRoot: root, runner, uiCommandTimeoutMs: 1_000 });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    const observed = await first.observe(new AbortController().signal);
    const runAbort = new AbortController();
    const action = first.act({ kind: 'tap', targetRef: 'e1' }, observed, scenario, runAbort.signal);
    const rejected = assert.rejects(action);
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
    await rejected;
    await assert.rejects(first.close(new AbortController().signal), /unknown/);
    assert.equal(stops, 0);
    await assert.rejects(second.prepare(scenario, new AbortController().signal), /DEVICE_QUARANTINED/);
  } finally {
    finishAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('a late acknowledgement cannot finish cleanup or release admission without another close call', async () => {
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
  const first = fakeDriver({ cwd: root, lockRoot: root, runner, uiCommandTimeoutMs: 1_000 });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stops, 0);
    await assert.rejects(second.prepare(scenario, new AbortController().signal), /DEVICE_QUARANTINED/);
    assert.equal(firstStore(root).inspect(udid)?.state, 'quarantined');
  } finally {
    finishAction({ stdout: actionEnvelope(), stderr: '', exitCode: 0 });
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('an iOS lease left by an exited bridge process is retained without dispatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-stale-lock-'));
  const { spawnSync } = await import('node:child_process');
  const exited = spawnSync(process.execPath, ['-e', '0']).pid;
  await writeFile(join(root, `${udid}.lock`), JSON.stringify({ pid: exited, token: 'old' }));
  const driver = fakeDriver({ cwd: root, lockRoot: root,
    runner: async () => assert.fail('Dead holder cannot authorize device effects') });
  try {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal), /locked/);
    assert.equal(firstStore(root).inspect(udid)?.state, 'quarantined');
  } finally {
    await assert.rejects(driver.close(new AbortController().signal), /unknown/);
    await rm(root, { recursive: true, force: true });
  }
});

test('a lock held by a live process names its holder and the lock file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-live-lock-'));
  await writeFile(join(root, `${udid}.lock`), JSON.stringify({ pid: process.pid, token: 'other' }));
  const driver = fakeDriver({ cwd: root, lockRoot: root,
    runner: async args => ({ stdout: commandEnvelope(args), stderr: '', exitCode: 0 }) });
  try {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal), (error: unknown) =>
      error instanceof DeviceCliError && error.code === 'DEVICE_BUSY' &&
      error.message.includes(`bridge process ${process.pid}`) && error.message.includes(join(root, `${udid}.lock`)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unconfirmed app stop keeps admission and never dispatches a cleanup retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-stop-retry-'));
  let stopFails = true;
  const runner: CliRunner = async args => {
    if (args.includes('stop') && stopFails) throw new Error('stop transport failed');
    return { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  };
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
  try {
    await first.prepare(scenario, new AbortController().signal);
    await assert.rejects(first.close(new AbortController().signal));
    await assert.rejects(second.prepare(scenario, new AbortController().signal),
      (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_BUSY');
    stopFails = false;
    await assert.rejects(first.close(new AbortController().signal), /unknown/);
    await assert.rejects(second.prepare(scenario, new AbortController().signal), /DEVICE_QUARANTINED/);
  } finally {
    stopFails = false;
    await first.close(new AbortController().signal).catch(() => {});
    await second.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelled launch-app closes issuance and a late acknowledgement cannot stop or unlock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-cancel-launch-app-'));
  let began!: () => void; let late!: (value: { stdout: string; stderr: string; exitCode: number }) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const pending = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { late = resolve; });
  const calls: string[] = []; let issuedSignal: AbortSignal | undefined;
  const runner: CliRunner = async (args, signal) => {
    calls.push(args[1]!);
    if (args[1] === 'launch-app') { issuedSignal = signal; began(); return pending; }
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
  try {
    const cancelled = new AbortController();

    const operation = first.prepare(scenario, cancelled.signal);
    const rejected = assert.rejects(operation);
    await started; cancelled.abort();
    assert.equal(issuedSignal?.aborted, true);
    await rejected;
    const closing = first.close(new AbortController().signal);
    assert.strictEqual(first.close(new AbortController().signal), closing);
    await assert.rejects(closing, /unknown/);
    late({ stdout: commandEnvelope(['simulator', 'launch-app'], {}), stderr: '', exitCode: 0 });
    await new Promise(resolve => setImmediate(resolve));
    const before = [...calls];
    await assert.rejects(first.observe(new AbortController().signal));
    await assert.rejects(first.close(new AbortController().signal), /unknown/);
    await assert.rejects(second.prepare(scenario, new AbortController().signal), /DEVICE_QUARANTINED/);
    assert.deepEqual(calls, before);
    assert.ok(!calls.includes('stop'));
    assert.equal(firstStore(root).inspect(udid)?.state, 'quarantined');
  } finally {
    late({ stdout: commandEnvelope(['simulator', 'launch-app']), stderr: '', exitCode: 0 });
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelled snapshot-ui closes issuance and a late acknowledgement cannot stop or unlock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-cancel-snapshot-ui-'));
  let began!: () => void; let late!: (value: { stdout: string; stderr: string; exitCode: number }) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const pending = new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => { late = resolve; });
  const calls: string[] = []; let issuedSignal: AbortSignal | undefined;
  const runner: CliRunner = async (args, signal) => {
    calls.push(args[1]!);
    if (args[1] === 'snapshot-ui') { issuedSignal = signal; began(); return pending; }
    return { stdout: commandEnvelope(args, args.includes('snapshot-ui') ? capture() : {}), stderr: '', exitCode: 0 };
  };
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
  try {
    const cancelled = new AbortController();
    await first.prepare(scenario, new AbortController().signal);
    const operation = first.observe(cancelled.signal);
    const rejected = assert.rejects(operation);
    await started; cancelled.abort();
    assert.equal(issuedSignal?.aborted, true);
    await rejected;
    const closing = first.close(new AbortController().signal);
    assert.strictEqual(first.close(new AbortController().signal), closing);
    await assert.rejects(closing, /unknown/);
    late({ stdout: commandEnvelope(['simulator', 'snapshot-ui'], 'snapshot-ui' === 'snapshot-ui' ? capture() : {}), stderr: '', exitCode: 0 });
    await new Promise(resolve => setImmediate(resolve));
    const before = [...calls];
    await assert.rejects(first.observe(new AbortController().signal));
    await assert.rejects(first.close(new AbortController().signal), /unknown/);
    await assert.rejects(second.prepare(scenario, new AbortController().signal), /DEVICE_QUARANTINED/);
    assert.deepEqual(calls, before);
    assert.ok(!calls.includes('stop'));
    assert.equal(firstStore(root).inspect(udid)?.state, 'quarantined');
  } finally {
    late({ stdout: commandEnvelope(['simulator', 'snapshot-ui']), stderr: '', exitCode: 0 });
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
    const first = fakeDriver({ cwd: root, lockRoot: root, runner });
    const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
  try {
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(driver.prepare(scenario, cancelled.signal));
    assert.deepEqual(calls, []);
    await driver.prepare(scenario, new AbortController().signal);
    await assert.rejects(driver.observe(cancelled.signal));
    assert.deepEqual(calls, ['launch-app']);
    await assert.rejects(driver.close(new AbortController().signal), /unknown/);
  } finally {
    await driver.close(new AbortController().signal).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects booted aliases from defaults before any device command', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-explicit-id-'));
  let calls = 0;
  const driver = fakeDriver({ cwd: root, lockRoot: root, defaultUdid: 'booted', runner: async args => {
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner, capture: 'full', screenshots: true, reuseActionCapture: true });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner, capture: 'full', reuseActionCapture: true });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner, screenshots: true, verifyScreenshotAgreement: true });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner, capture: 'full' });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
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

test('the MobileBuildMCP driver refuses an Android app identity instead of launching an undefined bundle ID', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-android-identity-'));
  const runner: CliRunner = async args => ({ stdout: commandEnvelope(args), stderr: '', exitCode: 0 });
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner });
  try {
    await assert.rejects(driver.prepare({ app: { package: 'com.example.app' }, device: { udid } },
      new AbortController().signal),
      { message: 'The MobileBuildMCP driver only runs iOS scripts; this scenario has no app.bundleId' });
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('an acknowledged stop failure (the app already exited) still releases the lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-stop-dead-'));
  const failedStop = JSON.stringify({ schema: 'mobilebuildmcp.output.stop-result', schemaVersion: '2', didError: true,
    error: 'App is not running', data: { summary: { status: 'FAILED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
  const runner: CliRunner = async args => args.includes('stop')
    ? { stdout: failedStop, stderr: '', exitCode: 1 }
    : { stdout: commandEnvelope(args), stderr: '', exitCode: 0 };
  const first = fakeDriver({ cwd: root, lockRoot: root, runner });
  const second = fakeDriver({ cwd: root, lockRoot: root, runner });
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
  const driver = fakeDriver({ cwd: root, lockRoot: root, runner, screenshots: true, verifyScreenshotAgreement: true });
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

test('appRunning and appProblem answer from the console helper in the runtime log\'s name: undefined before launch or without one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-app-problem-'));
  const { spawn, spawnSync } = await import('node:child_process');
  const exited = spawnSync(process.execPath, ['-e', '0']).pid;
  const alive = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const launchedWith = (runtime: string | undefined) => {
    const runner: CliRunner = async (args) => ({
      stdout: commandEnvelope(args, args.includes('launch-app') && runtime ? { artifacts: { simulatorId: udid, runtimeLogPath: runtime } } : {}),
      stderr: '', exitCode: 0,
    });
    return fakeDriver({ cwd: root, lockRoot: root, runner });
  };
  const answers = async (runtime: string | undefined) => {
    const driver = launchedWith(runtime);
    const before = [driver.appRunning(), driver.appProblem()];
    await driver.prepare(scenario, new AbortController().signal);
    try { return { before, after: [driver.appRunning(), driver.appProblem()] }; }
    finally { await driver.close(new AbortController().signal); }
  };
  try {
    const exitedLog = join(root, `com.apple.Preferences_2026_helperpid${exited}_ownerpid1_abc.log`);
    assert.deepEqual(await answers(exitedLog), { before: [undefined, undefined], after: [false, {
      code: 'APP_EXITED', note: 'The app stopped unexpectedly: its console output ended while the run was still going.' }] });
    assert.deepEqual(await answers(join(root, `com.apple.Preferences_2026_helperpid${alive.pid}_ownerpid1_abc.log`)),
      { before: [undefined, undefined], after: [true, undefined] });
    assert.deepEqual(await answers(join(root, 'com.apple.Preferences_2026.log')), { before: [undefined, undefined], after: [undefined, undefined] });
    assert.deepEqual(await answers(undefined), { before: [undefined, undefined], after: [undefined, undefined] });
    const closed = launchedWith(exitedLog);
    await closed.prepare(scenario, new AbortController().signal);
    await closed.close(new AbortController().signal);
    assert.deepEqual([closed.appRunning(), closed.appProblem()], [undefined, undefined], 'nothing after close');
  } finally {
    alive.kill();
    await rm(root, { recursive: true, force: true });
  }
});

function fakeDriver(options: import('../src/device/index.js').MobileBuildMcpDriverOptions): MobileBuildMcpDriver {
  const storeRoot = join(options.cwd, 'admission');
  mkdirSync(storeRoot, { recursive: true, mode: 0o700 });
  const admission = Admission.forTesting({ root: realpathSync(storeRoot), backend: 'fake' });
  return new MobileBuildMcpDriver({ identityProbe: fakeSimulatorProbe(udid), ...options, admission,
    deviceWindow: options.deviceWindow ?? (async () => {}),
    fakeBackend: { runner: options.runner!, window: options.deviceWindow } });
}

function firstStore(root: string) { return Admission.forTesting({ root: realpathSync(join(root, 'admission')), backend: 'fake', initialize: false }); }

import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('the CLI prints CATEGORY_NOT_ENABLED for a physical iPhone UDID from the environment or the vendor file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-ios-phone-cli-'));
  try {
    await writeFile(join(root, 'scenario.json'), JSON.stringify({ version: 1, app: { bundleId: 'com.example.app' }, values: {},
      steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] }, assertions: [{ id: 'shown', claim: 'Visible' }] }] }));
    const { JEV_DEVICE_UDID: _unset, ...environment } = process.env;
    for (const [udid, vendorFile] of [['00008110-001A2C3E4F5A6B7C', undefined], [undefined, 'simulatorId: 0123456789abcdef0123456789abcdef01234567\n']]) {
      if (vendorFile) {
        await mkdir(join(root, '.mobilebuildmcp'));
        await writeFile(join(root, '.mobilebuildmcp/config.yaml'), vendorFile);
      }
      // A dummy key gets past the credentials check; the refusal comes before any service is built.
      const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), resolve('src/cli.ts'), 'run', 'scenario.json'], { cwd: root, encoding: 'utf8',
        env: { ...environment, TYPESAFE_API_KEY: 'fixture-only', JEV_PROJECT_DIR: root, JEV_RUNS_DIR: join(root, 'runs'), ...(udid ? { JEV_DEVICE_UDID: udid } : {}) } });
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.stderr, /^CATEGORY_NOT_ENABLED: Physical iPhone identity is not enabled$/m, udid ?? 'vendor file');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
