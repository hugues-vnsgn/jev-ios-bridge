/**
 * Start mode "attach" (Issue 11, E2): a version 2 script with `"start": "attach"` runs from the screen already
 * showing. The run passes the start mode to the driver's `prepare`; the Android driver then skips its restart but
 * still takes the device lease, checks the app is installed and in front, and starts the log streams. The iOS
 * driver refuses attach with UNSUPPORTED_ACTION before any device work (Issue 14): MobileBuildMCP 2.7.1 can't tell
 * which app is in front, and attach must refuse unless the app under test is.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DeviceDriver, PrepareScenarioContext, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';
import { DeviceReasonError, MobileBuildMcpDriver, type CliRunner } from '../src/device/index.js';
import { resumedPackage } from '../src/device/attach.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AGENT_START_COMMAND, AndroidDriver, type AndroidDriverOptions } from '../src/device/android/driver.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { SCRIPTED_JEV_MODEL } from '../src/scripted/jev.js';
import { AGENT_CACHE, FakeAdb, fakeAgents, fakeClock, FakeStreams, type FakeEmulator } from './fixtures/android-device.js';

const signal = () => new AbortController().signal;
const reason = (code: string, vendorCode?: string) => (error: unknown) => {
  assert.ok(error instanceof DeviceReasonError, `a DeviceReasonError, not ${String(error)}`);
  assert.equal(error.code, code);
  assert.equal(error.vendorCode, vendorCode);
  return true;
};

// ---------------------------------------------------------------------------------------------------------------
// The run: no refusal, the start mode reaches prepare and the started event.

const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
  assertions: [{ id: 'shown', claim: 'The marker is visible.' }] };
const iosV1 = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [checkpoint] };

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'attach', sequence: events.length + 1,
      at: new Date().toISOString(), type, data }); },
    async read() { return events; },
  };
}

const marker: Snapshot = { deviceId: 'sim', capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: 1, truncated: false,
  screenHash: 'screen-a', elements: [{ ref: 'e1', role: 'text', label: 'Marker',
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true }, actions: [] }] };

const judge: ScriptedJudge = { async judge() {
  return { probabilities: { shown: 0.99 }, inputTokens: 1, latencyMs: 1, model: SCRIPTED_JEV_MODEL };
} };

function recordingDriver(prepared: PrepareScenarioContext[]): DeviceDriver {
  return {
    async prepare(context) { prepared.push(structuredClone(context)); },
    async observe() { return marker; },
    async act() { throw new Error('unreachable'); },
    async close() {},
  };
}

async function run(script: Record<string, unknown>): Promise<{ prepared: PrepareScenarioContext[]; started: RunEvent; verdict: unknown }> {
  const prepared: PrepareScenarioContext[] = [];
  const log = recordingLog();
  const report = await runScriptedScenario({ runId: 'attach', scenario: parseScriptedScenario(script), driver: recordingDriver(prepared), log, judge });
  return { prepared, started: log.events.find(event => event.type === 'started')!, verdict: report.verdict };
}

test('a version 2 script with start: attach runs, and prepare and the started event get the start mode', async () => {
  const { prepared, started, verdict } = await run({ ...iosV1, version: 2, start: 'attach' });
  assert.equal(verdict, 'passed');
  assert.deepEqual(prepared, [{ app: { bundleId: 'com.example.app' }, start: 'attach' }]);
  assert.equal(started.data.start, 'attach');
});

test('an explicit start: restart reaches prepare and the started event as restart', async () => {
  const { prepared, started } = await run({ ...iosV1, version: 2, start: 'restart' });
  assert.deepEqual(prepared, [{ app: { bundleId: 'com.example.app' }, start: 'restart' }]);
  assert.equal(started.data.start, 'restart');
});

test('a script with no start passes prepare no start mode and records none, exactly as before', async () => {
  const { prepared, started } = await run(iosV1);
  assert.deepEqual(prepared, [{ app: { bundleId: 'com.example.app' } }]);
  assert.equal(Object.hasOwn(started.data, 'start'), false);
});

test('an Android attach script passes the start mode too', async () => {
  const { prepared } = await run({ version: 2, platform: 'android', app: { package: 'com.example.android' }, values: {},
    start: 'attach', steps: [checkpoint] });
  assert.deepEqual(prepared, [{ app: { package: 'com.example.android' }, start: 'attach' }]);
});

// ---------------------------------------------------------------------------------------------------------------
// Android: no force-stop, no am start; the foreground check, the lease, the streams.

/** `dumpsys activity activities` on API 31, cut to the lines that name what is resumed. */
const activities = (front: string) => [
  'ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)',
  'Display #0 (activities from top to bottom):',
  `  * Task{8d1c2a1 #12 type=standard A=10226:${front} U=0 visible=true mode=fullscreen translucent=false sz=1}`,
  `    * Hist #0: ActivityRecord{6b9e1c4 u0 ${front}/.MainActivity t12}`,
  `  ResumedActivity:ActivityRecord{6b9e1c4 u0 ${front}/.MainActivity t12}`,
  '',
  ` topResumedActivity=ActivityRecord{6b9e1c4 u0 ${front}/.MainActivity t12}`,
  '',
].join('\n');

