import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeService } from '../src/service.js';
import type { DeviceDriver } from '../src/contracts/index.js';
import { appLabel, type AppIdentity } from '../src/contracts/index.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';
import { createDriverFactory } from '../src/device/factory.js';
import { androidTools } from '../src/device/android/tools.js';
import { attachLogPane } from '../src/logpane/attach.js';
import { Capture } from './fixtures/capture.js';
import { readRunEvents } from '../src/log/index.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';

const screen = () => ({ deviceId: 'test', sequence: 1, capturedAt: Date.now(),
  expiresAt: Date.now() + 60_000, truncated: false,
  elements: [{ ref: 'marker', role: 'text', label: 'SCREEN_EVIDENCE_MARKER',
    frame: { x: 0, y: 0, width: 100, height: 30 },
    state: { visible: true, enabled: true }, actions: [] }],
});
const checkpoint = (id: string, claim = 'Marker visible') => ({
  id, kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'SCREEN_EVIDENCE_MARKER' }] },
  assertions: [{ id: 'shown', claim }],
});
async function until(check: () => boolean): Promise<void> {
  for (let tries = 0; !check(); tries++) {
    if (tries > 200) assert.fail('timed out waiting');
    await new Promise(done => setTimeout(done, 10));
  }
}
const script = (steps = [checkpoint('verify')]) => ({ version: 1, app: { bundleId: 'com.example.app' },
  values: {}, steps });

