import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DeviceDriver, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { DeviceCliError, DeviceReasonError, MobileBuildMcpDriver, deviceWindowOpener, simulatorWindowCommand,
  type CliRunner, type DeviceWindowOpener } from '../src/device/index.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { SCRIPTED_JEV_MODEL } from '../src/scripted/jev.js';

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const scenario = { app: { bundleId: 'com.apple.Preferences' }, device: { udid } };

function launched(): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.launch-result', schemaVersion: '2', didError: false, error: null,
    data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
}

/** MobileBuildMCP's answer for a shut-down simulator: the app container check fails, so it says "not installed". */
function launchFailed(): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.launch-result', schemaVersion: '2', didError: true,
    error: 'App is not installed on the simulator.',
    data: { summary: { status: 'FAILED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
}

function listed(state: string, simulatorId = udid.toLowerCase()): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2', didError: false, error: null,
    data: { simulators: [
      { name: 'Other', simulatorId: 'AD6669D1-7E29-4430-8F8A-4C70B2AB1D24', state: 'Booted', isAvailable: true, runtime: 'iOS 18.6' },
      { name: 'Test iPhone', simulatorId, state, isAvailable: true, runtime: 'iOS 18.6' },
    ] } });
}

function stopped(): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.stop-result', schemaVersion: '2', didError: false, error: null,
    data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
}

/** A fake MobileBuildMCP: `list` answers `simulator list`, `launch` answers `simulator launch-app`. Records every call. */
function fakeRunner(answers: { list?: () => string; launch?: () => string }, calls: string[]): CliRunner {
  return async args => {
    const command = args.slice(0, 2).join(' ');
    calls.push(command);
    if (command === 'simulator list') {
      if (!answers.list) throw new Error('unexpected simulator list');
      return { stdout: answers.list(), stderr: '', exitCode: 0 };
    }
    if (command === 'simulator launch-app') {
      const stdout = (answers.launch ?? launched)();
      return { stdout, stderr: '', exitCode: JSON.parse(stdout).didError ? 1 : 0 };
    }
    if (command === 'simulator stop') return { stdout: stopped(), stderr: '', exitCode: 0 };
    throw new Error(`unexpected command ${command}`);
  };
}

async function withDriver(options: { list?: () => string; launch?: () => string; window?: DeviceWindowOpener; calls?: string[] },
  body: (driver: MobileBuildMcpDriver, calls: string[], root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-sim-window-'));
  const calls = options.calls ?? [];
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner: fakeRunner(options, calls),
    ...(options.window ? { deviceWindow: options.window } : {}) });
  try { await body(driver, calls, root); }
  finally {
    await driver.close(new AbortController().signal).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

const notBooted = (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_NOT_BOOTED' &&
  error.message.includes(udid) && error.message.includes(`xcrun simctl boot ${udid}`);

test('with the window on, prepare checks the simulator is booted, brings its window forward, then launches', async () => {
  const calls: string[] = [];
  await withDriver({ calls, list: () => listed('Booted'),
    window: async (id) => { calls.push(`window ${id}`); } }, async driver => {
    await driver.prepare(scenario, new AbortController().signal);
    assert.deepEqual(calls, ['simulator list', `window ${udid}`, 'simulator launch-app']);
    assert.deepEqual(driver.prepareWarnings(), []);
  });
});

test('a window that fails to open is a warning, never a failure', async () => {
  await withDriver({ list: () => listed('Booted'), window: async () => { throw new Error('open exited 1: secret detail'); } },
    async (driver, calls) => {
      await driver.prepare(scenario, new AbortController().signal);
      assert.deepEqual(calls, ['simulator list', 'simulator launch-app']);
      const warnings = driver.prepareWarnings();
      assert.equal(warnings.length, 1);
      assert.match(warnings[0]!, /Simulator window not opened/);
      // The opener's own message isn't recorded.
      assert.ok(!warnings[0]!.includes('secret detail'));
    });
});

test('with the window on, a shut-down simulator is refused as DEVICE_NOT_BOOTED before the window opens or the app launches', async () => {
  let opened = 0;
  await withDriver({ list: () => listed('Shutdown'), window: async () => { opened++; } }, async (driver, calls, root) => {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal), notBooted);
    assert.equal(opened, 0, 'opening Simulator on a shut-down device would boot it');
    assert.deepEqual(calls, ['simulator list']);
    // The lease is released, so another driver can take the device.
    const next = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner: fakeRunner({}, []) });
    await next.prepare(scenario, new AbortController().signal);
    await next.close(new AbortController().signal);
  });
});

test('a simulator still booting is DEVICE_NOT_BOOTED too', async () => {
  await withDriver({ list: () => listed('Booting'), window: async () => {} }, async driver => {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal), notBooted);
  });
});

test('with the window on and the state unreadable, the window stays closed with a warning and the app still launches', async () => {
  let opened = 0;
  for (const list of [() => 'not json', () => listed('Booted', 'AD6669D1-0000-0000-0000-000000000000')]) {
    await withDriver({ list, window: async () => { opened++; } }, async (driver, calls) => {
      await driver.prepare(scenario, new AbortController().signal);
      assert.deepEqual(calls, ['simulator list', 'simulator launch-app']);
      assert.equal(driver.prepareWarnings().length, 1);
      assert.match(driver.prepareWarnings()[0]!, /Simulator window not opened/);
    });
  }
  assert.equal(opened, 0);
});

