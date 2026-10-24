/**
 * The Appium composition every entry point builds (P3.10): what the production host hands a driver, the order of its
 * refusals, and the pin that no entry point reaches MobileBuildMCP, mobilecli or the network.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ComposedAppiumDriver, productionAppiumHost, type AppiumHost } from '../src/appium/composition.js';
import { FrozenStack } from '../src/appium/stack.js';
import { Admission, AdmissionError } from '../src/device/admission.js';
import { createExitWatch } from '../src/device/android/exit-watch.js';
import { LOG_FOLDER } from '../src/device/android/logcat.js';
import { DeviceReasonError } from '../src/device/index.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { SERIAL } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, world } from './fixtures/appium-wire/world.js';
import { openMcpSession } from './fixtures/mcp-session.js';
import { stackRelease } from './fixtures/stack-release.js';

const ENTRY_MODULES = ['src/cli.ts', 'src/mcp/index.ts', 'src/mcp/observed.ts', 'src/capture.ts', 'src/observed/cli.ts', 'src/device/factory.ts', 'src/appium/composition.ts'];

test('no entry composition module names a pre-Appium driver or the module that builds them', () => {
  const legacy = /legacy-factory|android\/driver\.js|MobileBuildMcpDriver|createMobileBuildMcpDriver|\bAndroidDriver\b|observedDriverFactory/;
  assert.deepEqual(ENTRY_MODULES.filter(path => legacy.test(readFileSync(path, 'utf8'))), []);
  assert.ok(legacy.test(readFileSync('src/device/legacy-factory.ts', 'utf8')), 'the pattern finds the legacy factory itself');
});

/** The installed CLI composition in its own process with every process start and connection recorded. */
async function recorded(t: TestContext, platform: 'ios' | 'android', args: string[], scripts: Record<string, object> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-effects-')));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  mkdirSync(join(root, 'project'));
  for (const [name, script] of Object.entries(scripts)) writeFileSync(join(root, 'project', name), JSON.stringify(script));
  const worlds = [platform === 'ios' ? world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 120, 200, 40] }]) })
    : world('android', { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] }]) })];
  const { TYPESAFE_API_KEY: _key, JEV_DEVICE_UDID: _udid, JEV_ANDROID_DEVICE: _device, ...inherited } = process.env;
  const log = join(root, 'effects.jsonl');
  const result = await new Promise<{ code: number | null; stderr: string }>(done => {
    execFile(process.execPath, ['--import', 'tsx', 'tests/fixtures/appium-wire/cli-entry.ts', root], { timeout: 60_000, env: { ...inherited, JEV_TEST_PLATFORM: platform,
      JEV_TEST_WORLDS: JSON.stringify(worlds), JEV_TEST_CLI_ARGS: JSON.stringify(args), JEV_TEST_EFFECT_LOG: log, JEV_LOG_PANE: 'off', JEV_DEVICE_WINDOW: 'off',
      TYPESAFE_API_KEY: 'synthetic-key-not-for-children' } }, (error, _stdout, stderr) => done({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stderr }));
  });
  const effects = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { kind: string; file?: string; args?: string[]; target?: unknown });
  return { ...result, effects, root };
}
/** The only process an entry point may start here: its private MCP child, as the world host serves it. */
const privateChild = (effect: { kind: string; file?: string; args?: string[] }) => effect.kind === 'spawn' && effect.file === process.execPath
  && (effect.args ?? []).some(arg => arg.endsWith('tests/fixtures/appium-wire/world-mcp.ts'));
/** The read-only start-time lookup that records a host process's identity. */
const startTime = (effect: { kind: string; file?: string; args?: string[] }) => effect.kind === 'execFileSync' && effect.file === '/bin/ps'
  && effect.args?.length === 4 && effect.args[0] === '-p' && /^\d+$/.test(effect.args[1]!) && effect.args[2] === '-o' && effect.args[3] === 'lstart=';

test('`run` and `capture` on the installed composition start only their private MCP child, and make no connection or request', { timeout: 120_000 }, async t => {
  const script = { version: 1, app: { bundleId: 'example.app' }, device: { udid: UDID }, values: {},
    steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] };
  const run = await recorded(t, 'ios', ['run', 'script.json', '--no-log-pane'], { 'script.json': script });
  const capture = await recorded(t, 'android', ['capture', '--serial', SERIAL]);
  assert.deepEqual([run.code, capture.code], [0, 0], run.stderr + capture.stderr);
  for (const { effects } of [run, capture]) {
    assert.deepEqual(effects.filter(effect => !privateChild(effect) && !startTime(effect)), [], 'no MobileBuildMCP, mobilecli, adb, simctl or network effect');
    assert.equal(effects.filter(privateChild).length, 1);
  }
});