test('profile refusal precedes driver creation and a selected run keeps its binding after the file changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-profile-'));
  const udid = 'ABCDEF00-0000-4000-8000-000000000001';
  await mkdir(join(root, '.jev'));
  const file = join(root, '.jev/profiles.json');
  await writeFile(file, JSON.stringify({ version: 1, defaultProfile: 'ios', profiles: {
    ios: { platform: 'ios', deviceCategory: 'ios-simulator', device: udid, budgets: { startupMs: 2000 } },
  } }));
  let created = 0;
  let selectedDevice: unknown;
  const service = new BridgeService({ baseDir: join(root, 'runs'), env: { JEV_PROJECT_DIR: root },
    createDriver: scenario => {
      created++; selectedDevice = scenario.device;
      return { async prepare() {}, async observe() { return screen(); }, async act() {}, async close() {} };
    }, createJudge: () => ({ async judge() { return { probabilities: { shown: 1 }, inputTokens: 0, latencyMs: 0, model: 'jev-1.13.0' }; } }),
  });
  try {
    await assert.rejects(service.start(script(), {}, 'unknown'), { code: 'PROFILE_NOT_FOUND' });
    await assert.rejects(service.start(script(), { startupMs: 3000 }, 'ios'), { code: 'PROFILE_CONFLICT' });
    await assert.rejects(service.start({ ...script(), device: { udid: 'ABCDEF00-0000-4000-8000-000000000002' } }), { code: 'PROFILE_CONFLICT' });
    assert.equal(created, 0);
    assert.deepEqual(await readdir(root), ['.jev']);
    const { runId } = await service.start(script(), { startupMs: 1000 });
    assert.deepEqual(selectedDevice, { udid });
    await writeFile(file, '{');
    assert.equal((await service.status(runId, 2000)).report.verdict, 'passed');
    const recorded = (await readRunEvents(join(root, 'runs'), runId)).find(event => event.type === 'started')?.data.profile as { name: string; digest: string };
    assert.equal(recorded.name, 'ios');
    assert.match(recorded.digest, /^[0-9a-f]{64}$/);
    const reader = new BridgeService({ baseDir: join(root, 'runs'), createDriver: () => assert.fail(), createJudge: () => assert.fail() });
    assert.equal((await reader.status(runId)).report.verdict, 'passed');
    await reader.close();
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

for (const phase of ['startupMs', 'operationMs'] as const) {
  test(`${phase} ends stuck device work and still closes the driver`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'jev-service-deadline-'));
    let closed = false;
    let issuedSignal: AbortSignal | undefined;
    const stuck = (signal: AbortSignal): Promise<never> => { issuedSignal = signal; return new Promise(() => {}); };
    const service = new BridgeService({ baseDir: root, env: { JEV_PROJECT_DIR: root },
      createDriver: () => ({
        prepare: async (_scenario, signal) => { if (phase === 'startupMs') await stuck(signal); },
        observe: async signal => stuck(signal), async act() {}, async close() { closed = true; },
      }), createJudge: () => ({ async judge() { return assert.fail('No Jev call before a screen'); } }),
    });
    try {
      const { runId } = await service.start(script(), { [phase]: 1000, wallTimeMs: 4000 });
      const status = await service.status(runId, 2500);
      assert.equal(status.state, 'finished');
      assert.equal(status.report.reason, 'EXECUTION_ERROR');
      assert.equal(issuedSignal?.aborted, true);
      assert.equal(closed, true);
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test('cleanupMs uses the cleanup deadline while wallTimeMs remains the outer run limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-cleanup-budget-'));
  let cleanupSignal: AbortSignal | undefined;
  const service = new BridgeService({ baseDir: root, env: { JEV_PROJECT_DIR: root },
    createDriver: () => ({ async prepare() { return new Promise(() => {}); }, async observe() { return screen(); }, async act() {},
      async close(signal) { cleanupSignal = signal; return new Promise(() => {}); } }),
    createJudge: () => ({ async judge() { return assert.fail('Preparation never completes'); } }),
  });
  try {
    const { runId } = await service.start(script(), { startupMs: 3000, cleanupMs: 1000, wallTimeMs: 20 });
    const status = await service.status(runId, 2500);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.reason, 'CLEANUP_FAILED');
    assert.equal(cleanupSignal?.aborted, true);
    const errors = (await readRunEvents(root, runId)).filter(event => event.type === 'error');
    assert.equal(errors[0]?.data.code, 'WALL_LIMIT');
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('hand-back keeps the started profile binding after the file becomes invalid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-profile-handback-'));
  await mkdir(join(root, '.jev'));
  await writeFile(join(root, '.jev/config.json'), JSON.stringify({ drivenMode: true }));
  const profiles = join(root, '.jev/profiles.json');
  await writeFile(profiles, JSON.stringify({ version: 1, defaultProfile: 'ios', profiles: {
    ios: { platform: 'ios', deviceCategory: 'ios-simulator', device: 'ABCDEF00-0000-4000-8000-000000000001' },
  } }));
  const runs = join(root, 'runs');
  const service = new BridgeService({ baseDir: runs, env: { JEV_PROJECT_DIR: root, JEV_EXPERIMENTAL_DRIVEN: '1' },
    createDriver: () => ({ async prepare() {}, async observe() { return screen(); }, async act() {}, async close() {} }),
    createJudge: () => ({ async judge() { return assert.fail('The stopped run never reaches a checkpoint'); } }),
    createDrivenJudge: () => fakeDrivenJudge([{ choice: 'none_fits', confidence: 0.9 }]),
  });
  try {
    const { runId } = await service.start({ version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps: [
      { id: 'task', kind: 'do', intent: 'Continue', doneWhen: 'Home is shown', effect: 'none' }, checkpoint('verify'),
    ] }, { operationMs: 1000 });
    const pause = (await service.status(runId, 3000)).pause;
    assert.ok(pause);
    const binding = (await readRunEvents(runs, runId)).find(event => event.type === 'started')!.data.profile;
    await writeFile(profiles, '{');
    await service.resolve(runId, pause.pauseId, { kind: 'stop' });
    assert.equal((await service.status(runId, 3000)).report.reason, 'STOPPED_BY_CLAUDE');
    assert.deepEqual((await readRunEvents(runs, runId)).find(event => event.type === 'started')!.data.profile, binding);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('scripted start returns a recoverable run id and report reflects assertion verdict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-'));
  let closed = false;
  const driver: DeviceDriver = {
    async prepare() {}, async observe() { return screen(); },
    async act() { assert.fail('A checkpoint-only script must not act'); },
    async close() { closed = true; },
  };
  const judge: ScriptedJudge = { async judge() { return { probabilities: { shown: 1 },
    inputTokens: 42, latencyMs: 1, model: 'jev-1.13.0' }; } };
  const options = { baseDir: root, createDriver: () => driver, createJudge: () => judge };
  const service = new BridgeService(options);
  try {
    const start = await service.start(script());
    assert.match(start.watchUrl, /127\.0\.0\.1/);
    const status = await service.status(start.runId, 2_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'passed');
    assert.equal(status.report.inputTokens, 42);
    assert.equal(status.report.checkpoints[0]?.stepId, 'verify');
    assert.ok(closed);
    const reader = new BridgeService(options);
    assert.equal((await reader.status(start.runId)).report.verdict, 'passed');
    await reader.close();
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('an Android scenario gives its driver a package identity, never a bundle ID', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-android-'));
  let preparedApp: AppIdentity | undefined;
  const driver: DeviceDriver = {
    async prepare(scenario) { preparedApp = scenario.app; }, async observe() { return screen(); },
    async act() { assert.fail('A checkpoint-only script must not act'); },
    async close() {},
  };
  const judge: ScriptedJudge = { async judge() { return { probabilities: { shown: 1 },
    inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } };
  const service = new BridgeService({ baseDir: root, createDriver: () => driver, createJudge: () => judge });
  try {
    const androidScript = { version: 1, platform: 'android', app: { package: 'com.example.app' },
      device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint('verify')] };
    const start = await service.start(androidScript);
    const status = await service.status(start.runId, 2_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'passed');
    assert.deepEqual(preparedApp, { package: 'com.example.app' });
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('an Android scenario reaches the Android driver through the real driver factory, and ends at ANDROID_TOOLS_UNAVAILABLE without adb', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-android-refused-'));
  const empty = join(root, 'empty');
  await mkdir(empty);
  const judge: ScriptedJudge = { async judge() { return assert.fail('Jev is never asked when prepare fails'); } };
  // The real tools check, with ANDROID_HOME, ANDROID_SDK_ROOT, PATH and the home folder all empty.
  const tools = () => androidTools({ environment: { ANDROID_HOME: empty, ANDROID_SDK_ROOT: empty, PATH: empty }, home: empty });
  const createDriver = createDriverFactory({ mobileBuildMcp: { cwd: root, lockRoot: root }, android: { leaseRoot: root, tools } });
  const service = new BridgeService({ baseDir: root, createDriver, createJudge: () => judge });
  try {
    const androidScript = { version: 1, platform: 'android', app: { package: 'com.example.app' },
      device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint('verify')] };
    const start = await service.start(androidScript);
    const status = await service.status(start.runId, 2_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.reason, 'ANDROID_TOOLS_UNAVAILABLE');
    assert.equal((await readdir(root)).some(name => name.endsWith('.lock')), false, 'no lease taken');
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('service redacts supplied values and keeps a global scripted step budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-service-'));
  let prepares = 0, closes = 0;
  const service = new BridgeService({ baseDir: root,
    createDriver: () => ({
      async prepare() { prepares++; }, async observe() { return screen(); },
      async act() { assert.fail('A checkpoint-only script must not act'); },
      async close() { closes++; },
    }),
    createJudge: () => ({ async judge() { return { probabilities: { shown: 1 },
      inputTokens: 10, latencyMs: 1, model: 'jev-1.13.0' }; } }),
  });
  const scenario = { ...script([checkpoint('first', 'private-one visible'),
    checkpoint('second', 'private-two visible')]),
    values: { first: 'private-one', second: 'private-two' } };
  try {
    const { runId } = await service.start(scenario, { maxSteps: 1 });
    const status = await service.status(runId, 2_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.events.filter(event => event.type === 'checkpoint').length, 1);
    assert.equal(prepares, 1);
    assert.equal(closes, 1);
    assert.doesNotMatch(JSON.stringify(status.report), /private-one|private-two/);
    await assert.rejects(service.start(scenario, { maxSteps: 101 }));
    assert.equal(prepares, 1);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('public service rejects legacy autonomous scenarios before creating a device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-legacy-rejection-'));
  let created = 0;
  const service = new BridgeService({ baseDir: root,
    createDriver: () => { created++; throw new Error('Device should not be created'); },
    createJudge: () => { throw new Error('Judge should not be created'); },
  });
  try {
    for (const scenario of [
      { app: { bundleId: 'com.example.app' }, goal: 'Marker visible', values: {},
        assertions: [{ id: 'shown', claim: 'Marker visible' }] },
      { app: { bundleId: 'com.example.app' }, checkpoints: [
        { id: 'first', goal: 'Marker visible', assertions: [{ id: 'shown', claim: 'Marker visible' }] }] },
    ]) await assert.rejects(service.start(scenario));
    assert.equal(created, 0);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('createDriver builds a driver per run from that run\'s scenario, and the run reads the tap alias rule from it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-driver-per-scenario-'));
  const label = 'Contact photo for Nolan Ames';
  const button = { role: 'button', label, frame: { x: 22, y: 112, width: 40, height: 40 },
    state: { visible: true, enabled: true }, actions: ['tap'] };
  const aliased = () => ({ ...screen(), elements: [...screen().elements,
    { ref: 'e30', ...button }, { ref: 'e117', ...button }] });
  const tapScript = (bundleId: string) => ({ version: 1, app: { bundleId }, values: {}, steps: [{ id: 'open', kind: 'action',
    guard: { present: [{ role: 'text', label: 'SCREEN_EVIDENCE_MARKER' }] },
    action: { kind: 'tap', selector: { role: 'button', label } } }, checkpoint('verify')] });
  const built: string[] = [];
  const taps: string[] = [];
  const service = new BridgeService({ baseDir: root,
    createDriver: (scenario) => {
      built.push(appLabel(scenario.app));
      const driver: DeviceDriver = {
        async prepare() {}, async observe() { return aliased(); },
        async act(action) { taps.push(`${scenario.app.bundleId}:${action.targetRef}`); },
        async close() {},
      };
      return scenario.app.bundleId === 'com.example.pinned' ? { ...driver, tapAliasRule: 'mobilebuildmcp-2.7.1' } : driver;
    },
    createJudge: () => ({ async judge() { return { probabilities: { shown: 1 },
      inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } }),
  });
  try {
    const pinned = await service.start(tapScript('com.example.pinned'));
    assert.equal((await service.status(pinned.runId, 2_000)).report.verdict, 'passed');
    const strict = await service.start(tapScript('com.example.strict'));
    const status = await service.status(strict.runId, 2_000);
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.reason, 'TARGET_AMBIGUOUS');
    assert.deepEqual(built, ['com.example.pinned', 'com.example.strict']);
    assert.deepEqual(taps, ['com.example.pinned:e30']);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('the driver is built with the run\'s own ID, and the pane follows its logcat file and notes its problem', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-run-id-'));
  const logcat = join(root, 'app.log');
  await writeFile(logcat, '2026-09-28 23:16:14.927 10226  9784  9784 I System.out: hello from the app\n');
  const runIds: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolveHeld => { release = resolveHeld; });
  const notices: string[] = [];
  const service = new BridgeService({ baseDir: root,
    createDriver: (_scenario, run) => {
      runIds.push(run.runId);
      return { async prepare() {}, async observe() { await held; return { ...screen(), elements: [] }; }, async act() {}, async close() {},
        logSources: () => ({ logcat }), appRunning: () => true, appProblem: () => ({ code: 'APP_NOT_RESPONDING', note: 'not responding' }) };
    },
    createJudge: () => ({ async judge() { return assert.fail('No judgment on an empty screen'); } }),
    logPane: { cliPath: '/bridge/cli.js', openWindow: false, onNotice: (_runId, text) => { notices.push(text); } },
  });
  const output = new Capture();
  try {
    const { runId } = await service.start({ version: 1, platform: 'android', app: { package: 'com.example.app' },
      values: {}, steps: [checkpoint('verify')] });
    assert.deepEqual(runIds, [runId]);
    await until(() => notices.length > 0);
    void attachLogPane(runId, output as unknown as NodeJS.WriteStream, { keepOpen: false });
    await until(() => output.text.includes('!! not responding'));
    release();
    const status = await service.status(runId, 2_000);
    assert.deepEqual([status.report.verdict, status.report.reason], ['inconclusive', 'APP_NOT_RESPONDING']);
    assert.match(output.text, new RegExp(`device log \\(logcat, the app's uid only\\): ${logcat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(output.text, /\[app\] hello from the app/);
  } finally { release(); await service.close(); await rm(root, { recursive: true, force: true }); }
});
