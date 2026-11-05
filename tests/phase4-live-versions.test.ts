import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectVersions, liveVersionSources, type VersionSources } from '../scripts/phase4/live/versions.js';

const UDID = '7B4D26E1-D394-4AD9-9FA6-128CB37680E9';
const STACK = { version: 1 as const, stackSha256: 'a'.repeat(64), wdaSha256: 'b'.repeat(64), manifestSha256: 'c'.repeat(64) };
const XCODE = 'Xcode 27.0\nBuild version 18A5230q\n';
const SIM_DEVICES = JSON.stringify({ devices: {
  'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [{ udid: UDID, name: 'Jev P4 iPhone', deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', state: 'Shutdown' }],
  'com.apple.CoreSimulator.SimRuntime.iOS-25-0': [{ udid: '11111111-2222-4333-8444-555555555555', name: 'Old', state: 'Shutdown' }] } });
const SIM_RUNTIMES = JSON.stringify({ runtimes: [
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-25-0', name: 'iOS 25.0', version: '25.0', buildversion: '22A1' },
  { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', name: 'iOS 26.5', version: '26.5', buildversion: '23F77' }] });

type Replies = Record<string, string | Error>;

/** Sources with no live world: each command answers from the table, and an unknown command fails like a missing tool. */
function sources(replies: Replies, overrides: Partial<VersionSources> = {}) {
  const asked: string[] = [];
  const result: VersionSources = {
    node: 'v26.8.1', platform: 'darwin', osRelease: '25.0.0',
    packageVersion: async () => '1.4.0',
    stackIdentity: async () => STACK,
    run: async argv => {
      const key = argv.join(' ');
      asked.push(key);
      const reply = replies[key];
      if (reply === undefined) throw new Error(`${argv[0]!} is not installed`);
      if (reply instanceof Error) throw reply;
      return reply;
    },
    ...overrides,
  };
  return { result, asked };
}

const HOST: Replies = { 'git rev-parse HEAD': '42a09abd413309df8afa00387937f937effebfdf\n', 'git status --porcelain': '', 'sw_vers -productVersion': '26.2\n' };
const IOS: Replies = { ...HOST, 'xcodebuild -version': XCODE, 'xcrun simctl list -j devices': SIM_DEVICES, 'xcrun simctl list -j runtimes': SIM_RUNTIMES };
const props = (serial: string, values: Record<string, string>): Replies => Object.fromEntries(Object.entries(values).map(([name, value]) => [`adb -s ${serial} shell getprop ${name}`, `${value}\n`]));
const PHONE_PROPS = { 'ro.build.version.release': '12', 'ro.build.version.sdk': '31', 'ro.product.model': 'M2102J20SG', 'ro.build.fingerprint': 'POCO/vayu_global/vayu:12/SKQ1.211006.001/V14:user/release-keys' };
const ADB: Replies = { 'adb version': 'Android Debug Bridge version 1.0.41\nVersion 36.0.0-13206524\nInstalled as /sdk/platform-tools/adb\n' };

test('an iOS row records node, package, commit, the Appium stack, Xcode and the simulator runtime', async () => {
  const { result } = sources(IOS);
  const versions = await collectVersions(result, { category: 'ios-simulator', device: UDID.toLowerCase() });
  assert.deepEqual(versions, {
    node: 'v26.8.1', platform: 'darwin', osRelease: '25.0.0',
    git: { revision: '42a09abd413309df8afa00387937f937effebfdf', dirty: false },
    package: '1.4.0',
    tools: {
      macos: { status: 'recorded', value: '26.2' },
      stack: { status: 'recorded', value: STACK },
      xcode: { status: 'recorded', value: { version: '27.0', build: '18A5230q' } },
      simulator: { status: 'recorded', value: { udid: UDID, name: 'Jev P4 iPhone', deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', iosVersion: '26.5', iosBuild: '23F77' } },
    },
  });
});

test('an iOS row asks for no Android tool', async () => {
  const { result, asked } = sources(IOS);
  await collectVersions(result, { category: 'ios-simulator', device: UDID });
  assert.deepEqual(asked.filter(command => /adb|emulator/.test(command)), []);
});

test('a phone row records adb and the device OS, API level, model and fingerprint, and no emulator', async () => {
  const { result, asked } = sources({ ...HOST, ...ADB, 'adb devices': 'List of devices attached\n2985e9c\tdevice\n\n', ...props('2985e9c', PHONE_PROPS) });
  const { tools } = await collectVersions(result, { category: 'android-phone', device: '2985e9c' }) as { tools: Record<string, unknown> };
  assert.deepEqual(tools.adb, { status: 'recorded', value: 'Android Debug Bridge version 1.0.41 | Version 36.0.0-13206524' });
  assert.deepEqual([tools.androidSerial, tools.androidOsRelease, tools.androidApiLevel, tools.androidModel],
    [{ status: 'recorded', value: '2985e9c' }, { status: 'recorded', value: '12' }, { status: 'recorded', value: '31' }, { status: 'recorded', value: 'M2102J20SG' }]);
  assert.deepEqual(tools.androidFingerprint, { status: 'recorded', value: PHONE_PROPS['ro.build.fingerprint'] });
  assert.equal('emulator' in tools, false, 'the emulator binary is not part of a phone row');
  assert.equal('xcode' in tools, false);
  assert.deepEqual(asked.filter(command => command.startsWith('xc')), []);
});

test('an emulator row named by its AVD finds the running serial and records the emulator version', async () => {
  const { result } = sources({ ...HOST, ...ADB,
    'adb devices': 'List of devices attached\n2985e9c\tdevice\nemulator-5554\tdevice\nemulator-5556\tdevice\n',
    'adb -s emulator-5554 emu avd name': 'other_avd\nOK\n', 'adb -s emulator-5556 emu avd name': 'jev_p4_emulator\nOK\n',
    'emulator -version': 'Android emulator version 36.2.12.0 (build_id 14214601) (CL:N/A)\nCopyright (C) 2006-2025 The Android Open Source Project\n',
    ...props('emulator-5556', { ...PHONE_PROPS, 'ro.build.version.release': '16', 'ro.build.version.sdk': '36' }) });
  const { tools } = await collectVersions(result, { category: 'android-emulator', device: 'jev_p4_emulator' }) as { tools: Record<string, unknown> };
  assert.deepEqual(tools.androidSerial, { status: 'recorded', value: 'emulator-5556' });
  assert.deepEqual(tools.emulator, { status: 'recorded', value: 'Android emulator version 36.2.12.0 (build_id 14214601) (CL:N/A)' });
  assert.deepEqual([tools.androidOsRelease, tools.androidApiLevel], [{ status: 'recorded', value: '16' }, { status: 'recorded', value: '36' }]);
});

test('a version that cannot be read is recorded as unavailable with the reason, never as empty', async () => {
  const { result } = sources({ ...HOST, 'sw_vers -productVersion': '  \n', 'xcodebuild -version': new Error('xcodebuild exited 1: xcode-select: error: no developer tools'),
    'xcrun simctl list -j devices': 'not json', 'xcrun simctl list -j runtimes': SIM_RUNTIMES },
  { stackIdentity: async () => { throw new Error('dist/appium/stack-identity.js does not exist; run npm run build'); }, packageVersion: async () => { throw new Error('package.json is unreadable'); } });
  const versions = await collectVersions(result, { category: 'ios-simulator', device: UDID }) as { package: unknown; tools: Record<string, unknown> };
  assert.deepEqual(versions.package, { status: 'unavailable', reason: 'package.json is unreadable' });
  assert.deepEqual(versions.tools.macos, { status: 'unavailable', reason: 'sw_vers printed nothing' });
  assert.deepEqual(versions.tools.stack, { status: 'unavailable', reason: 'dist/appium/stack-identity.js does not exist; run npm run build' });
  assert.deepEqual(versions.tools.xcode, { status: 'unavailable', reason: 'xcodebuild exited 1: xcode-select: error: no developer tools' });
  assert.equal((versions.tools.simulator as { status: string }).status, 'unavailable');
  assert.match((versions.tools.simulator as { reason: string }).reason, /simctl/);
});

test('an unreadable git tree records the commit as unavailable, and a dirty tree is recorded as dirty', async () => {
  const none = await collectVersions(sources({ ...IOS, 'git rev-parse HEAD': new Error('not a git repository') }).result, { category: 'ios-simulator', device: UDID }) as { git: unknown };
  assert.deepEqual(none.git, { status: 'unavailable', reason: 'not a git repository' });
  const dirty = await collectVersions(sources({ ...IOS, 'git status --porcelain': ' M scripts/phase4/live/run.ts\n' }).result, { category: 'ios-simulator', device: UDID }) as { git: unknown };
  assert.deepEqual(dirty.git, { revision: '42a09abd413309df8afa00387937f937effebfdf', dirty: true });
});

test('a simulator that is not in the list, and a phone that is not attached, are unavailable with the reason', async () => {
  const sim = await collectVersions(sources({ ...IOS, 'xcrun simctl list -j devices': JSON.stringify({ devices: {} }) }).result,
    { category: 'ios-simulator', device: UDID }) as { tools: Record<string, unknown> };
  assert.deepEqual(sim.tools.simulator, { status: 'unavailable', reason: `simulator ${UDID} is not in the default device set` });
  const { result } = sources({ ...HOST, ...ADB, 'adb devices': 'List of devices attached\n\n' });
  const { tools } = await collectVersions(result, { category: 'android-phone', device: '2985e9c' }) as { tools: Record<string, { status: string; reason: string }> };
  assert.deepEqual(tools.androidSerial, { status: 'unavailable', reason: 'adb does not list 2985e9c' });
  for (const name of ['androidOsRelease', 'androidApiLevel', 'androidModel', 'androidFingerprint']) {
    assert.deepEqual(tools[name], { status: 'unavailable', reason: 'the device serial is unavailable: adb does not list 2985e9c' }, name);
  }
});

test('a device property that prints nothing is unavailable with its name', async () => {
  const { result } = sources({ ...HOST, ...ADB, 'adb devices': 'List of devices attached\n2985e9c\tdevice\n', ...props('2985e9c', { ...PHONE_PROPS, 'ro.product.model': '' }) });
  const { tools } = await collectVersions(result, { category: 'android-phone', device: '2985e9c' }) as { tools: Record<string, unknown> };
  assert.deepEqual(tools.androidModel, { status: 'unavailable', reason: 'getprop ro.product.model printed nothing' });
});

test('the live sources run a command without a shell and put why a command failed into words', async t => {
  const root = mkdtempSync(join(tmpdir(), 'p4-versions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.8.7' }));
  const live = liveVersionSources({ cwd: root, environment: { PATH: process.env.PATH } });
  assert.equal(await live.run([process.execPath, '-e', "process.stdout.write(process.argv[1])", '$HOME; echo shell']), '$HOME; echo shell');
  await assert.rejects(live.run([process.execPath, '-e', "console.error('first words\\nmore'); process.exit(3)"]), /exited 3: first words/);
  await assert.rejects(live.run(['jev-no-such-tool-7f3a']), /jev-no-such-tool-7f3a is not installed or not on PATH/);
  const withKey = liveVersionSources({ cwd: root, environment: { PATH: process.env.PATH, TYPESAFE_API_KEY: 'fake-key-1' } });
  assert.equal(await withKey.run([process.execPath, '-e', 'process.stdout.write(String(process.env.TYPESAFE_API_KEY))']), 'undefined', 'a version tool never sees the Jev key');
  assert.equal(await live.packageVersion(), '9.8.7');
  assert.equal(live.node, process.version);
  writeFileSync(join(root, 'package.json'), '{}');
  await assert.rejects(live.packageVersion(), /no version/);
});
