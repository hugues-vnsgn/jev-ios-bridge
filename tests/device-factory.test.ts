import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { createDriverFactory } from '../src/device/factory.js';
import { DeviceReasonError, type CliRunner } from '../src/device/index.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import { AndroidDriver } from '../src/device/android/driver.js';
import { androidTools } from '../src/device/android/tools.js';

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const iosScript: ScriptedScenario = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [] };

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
    const createDriver = createDriverFactory({ mobileBuildMcp: { cwd: root, lockRoot: root, defaultUdid: udid, runner } });
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
    const createDriver = createDriverFactory({ mobileBuildMcp: { cwd: root, lockRoot: root, runner } });
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