test('MCP start_scenario on the installed composition starts only the private MCP child', { timeout: 60_000 }, async t => {
  const log = join(realpathSync(mkdtempSync(join(tmpdir(), 'appium-mcp-effects-'))), 'effects.jsonl');
  t.after(() => rmSync(join(log, '..'), { recursive: true, force: true }));
  writeFileSync(log, '');
  const session = await openMcpSession('appium-effects', { fixture: 'tests/fixtures/appium-wire/cli-entry.ts', env: { JEV_TEST_EFFECT_LOG: log, JEV_DEVICE_UDID: UDID,
    JEV_TEST_WORLDS: JSON.stringify([world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 120, 200, 40] }]) })]),
    JEV_LOG_PANE: 'off', JEV_DEVICE_WINDOW: 'off', TYPESAFE_API_KEY: 'synthetic-key-not-for-children' } });
  try {
    const scenario = { version: 1, app: { bundleId: 'example.app' }, values: {},
      steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] };
    const { runId } = JSON.parse((await session.callTool('start_scenario', { scenario })).content[0].text) as { runId: string };
    assert.match((await session.callTool('get_report', { runId, waitMs: 45_000 })).content[0].text as string, /^Status: finished\nRun \S+: passed/);
  } finally { await session.close(); }
  const effects = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { kind: string; file?: string; args?: string[] });
  assert.deepEqual([effects.filter(effect => !privateChild(effect) && !startTime(effect)), effects.filter(privateChild).length], [[], 1]);
});

/** A fake Android SDK whose `adb` the tools check finds; nothing ever runs it. */
function fakeSdk(t: TestContext) {
  const sdk = realpathSync(mkdtempSync(join(tmpdir(), 'jev-fake-sdk-')));
  t.after(() => rmSync(sdk, { recursive: true, force: true }));
  mkdirSync(join(sdk, 'platform-tools'));
  writeFileSync(join(sdk, 'platform-tools', 'adb'), '#!/bin/sh\nexit 99\n');
  chmodSync(join(sdk, 'platform-tools', 'adb'), 0o755);
  return sdk;
}

test('the production host gives an Android driver the found adb\'s SDK, the legacy log folder, logcat and the exit watch, the store it opens, and a private HOME root', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  const sdk = fakeSdk(t);
  const store = Admission.forTesting({ root: realpathSync(mkdtempSync(join(tmpdir(), 'jev-host-store-'))), backend: 'fake', durability: 'fast' });
  const host = productionAppiumHost({ environment: { ANDROID_HOME: sdk, PATH: '/nonexistent' }, stack: FrozenStack.forTesting(release), openAdmission: () => store });
  const parts = await host({ target: { platform: 'android', device: SERIAL, serverInstallation: { kind: 'install' } } });
  assert.deepEqual({ target: parts.target, backend: parts.backend, logFolder: parts.logFolder, homeRoot: parts.homeRoot, watch: parts.createExitWatch === createExitWatch,
    store: parts.admission === store, wda: parts.stack.manifest.wda.version },
  { target: { platform: 'android', device: SERIAL, serverInstallation: { kind: 'install' }, androidSdkRoot: sdk }, backend: 'real', logFolder: LOG_FOLDER,
    homeRoot: join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge/homes'), watch: true, store: true, wda: '16.14.2' });
  const ios = await host({ target: { platform: 'ios', device: UDID, presentation: 'headless' } });
  assert.deepEqual([ios.target, ios.logFolder, ios.logcat, ios.createExitWatch], [{ platform: 'ios', device: UDID, presentation: 'headless' }, join(tmpdir(), 'jev-ios-logs'), undefined, undefined]);
});

test('an Android command with no adb refuses ANDROID_TOOLS_UNAVAILABLE before the stack is checked', async t => {
  const empty = realpathSync(mkdtempSync(join(tmpdir(), 'jev-no-sdk-')));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  // An Intel host refuses at its very first stack step, so reaching the stack would change the code.
  const stack = FrozenStack.forTesting({ ...stackRelease(), host: { platform: 'darwin', arch: 'x64', node: '24.0.0' } });
  const host = productionAppiumHost({ environment: { ANDROID_HOME: empty, ANDROID_SDK_ROOT: empty, PATH: empty }, home: empty, stack,
    openAdmission: () => assert.fail('no store') });
  await assert.rejects(host({ target: { platform: 'android', device: SERIAL, serverInstallation: { kind: 'install' } } }),
    (error: unknown) => error instanceof DeviceReasonError && error.code === 'ANDROID_TOOLS_UNAVAILABLE');
  await assert.rejects(host({ target: { platform: 'ios', device: UDID, presentation: 'visible' } }), { code: 'UNSUPPORTED_HOST' }, 'iOS reaches the stack check');
});

test('a composed driver revoked or closed before its first effect never builds its parts', async () => {
  let built = 0;
  const host: AppiumHost = async () => { built++; throw new Error('never built'); };
  const target = async () => ({ platform: 'ios' as const, device: UDID, presentation: 'visible' as const });
  const revoked = new ComposedAppiumDriver({ host, target });
  revoked.revokeIssuance();
  await assert.rejects(revoked.prepare({ app: { bundleId: 'example.app' } }, AbortSignal.timeout(1000)),
    (error: unknown) => error instanceof AdmissionError && error.code === 'DISPATCH_CLOSED');
  const closed = new ComposedAppiumDriver({ host, target });
  await closed.close(AbortSignal.timeout(1000));
  await assert.rejects(closed.capture(AbortSignal.timeout(1000)), (error: unknown) => error instanceof AdmissionError && error.code === 'DISPATCH_CLOSED');
  assert.equal(built, 0);
  const named = new ComposedAppiumDriver({ host, target });
  await assert.rejects(named.prepare({ app: { bundleId: 'example.app' } }, AbortSignal.timeout(1000)), /never built/);
  assert.equal(built, 1, 'the first effect builds the parts once');
});
