import { mkdirSync, realpathSync } from 'node:fs';
import { Admission } from '../src/device/admission.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { createDriverFactory } from '../src/device/factory.js';
import { DeviceReasonError, type CliRunner } from '../src/device/index.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import { AndroidDriver } from '../src/device/android/driver.js';
import { androidTools } from '../src/device/android/tools.js';
import { profileScenario } from '../src/profiles.js';

const udid = 'ABCDEF00-0000-4000-8000-000000000001';
const iosScript: ScriptedScenario = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [] };

test('profile conflicts compare names and refuse mixed kinds without device probes', () => {
  const scenario: ScriptedScenario = { version: 1, platform: 'android', app: { package: 'com.example.app' },
    device: { avd: 'Pixel_API_35' }, values: {}, steps: [] };
  const selected = { profile: { platform: 'android', deviceCategory: 'android-emulator', device: 'Pixel_API_35' },
    binding: { name: 'pixel', digest: 'a'.repeat(64) } } as const;
  assert.deepEqual(profileScenario(scenario, selected).device, { avd: 'Pixel_API_35' });
  for (const device of [{ avd: 'Different_AVD' }, { avd: 'pixel_api_35' }, { serial: 'emulator-5554' }]) {
    assert.throws(() => profileScenario({ ...scenario, device }, selected), { code: 'PROFILE_CONFLICT' });
  }
});

test('the factory records a selected profile binding in the admission intent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-profile-intent-'));
  const profile = { name: 'ios', digest: 'b'.repeat(64) };
  const runner: CliRunner = async args => ({ stdout: args.includes('launch-app') ? launched : stopped, stderr: '', exitCode: 0 });
  const options = fakeOptions({ cwd: root, lockRoot: root, defaultUdid: udid, runner });
  const driver = createDriverFactory({ mobileBuildMcp: options })(iosScript, { runId: 'profile-intent', profile });
  try {
    await driver.prepare({ app: iosScript.app }, new AbortController().signal);
    const attempt = options.admission.readAttempt({ kind: 'legacy', id: 'profile-intent' });
    assert.deepEqual((attempt?.intent as { profile: unknown }).profile, profile);
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

test('the vendor simulatorId fallback keeps selecting the device and suggests a profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-vendor-profile-'));
  await mkdir(join(root, '.mobilebuildmcp'));
  await writeFile(join(root, '.mobilebuildmcp/config.yaml'), `simulatorId: ${udid}\n`);
  const runner: CliRunner = async args => ({ stdout: args.includes('launch-app') ? launched : stopped, stderr: '', exitCode: 0 });
  const driver = createDriverFactory({ mobileBuildMcp: fakeOptions({ cwd: root, lockRoot: root, runner }) })(iosScript);
  try {
    await driver.prepare({ app: iosScript.app }, new AbortController().signal);
    assert.ok(driver.prepareWarnings?.().includes('Using .mobilebuildmcp/config.yaml simulatorId; consider a profile in .jev/profiles.json.'));
  } finally { await driver.close(new AbortController().signal); await rm(root, { recursive: true, force: true }); }
});