const api31 = (overrides: Partial<FakeEmulator> = {}): FakeEmulator => ({ serial: 'emulator-5554', avd: 'jev-actions-api31', ...overrides });
const androidAttach = { app: { package: 'com.example.android' }, start: 'attach' } as const;

/** The FakeAdb, plus an answer for `dumpsys activity activities` naming `front` as the resumed app. */
function withActivities(adb: FakeAdb, front: () => string | undefined): AdbRunner {
  return async (args, runSignal) => {
    if (args[0] === '-s' && args[2] === 'shell' && args[3] === "'dumpsys' 'activity' 'activities'") {
      adb.calls.push([...args]);
      const name = front();
      return { stdout: name === undefined ? 'ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)\n' : activities(name), stderr: '', exitCode: 0 };
    }
    return adb.run(args, runSignal);
  };
}

async function withAndroid(front: () => string | undefined, emulator: FakeEmulator,
  fn: (setup: { adb: FakeAdb; driver: AndroidDriver; root: string; streams: FakeStreams }) => Promise<void>,
  options: Partial<AndroidDriverOptions> = {}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-attach-android-'));
  const adb = new FakeAdb(emulator);
  const streams = new FakeStreams(adb);
  const ports = [49526, 49527];
  const driver = new AndroidDriver({ device: { avd: 'jev-actions-api31' }, runner: withActivities(adb, front),
    agentClient: fakeAgents(adb).agentClient, clock: fakeClock(), leaseRoot: join(root, 'lease'), screenshotFolder: root,
    freePort: async () => ports.shift()!, logcat: streams, logFolder: join(root, 'logs'), runId: 'attach-1',
    tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }), ...options });
  try { await fn({ adb, driver, root, streams }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

const shellLine = (call: string[]) => call[2] === 'shell' ? call[3] : undefined;

test('Android attach takes the lease, checks the app is in front, starts the streams and the agent, and never relaunches', async () => {
  await withAndroid(() => 'com.example.android', api31(), async ({ adb, driver, root, streams }) => {
    await driver.prepare(androidAttach, signal());
    const lines = adb.calls.map(shellLine);
    assert.ok(lines.includes("'pm' 'path' 'com.example.android'"), 'the installed check still runs');
    assert.ok(lines.includes("'dumpsys' 'activity' 'activities'"), 'the foreground check runs');
    assert.ok(lines.includes(AGENT_START_COMMAND), 'the agent starts');
    assert.ok(!adb.calls.some(call => /force-stop|'am' 'start'|resolve-activity/.test(call.join(' '))), 'no restart command');
    assert.deepEqual(await readdir(join(root, 'lease')), ['JEV-ACTIONS-API31.lock'], 'the lease is held');
    assert.equal(streams.streams.length, 2, 'the app log and the events stream both start');
    assert.ok(lines.includes("'pidof' 'com.example.android'"), 'the running app\'s pid is read for the exit watch');
    assert.equal(driver.logSources().logcat, join(root, 'logs', 'attach-1.log'));
    await driver.close(signal());
    assert.ok(!adb.calls.some(call => /force-stop/.test(call.join(' '))), 'close leaves the attached app running');
    assert.deepEqual(await readdir(join(root, 'lease')), [], 'close releases the lease');
  });
});

test('Android attach checks the app is in front before it starts any stream', async () => {
  await withAndroid(() => 'com.example.android', api31(), async ({ adb, driver }) => {
    await driver.prepare(androidAttach, signal());
    const order = adb.calls.map(call => call[0] === '(logcat)' ? 'stream' : shellLine(call));
    assert.ok(order.indexOf("'dumpsys' 'activity' 'activities'") < order.indexOf('stream'));
    assert.ok(order.indexOf("'dumpsys' 'window' 'policy'") < order.indexOf("'dumpsys' 'activity' 'activities'"),
      'the screen is checked (and woken) first');
  });
});

test('Android attach refuses when another app is in front, before anything to undo, and releases the lease', async () => {
  await withAndroid(() => 'com.android.launcher3', api31(), async ({ adb, driver, root, streams }) => {
    await assert.rejects(driver.prepare(androidAttach, signal()), (error: unknown) =>
      reason('APP_NOT_IN_FOREGROUND')(error) &&
      /com\.example\.android isn't in front/.test((error as Error).message) && /com\.android\.launcher3/.test((error as Error).message) &&
      /"start": "restart"/.test((error as Error).message));
    assert.equal(streams.streams.length, 0);
    assert.ok(!adb.calls.some(call => shellLine(call) === AGENT_START_COMMAND));
    assert.deepEqual(await readdir(join(root, 'lease')), []);
  });
});

test('Android attach refuses when no activity is resumed', async () => {
  await withAndroid(() => undefined, api31(), async ({ driver }) => {
    await assert.rejects(driver.prepare(androidAttach, signal()), reason('APP_NOT_IN_FOREGROUND'));
  });
});

test('Android attach refuses an app that isn\'t installed with APP_NOT_INSTALLED, before the foreground check', async () => {
  await withAndroid(() => 'com.example.android', api31({ installed: ['com.other'] }), async ({ adb, driver }) => {
    await assert.rejects(driver.prepare(androidAttach, signal()), reason('APP_NOT_INSTALLED'));
    assert.ok(!adb.calls.some(call => shellLine(call) === "'dumpsys' 'activity' 'activities'"));
  });
});

test('Android restart, explicit or by default, still force-stops and launches and never reads the resumed activity', async () => {
  for (const start of ['restart', undefined] as const) {
    await withAndroid(() => 'com.example.android', api31(), async ({ adb, driver }) => {
      await driver.prepare({ app: { package: 'com.example.android' }, ...(start ? { start } : {}) }, signal());
      const lines = adb.calls.map(shellLine);
      assert.ok(lines.includes("'am' 'force-stop' 'com.example.android'"));
      assert.ok(lines.some(line => line?.startsWith("'am' 'start' '-W'")));
      assert.ok(!lines.includes("'dumpsys' 'activity' 'activities'"));
      await driver.close(signal());
    });
  }
});

test('the resumed package is read from topResumedActivity, else from a ResumedActivity line', () => {
  assert.equal(resumedPackage(activities('com.example.android')), 'com.example.android');
  assert.equal(resumedPackage('  mResumedActivity: ActivityRecord{1a2b u0 com.old.style/.Main t3}\n'), 'com.old.style');
  assert.equal(resumedPackage(' topResumedActivity=ActivityRecord{1 u0 com.top/.A t1}\n  ResumedActivity:ActivityRecord{2 u0 com.other/.B t2}\n'), 'com.top');
  assert.equal(resumedPackage('nothing resumed\n'), undefined);
});

// ---------------------------------------------------------------------------------------------------------------
// iOS: attach is refused before any device work; restart is unchanged.

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const iosAttach = { app: { bundleId: 'com.example.app' }, device: { udid }, start: 'attach' } as const;

function launched(): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.launch-result', schemaVersion: '2', didError: false, error: null,
    data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
}

function stopped(): string {
  return JSON.stringify({ schema: 'mobilebuildmcp.output.stop-result', schemaVersion: '2', didError: false, error: null,
    data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
}

function fakeRunner(calls: string[]): CliRunner {
  return async args => {
    const command = args.slice(0, 2).join(' ');
    calls.push(command);
    if (command === 'simulator launch-app') return { stdout: launched(), stderr: '', exitCode: 0 };
    if (command === 'simulator stop') return { stdout: stopped(), stderr: '', exitCode: 0 };
    throw new Error(`unexpected command ${command}`);
  };
}

async function withIos(fn: (setup: { driver: MobileBuildMcpDriver; calls: string[]; root: string }) => Promise<void>,
  options: { deviceWindow?: boolean } = {}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-attach-ios-'));
  const calls: string[] = [];
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: join(root, 'lease'), runner: fakeRunner(calls),
    ...(options.deviceWindow ? { deviceWindow: async () => { calls.push('window'); } } : {}) });
  try { await fn({ driver, calls, root }); }
  finally {
    await driver.close(signal()).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

const leaseFiles = async (root: string) => readdir(join(root, 'lease')).catch(() => []);

test('iOS attach is refused with UNSUPPORTED_ACTION before any device command, lease or window', async () => {
  for (const deviceWindow of [false, true]) {
    await withIos(async ({ driver, calls, root }) => {
      await assert.rejects(driver.prepare(iosAttach, signal()), (error: unknown) =>
        reason('UNSUPPORTED_ACTION')(error) && /Android/.test((error as Error).message) &&
        /"start": "restart"/.test((error as Error).message));
      assert.deepEqual(calls, [], 'no simulator command, no window');
      assert.deepEqual(await leaseFiles(root), [], 'no lease taken');
      assert.equal(driver.appRunning(), undefined);
      assert.deepEqual(driver.logSources(), {});
    }, { deviceWindow });
  }
});

test('an iOS attach run ends INCONCLUSIVE with UNSUPPORTED_ACTION and never touches the simulator', async () => {
  await withIos(async ({ driver, calls }) => {
    const log = recordingLog();
    const report = await runScriptedScenario({ runId: 'attach', log, judge, driver,
      scenario: parseScriptedScenario({ ...iosV1, version: 2, start: 'attach', device: { udid } }) });
    assert.equal(report.verdict, 'inconclusive');
    assert.equal(report.reason, 'UNSUPPORTED_ACTION');
    assert.deepEqual(calls, []);
  });
});

test('iOS restart, explicit or by default, still launches the app', async () => {
  for (const start of ['restart', undefined] as const) {
    await withIos(async ({ driver, calls }) => {
      await driver.prepare({ app: { bundleId: 'com.example.app' }, device: { udid }, ...(start ? { start } : {}) }, signal());
      assert.deepEqual(calls, ['simulator launch-app']);
    });
  }
});
