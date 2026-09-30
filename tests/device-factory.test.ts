import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { createDriverFactory } from '../src/device/factory.js';
import type { CliRunner } from '../src/device/index.js';

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

test('an Android script never reaches the iOS driver: the factory refuses it before it is built', async () => {
  const androidScript: ScriptedScenario = { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    values: {}, steps: [] };
  const root = await mkdtemp(join(tmpdir(), 'jev-device-factory-android-'));
  try {
    const runner: CliRunner = async () => ({ stdout: '{}', stderr: '', exitCode: 0 });
    const createDriver = createDriverFactory({ mobileBuildMcp: { cwd: root, lockRoot: root, runner } });
    assert.throws(() => createDriver(androidScript), /Android isn't available in this build/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