const launched = JSON.stringify({ schema: 'mobilebuildmcp.output.launch-result', schemaVersion: '2', didError: false, error: null,
  data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
const stopped = JSON.stringify({ schema: 'mobilebuildmcp.output.stop-result', schemaVersion: '2', didError: false, error: null,
  data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });

test('for an iOS script the factory builds the MobileBuildMCP driver from its options, carrying the pinned tap alias rule', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-factory-'));
  const calls: string[][] = [];
  const runner: CliRunner = async (args) => {
    calls.push(args);
    return { stdout: args.includes('launch-app') ? launched : stopped, stderr: '', exitCode: 0 };
  };
  try {
    const createDriver = createDriverFactory({ mobileBuildMcp: fakeOptions({ cwd: root, lockRoot: root, defaultUdid: udid, runner }) });
    const driver = createDriver(iosScript);
    assert.equal(driver.tapAliasRule, 'mobilebuildmcp-2.7.1');
    await driver.prepare({ app: iosScript.app }, new AbortController().signal);
    await driver.close(new AbortController().signal);
    const launch = calls.find(args => args.slice(0, 2).join(' ') === 'simulator launch-app');
    assert.ok(launch, 'the app is launched through the injected MobileBuildMCP runner');
    assert.deepEqual(launch.slice(2, 6), ['--simulator-id', udid, '--bundle-id', 'com.example.app']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the driver is built per scenario, never shared across the process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-factory-scoped-'));
  try {
    const runner: CliRunner = async () => ({ stdout: '{}', stderr: '', exitCode: 0 });
    const createDriver = createDriverFactory({ mobileBuildMcp: fakeOptions({ cwd: root, lockRoot: root, runner }) });
    assert.notEqual(createDriver(iosScript), createDriver(iosScript));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('for an Android script the factory builds the Android driver, which ends at ANDROID_TOOLS_UNAVAILABLE without adb', async () => {
  const androidScript: ScriptedScenario = { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'emulator-5554' }, values: {}, steps: [] };
  const root = await mkdtemp(join(tmpdir(), 'jev-device-factory-android-'));
  const empty = join(root, 'empty');
  await mkdir(empty);
  try {
    const runner: CliRunner = async () => assert.fail('an Android script never reaches the iOS driver');
    // The real tools check, with ANDROID_HOME, ANDROID_SDK_ROOT, PATH and the home folder all empty.
    const tools = () => androidTools({ environment: { ANDROID_HOME: empty, ANDROID_SDK_ROOT: empty, PATH: empty }, home: empty });
    const createDriver = createDriverFactory({ mobileBuildMcp: { cwd: root, lockRoot: root, runner }, android: { leaseRoot: root, tools } });
    const driver = createDriver(androidScript);
    assert.ok(driver instanceof AndroidDriver);
    await assert.rejects(driver.prepare({ app: { package: 'com.hugues.test_cmp' } }, new AbortController().signal),
      (error: unknown) => error instanceof DeviceReasonError && error.code === 'ANDROID_TOOLS_UNAVAILABLE');
    await driver.close(new AbortController().signal);
    assert.deepEqual(await readdir(root), ['empty'], 'no lease taken');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the Android driver gets the script\'s device, else JEV_ANDROID_DEVICE, from the factory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-factory-android-device-'));
  try {
    const adbCalls: string[] = [];
    const runner: AdbRunner = async (args) => {
      adbCalls.push(args.join(' '));
      return { stdout: 'List of devices attached\n\n', stderr: '', exitCode: 0 };
    };
    const createDriver = createDriverFactory({ mobileBuildMcp: { cwd: root, lockRoot: root },
      android: { leaseRoot: root, runner, defaultDevice: 'Default_AVD',
        tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: '/cache/agent.dex', sha256: 'a'.repeat(64) } }) } });
    const script = (device?: { avd: string }): ScriptedScenario =>
      ({ version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' }, ...(device ? { device } : {}), values: {}, steps: [] });
    for (const [device, named] of [[{ avd: 'Script_AVD' }, 'Script_AVD'], [undefined, 'Default_AVD']] as const) {
      await assert.rejects(createDriver(script(device)).prepare({ app: { package: 'com.hugues.test_cmp' } }, new AbortController().signal),
        (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_NOT_CONNECTED' && error.message.endsWith(`named ${named}`));
    }
    assert.deepEqual(adbCalls, ['devices -l', 'devices -l']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fakeOptions(options: import('../src/device/index.js').MobileBuildMcpDriverOptions) {
  const storeRoot = join(options.cwd, 'admission'); mkdirSync(storeRoot, { recursive: true, mode: 0o700 });
  return { ...options, admission: Admission.forTesting({ root: realpathSync(storeRoot), backend: 'fake' }),
    deviceWindow: async () => {}, fakeBackend: { runner: options.runner!, window: undefined } };
}