test('with the window off, a successful launch sends no extra command and records no warning', async () => {
  await withDriver({}, async (driver, calls) => {
    await driver.prepare(scenario, new AbortController().signal);
    assert.deepEqual(calls, ['simulator launch-app']);
    assert.deepEqual(driver.prepareWarnings(), []);
  });
});

test('with the window off, a launch that fails on a shut-down simulator becomes DEVICE_NOT_BOOTED', async () => {
  await withDriver({ list: () => listed('Shutdown'), launch: launchFailed }, async (driver, calls) => {
    await assert.rejects(driver.prepare(scenario, new AbortController().signal), notBooted);
    assert.deepEqual(calls, ['simulator launch-app', 'simulator list']);
  });
});

test('a launch failure on a booted simulator, or with the state unreadable, keeps its own error', async () => {
  for (const list of [() => listed('Booted'), () => 'not json', () => { throw new Error('list crashed'); }]) {
    await withDriver({ list, launch: launchFailed }, async driver => {
      await assert.rejects(driver.prepare(scenario, new AbortController().signal),
        (error: unknown) => error instanceof DeviceCliError && error.code === 'DEVICE_ERROR');
    });
  }
});

test('the window command opens Simulator on the run\'s device', () => {
  assert.deepEqual(simulatorWindowCommand(udid), ['open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]]);
});

test('the window is on by default, off with --no-device-window or JEV_DEVICE_WINDOW=off', () => {
  assert.equal(typeof deviceWindowOpener(false, {}), 'function');
  assert.equal(typeof deviceWindowOpener(false, { JEV_DEVICE_WINDOW: 'on' }), 'function');
  assert.equal(deviceWindowOpener(true, {}), undefined);
  assert.equal(deviceWindowOpener(false, { JEV_DEVICE_WINDOW: 'off' }), undefined);
});

function memoryLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'window-1', sequence: events.length + 1,
      at: new Date().toISOString(), type, data }); },
    async read() { return events; } };
}

const script: ScriptedScenario = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [
  { id: 'home', kind: 'checkpoint', guard: { present: [{ label: 'Home' }] }, assertions: [{ id: 'home', claim: 'Home is shown' }] },
] };
const home: Snapshot = { deviceId: 'sim', capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: 1, truncated: false,
  elements: [{ ref: 'h', role: 'text', label: 'Home', actions: [], frame: { x: 0, y: 0, width: 100, height: 30 },
    state: { enabled: true, visible: true } }] };
const judge = { async judge() { return { probabilities: { home: 0.97 }, inputTokens: 1, latencyMs: 1, model: SCRIPTED_JEV_MODEL }; } };

test('a run records prepare warnings on its prepared event, and nothing when there are none', async () => {
  const driver = (warnings?: string[]): DeviceDriver => ({ async prepare() {}, async observe() { return home; },
    async act() {}, async close() {}, ...(warnings ? { prepareWarnings: () => warnings } : {}) });
  const preparedOf = async (subject: DeviceDriver) => {
    const log = memoryLog();
    const report = await runScriptedScenario({ runId: 'window-1', scenario: script, driver: subject, judge, log });
    assert.equal(report.verdict, 'passed', report.reason);
    return log.events.find(event => event.type === 'prepared')!.data;
  };
  assert.deepEqual((await preparedOf(driver(['Simulator window not opened: could not open Simulator']))).warnings,
    ['Simulator window not opened: could not open Simulator']);
  assert.deepEqual(Object.keys(await preparedOf(driver([]))), ['prepareDurationMs']);
  assert.deepEqual(Object.keys(await preparedOf(driver())), ['prepareDurationMs']);
});

test('a run on a shut-down simulator ends inconclusive with DEVICE_NOT_BOOTED, not DEVICE_ERROR', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-sim-window-run-'));
  try {
    const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, defaultUdid: udid,
      runner: fakeRunner({ list: () => listed('Shutdown'), launch: launchFailed }, []) });
    const log = memoryLog();
    const report = await runScriptedScenario({ runId: 'window-1', scenario: script, driver, judge, log });
    assert.equal(report.verdict, 'inconclusive');
    assert.equal(report.reason, 'DEVICE_NOT_BOOTED');
    assert.equal(log.events.find(event => event.type === 'error')?.data.code, 'DEVICE_NOT_BOOTED');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the CLI takes --no-device-window on run only, and its help names it', { timeout: 20_000 }, async () => {
  const { execFile } = await import('node:child_process');
  const cli = join(process.cwd(), 'src/cli.ts');
  const execute = (args: string[]) => new Promise<{ code: number; stdout: string; stderr: string }>(done => {
    execFile(process.execPath, ['--import', import.meta.resolve('tsx'), cli, ...args],
      { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } },
      (error, stdout, stderr) => done({ code: error ? Number(error.code) : 0, stdout, stderr }));
  });
  const help = await execute(['--help']);
  assert.match(help.stdout, /--no-device-window/);
  assert.match(help.stdout, /JEV_DEVICE_WINDOW=off/);
  const report = await execute(['report', 'some-run', '--no-device-window']);
  assert.equal(report.code, 3);
  assert.match(report.stderr, /--no-device-window applies only to run/);
});
