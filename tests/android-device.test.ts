import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceReasonError, selectAndroidDeviceName } from '../src/device/index.js';

test('a script-named serial is chosen over JEV_ANDROID_DEVICE', () => {
  const chosen = selectAndroidDeviceName({ serial: 'emulator-5554' }, 'jev-actions-api31');
  assert.equal(chosen, 'emulator-5554');
});

test('a script-named AVD is chosen over JEV_ANDROID_DEVICE', () => {
  const chosen = selectAndroidDeviceName({ avd: 'jev-actions-api31' }, 'emulator-5554');
  assert.equal(chosen, 'jev-actions-api31');
});

test('falls back to JEV_ANDROID_DEVICE when the script names no device', () => {
  const chosen = selectAndroidDeviceName(undefined, 'jev-actions-api31');
  assert.equal(chosen, 'jev-actions-api31');
});

test('an empty JEV_ANDROID_DEVICE counts as unset', () => {
  assert.throws(() => selectAndroidDeviceName(undefined, ''), (error: unknown) =>
    error instanceof DeviceReasonError && error.code === 'NO_DEVICE');
});

test('no device at all fails with NO_DEVICE', () => {
  assert.throws(() => selectAndroidDeviceName(undefined, undefined), (error: unknown) =>
    error instanceof DeviceReasonError && error.code === 'NO_DEVICE');
});

test('a malformed JEV_ANDROID_DEVICE fails with INVALID_DEVICE, naming the Android patterns', () => {
  assert.throws(() => selectAndroidDeviceName(undefined, 'has a space'), (error: unknown) =>
    error instanceof DeviceReasonError && error.code === 'INVALID_DEVICE' &&
    /serial/.test(error.message) && /AVD/.test(error.message));
});

import { resolveIdentity } from '../src/device/identity.js';
import { identityProbe } from '../src/device/android/probe.js';
import { fakeProbeSpawn } from './fixtures/adb-spawn.js';

const identitySignal = () => new AbortController().signal;

test('console provenance resolves an emulator to its canonical directory', async () => {
  const fake = fakeProbeSpawn((_file, args) => {
    if (args[0] === 'devices') return 'List of devices attached\nemulator-5554 device\n';
    if (args[2] === 'emu') return `${args[4] === 'path' ? '/alias/Pixel.avd' : 'Pixel'}\r\nOK\r\n`;
    return 'Pixel\n';
  });
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn,
    host: {
      listener: async () => ({ pid: 123, startedAt: '2026-10-19T01:00:00.000Z', uid: 501, local: true }),
      directory: async () => ({ path: '/canonical/Pixel.avd', device: '2', inode: '42' }),
      version: async () => ({ value: '36.6.1', source: 'running-sdk-binary' }),
    },
  });
  const identity = await resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe, signal: identitySignal() });
  assert.deepEqual(identity, {
    category: 'android-emulator', value: '/canonical/Pixel.avd', transport: { serial: 'emulator-5554', state: 'device' },
    provenance: { avdName: 'Pixel', avdId: 'Pixel', directory: { device: '2', inode: '42' },
      version: { value: '36.6.1', source: 'running-sdk-binary' }, process: { pid: 123, startedAt: '2026-10-19T01:00:00.000Z' } },
    probeReplies: { name: 'Pixel\r\nOK\r\n', id: 'Pixel\r\nOK\r\n', path: '/alias/Pixel.avd\r\nOK\r\n',
      guestName: { kind: 'read', reply: 'Pixel\n' }, finalId: 'Pixel\r\nOK\r\n' },
  });
});

import { readFileSync } from 'node:fs';
import { IdentityResolutionError } from '../src/device/identity.js';
import type { AndroidHostProbe } from '../src/device/android/probe.js';

const consoleFixtures = new URL('./fixtures/android/console/', import.meta.url);
const validHost: AndroidHostProbe = {
  listener: async () => ({ pid: 123, startedAt: '2026-10-19T01:00:00.000Z', uid: 501, local: true }),
  directory: async path => ({ path, device: '2', inode: path.includes('Other') ? '43' : '42' }),
  version: async () => ({ value: '36.6.1', source: 'running-sdk-binary' }),
};
function emulatorWorld(input: {
  devices?: string; field?: 'name' | 'id' | 'path'; reply?: string; guest?: string;
  host?: AndroidHostProbe; environment?: NodeJS.ProcessEnv;
} = {}) {
  const fake = fakeProbeSpawn((_file, args) => {
    if (args[0] === 'devices') return input.devices ?? 'List of devices attached\nemulator-5554 device\n';
    if (args[2] === 'emu') return args[4] === input.field ? input.reply : args[4] === 'path' ? '/avds/Pixel.avd\r\nOK\r\n' : 'Pixel\r\nOK\r\n';
    return input.guest ?? 'Pixel\n';
  });
  const probe = identityProbe({ adb: '/fake/adb', environment: input.environment ?? {}, spawn: fake.spawn, host: input.host ?? validHost });
  return { ...fake, probe };
}
function refusal(code: string, reason?: string) {
  return (error: unknown) => error instanceof IdentityResolutionError && error.code === code && error.reason === reason;
}

test('console provenance rejects malformed framing, sentinel replies and relative paths', async () => {
  for (const fixture of ['empty.txt', 'ko.txt', 'no-avd-info.txt', 'empty-value.txt', 'extra-line.txt', 'lf-only.txt', 'relative-path.txt']) {
    const world = emulatorWorld({ field: 'path', reply: readFileSync(new URL(fixture, consoleFixtures), 'utf8') });
    await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe: world.probe, signal: identitySignal() }),
      refusal('DEVICE_IDENTITY_UNAVAILABLE', 'MALFORMED_PROVENANCE'), fixture);
  }
});

test('captured native console replies preserve success, offline and second-instance identity', async () => {
  for (const [name, state, avdId] of [['success', 'device', 'p24-first'], ['offline', 'offline', 'p24-first'], ['second', 'device', 'p24-second']] as const) {
    const fake = fakeProbeSpawn((_file, args) => {
      if (args[0] === 'devices') return `List of devices attached\nemulator-5570 ${state}\n`;
      if (args[2] === 'emu') return readFileSync(new URL(`live-${name}-${args[4]}.txt`, consoleFixtures), 'utf8');
      return 'jev_appium_phase1_20261018\n';
    });
    const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn,
      host: { ...validHost, directory: async () => ({ path: '/canonical/Private.avd', device: '2', inode: '42' }) } });
    const resolved = await resolveIdentity({ request: { category: 'android-emulator', name: 'emulator-5570' }, probe, signal: identitySignal() });
    assert.deepEqual([resolved.category, resolved.value, resolved.category === 'android-emulator' ? resolved.provenance.avdId : undefined],
      ['android-emulator', '/canonical/Private.avd', avdId]);
  }
});

test('captured missing, empty and mismatched token replies refuse provenance', async () => {
  for (const name of ['missing', 'empty', 'mismatch']) for (const field of ['name', 'id', 'path'] as const) {
    const world = emulatorWorld({ field, reply: readFileSync(new URL(`live-${name}-${field}.txt`, consoleFixtures), 'utf8') });
    await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe: world.probe, signal: identitySignal() }),
      refusal('DEVICE_IDENTITY_UNAVAILABLE', 'MALFORMED_PROVENANCE'));
  }
});

test('guest name is a cross-check and missing guest data preserves console identity', async () => {
  const mismatch = emulatorWorld({ guest: 'Other\n' });
  await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: mismatch.probe, signal: identitySignal() }),
    refusal('DEVICE_IDENTITY_CONFLICT', 'GUEST_NAME_DISAGREEMENT'));
  for (const world of [emulatorWorld({ guest: '\n' }), emulatorWorld({ devices: 'List of devices attached\nemulator-5554 offline\n' })]) {
    const resolved = await resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: world.probe, signal: identitySignal() });
    assert.equal(resolved.value, '/avds/Pixel.avd');
    assert.equal(resolved.category, 'android-emulator');
  }
});

test('a stalled read-only probe is bounded and kills only its child without exposing stderr', async () => {
  const fake = fakeProbeSpawn((_file, _args, child) => { child.stderr.write('secret diagnostic'); return undefined; });
  const probe = identityProbe({ adb: '/fake/adb', environment: { TYPESAFE_API_KEY: 'sentinel-key', ANDROID_ADB_SERVER_PORT: '5038' },
    deadlineMs: 5, spawn: fake.spawn, host: validHost });
  const outcome = await Promise.race([
    resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe, signal: identitySignal() }).catch(error => error),
    new Promise(resolve => setTimeout(() => resolve('unbounded'), 60)),
  ]);
  assert.ok(outcome instanceof IdentityResolutionError);
  assert.equal(outcome.message, 'DEVICE_IDENTITY_UNAVAILABLE: PROBE_TIMEOUT');
  assert.deepEqual(fake.children[0]?.killedBy, ['SIGTERM']);
  assert.deepEqual(fake.calls[0]?.options.env, { ANDROID_ADB_SERVER_PORT: '5038' });
  assert.deepEqual(fake.calls[0]?.args, ['devices', '-l']);
});

test('emulator provenance requires a local listener, readable sources and supported process-bound version', async () => {
  for (const [host, reason] of [
    [{ ...validHost, listener: async () => ({ pid: 123, startedAt: '2026-10-19T01:00:00.000Z', uid: 501, local: false }) }, 'REMOTE_CONSOLE'],
    [{ ...validHost, version: async () => ({ value: '29.0.1', source: 'running-sdk-binary' as const }) }, 'EMULATOR_VERSION_UNSUPPORTED'],
    [{ ...validHost, version: async () => ({ value: '', source: 'running-sdk-binary' as const }) }, 'PROVENANCE_INACCESSIBLE'],
    [{ ...validHost, directory: async () => { throw new Error('sensitive source path'); } }, 'PROVENANCE_INACCESSIBLE'],
  ] as const) {
    const world = emulatorWorld({ host });
    await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: world.probe, signal: identitySignal() }),
      refusal('DEVICE_IDENTITY_UNAVAILABLE', reason));
  }
  const remote = emulatorWorld({ environment: { ADB_SERVER_SOCKET: 'tcp:other-host:5037' } });
  await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: remote.probe, signal: identitySignal() }),
    refusal('DEVICE_IDENTITY_UNAVAILABLE', 'REMOTE_CONSOLE'));
});

import { revalidateIdentity, sameIdentity } from '../src/device/identity.js';

test('fresh resolution and revalidation reject reused transports and an incarnation changed during console reads', async () => {
  let pid = 123;
  const host = { ...validHost, listener: async () => ({ pid, startedAt: '2026-10-19T01:00:00.000Z', uid: 501, local: true }) };
  const world = emulatorWorld({ host });
  const original = await resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: world.probe, signal: identitySignal() });
  pid = 456;
  const fresh = await resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: world.probe, signal: identitySignal() });
  assert.equal(fresh.category === 'android-emulator' ? fresh.provenance.process.pid : 0, 456);
  assert.equal(sameIdentity(original, fresh), true);
  await assert.rejects(revalidateIdentity({ identity: original, probe: world.probe, signal: identitySignal() }),
    refusal('DEVICE_IDENTITY_CONFLICT', 'TRANSPORT_CHANGED'));
  let listeners = 0;
  const changed = emulatorWorld({ host: { ...host, listener: async () => ({ pid: ++listeners, startedAt: '2026-10-19T01:00:00.000Z', uid: 501, local: true }) } });
  await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: changed.probe, signal: identitySignal() }),
    refusal('DEVICE_IDENTITY_CONFLICT', 'TRANSPORT_CHANGED'));
});

test('multiple transports stay ambiguous and a device/inode under distinct canonical paths conflicts', async () => {
  const devices = 'List of devices attached\nemulator-5554 device\nemulator-5556 device\n';
  const clones = emulatorWorld({ devices });
  await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: clones.probe, signal: identitySignal() }), refusal('DEVICE_AMBIGUOUS'));
  assert.equal((await resolveIdentity({ request: { category: 'android', name: 'emulator-5556' }, probe: clones.probe, signal: identitySignal() })).value, '/avds/Pixel.avd');
  let directoryReads = 0;
  const conflict = emulatorWorld({ devices, host: { ...validHost,
    directory: async () => ({ path: ++directoryReads === 1 ? '/one/Pixel.avd' : '/two/Pixel.avd', device: '2', inode: '42' }) } });
  await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe: conflict.probe, signal: identitySignal() }),
    refusal('DEVICE_IDENTITY_CONFLICT', 'PATH_INODE_DISAGREEMENT'));
});

test('phone hardware identity agrees with USB and is shared by network aliases', async () => {
  const devices = 'List of devices attached\nPHONE123 device\n192.0.2.1:5555 device\nadb-PHONE123-test._adb-tls-connect._tcp device\n';
  const fake = fakeProbeSpawn((_file, args) => args[0] === 'devices' ? devices : 'PHONE123\n');
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn, host: validHost });
  const identities = [];
  for (const name of ['PHONE123', '192.0.2.1:5555', 'adb-PHONE123-test._adb-tls-connect._tcp']) {
    identities.push(await resolveIdentity({ request: { category: 'android-phone', name }, probe, signal: identitySignal() }));
  }
  assert.deepEqual(identities.map(identity => [identity.category, identity.value]), [
    ['android-phone', 'PHONE123'], ['android-phone', 'PHONE123'], ['android-phone', 'PHONE123'],
  ]);
  const wrong = fakeProbeSpawn((_file, args) => args[0] === 'devices' ? 'List of devices attached\nUSB123 device\n' : 'OTHER123\n');
  await assert.rejects(resolveIdentity({ request: { category: 'android-phone', name: 'USB123' },
    probe: identityProbe({ adb: '/fake/adb', environment: {}, spawn: wrong.spawn, host: validHost }), signal: identitySignal() }),
    refusal('DEVICE_IDENTITY_CONFLICT', 'USB_SERIAL_DISAGREEMENT'));
});

test('simulator UUIDs resolve only through the default inventory and reserved iPhone identifiers refuse before probing', async () => {
  const fake = fakeProbeSpawn(() => { throw new Error('unexpected Android command'); });
  const reply = JSON.stringify({ devices: { runtime: [{ udid: '11111111-aaaa-bbbb-cccc-222222222222', name: 'Private Simulator', isAvailable: true, state: 'Booted' }] } });
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn,
    simulator: async () => ({ reply, deviceSet: '/account/Library/Developer/CoreSimulator/Devices' }) });
  const identity = await resolveIdentity({ request: { category: 'ios-simulator', name: '11111111-aaaa-bbbb-cccc-222222222222' }, probe, signal: identitySignal() });
  assert.deepEqual(identity, { category: 'ios-simulator', value: '11111111-AAAA-BBBB-CCCC-222222222222',
    deviceSet: '/account/Library/Developer/CoreSimulator/Devices', state: 'Booted', probeReplies: { simulatorList: reply } });
  await assert.rejects(resolveIdentity({ request: { category: 'ios-simulator', name: identity.value, deviceSet: '/custom' }, probe, signal: identitySignal() }),
    refusal('DEVICE_IDENTITY_UNAVAILABLE', 'NONDEFAULT_DEVICE_SET'));
  await assert.rejects(resolveIdentity({ request: { category: 'ios-simulator', name: '33333333-AAAA-BBBB-CCCC-222222222222' }, probe, signal: identitySignal() }), refusal('DEVICE_NOT_FOUND'));
  for (const request of [{ category: 'ios-phone' as const, name: 'phone' }, { category: 'ios-simulator' as const, name: '00008110-0000111122223333' }]) {
    await assert.rejects(resolveIdentity({ request, probe, signal: identitySignal() }), refusal('CATEGORY_NOT_ENABLED'));
  }
  assert.deepEqual(fake.calls, []);
});

import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

test('production host parsing binds loopback PID, process start and fresh SDK binary version without PATH fallback', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'identity-host-')));
  try {
    const launcher = join(root, 'emulator');
    const executable = join(root, 'qemu/darwin-aarch64/qemu-system-aarch64');
    const avd = join(root, 'Pixel.avd');
    mkdirSync(join(root, 'qemu/darwin-aarch64'), { recursive: true });
    mkdirSync(avd);
    writeFileSync(launcher, 'fake launcher'); writeFileSync(executable, 'fake executable');
    chmodSync(launcher, 0o700); chmodSync(executable, 0o700);
    const startedAt = new Date(Date.now() + 1).toISOString();
    const fake = fakeProbeSpawn((file, args) => {
      if (file === '/usr/sbin/lsof' && args.includes('-d')) return `p123\nn${executable}\n`;
      if (file === '/usr/sbin/lsof') return `p123\nu${userInfo().uid}\nn127.0.0.1:5554\n`;
      if (file === '/bin/ps') return startedAt + '\n';
      if (file === launcher) return 'Android emulator version 36.6.1.0 (build_id 123)\n';
      if (args[0] === 'devices') return 'List of devices attached\nemulator-5554 device\n';
      if (args[2] === 'emu') return `${args[4] === 'path' ? avd : 'Pixel'}\r\nOK\r\n`;
      return 'Pixel\n';
    });
    const probe = identityProbe({ adb: '/fake/adb', environment: { ANDROID_AVD_HOME: '/must/not/be/read' }, spawn: fake.spawn });
    const identity = await resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe, signal: identitySignal() });
    assert.equal(identity.value, avd);
    assert.deepEqual(identity.category === 'android-emulator' ? identity.provenance.version : null,
      { value: '36.6.1.0', source: 'running-sdk-binary' });
    assert.deepEqual(fake.calls.filter(call => call.file === launcher).map(call => call.args), [['-version']]);
    writeFileSync(launcher, 'replaced installation');
    await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe, signal: identitySignal() }),
      refusal('DEVICE_IDENTITY_UNAVAILABLE', 'PROVENANCE_INACCESSIBLE'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a headless emulator (-no-window) establishes running provenance from its headless qemu binary', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'identity-headless-')));
  try {
    const launcher = join(root, 'emulator');
    const executable = join(root, 'qemu/darwin-aarch64/qemu-system-aarch64-headless');
    const avd = join(root, 'Pixel.avd');
    mkdirSync(join(root, 'qemu/darwin-aarch64'), { recursive: true }); mkdirSync(avd);
    writeFileSync(launcher, 'fake launcher'); writeFileSync(executable, 'fake executable');
    chmodSync(launcher, 0o700); chmodSync(executable, 0o700);
    const startedAt = new Date(Date.now() + 1).toISOString();
    const fake = fakeProbeSpawn((file, args) => {
      if (file === '/usr/sbin/lsof' && args.includes('-d')) return `p123\nftxt\nn${executable}\nftxt\nn${join(root, 'lib64/libc++.dylib')}\nftxt\nn/usr/lib/dyld\n`;
      if (file === '/usr/sbin/lsof') return `p123\nu${userInfo().uid}\nn127.0.0.1:5554\n`;
      if (file === '/bin/ps') return startedAt + '\n';
      if (file === launcher) return 'Android emulator version 37.2.12.0 (build_id 123)\n';
      if (args[0] === 'devices') return 'List of devices attached\nemulator-5554 device\n';
      if (args[2] === 'emu') return `${args[4] === 'path' ? avd : 'Pixel'}\r\nOK\r\n`;
      return 'Pixel\n';
    });
    const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn });
    const identity = await resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe, signal: identitySignal() });
    assert.deepEqual(identity.category === 'android-emulator' ? identity.provenance.version : null,
      { value: '37.2.12.0', source: 'running-sdk-binary' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a cold emulator -version slower than the read deadline succeeds within its own bounded deadline', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'identity-cold-version-')));
  try {
    const launcher = join(root, 'emulator');
    const executable = join(root, 'qemu/darwin-aarch64/qemu-system-aarch64-headless');
    const avd = join(root, 'Pixel.avd');
    mkdirSync(join(root, 'qemu/darwin-aarch64'), { recursive: true }); mkdirSync(avd);
    writeFileSync(launcher, 'fake launcher'); writeFileSync(executable, 'fake executable');
    chmodSync(launcher, 0o700); chmodSync(executable, 0o700);
    const startedAt = new Date(Date.now() + 1).toISOString();
    const world = (versionDeadlineMs?: number) => {
      const fake = fakeProbeSpawn((file, args, child) => {
        if (file === '/usr/sbin/lsof' && args.includes('-d')) return `p123\nftxt\nn${executable}\n`;
        if (file === '/usr/sbin/lsof') return `p123\nu${userInfo().uid}\nn127.0.0.1:5554\n`;
        if (file === '/bin/ps') return startedAt + '\n';
        if (file === launcher) { setTimeout(() => child.exit(0, 'Android emulator version 37.2.12.0 (build_id 123)\n'), 200); return undefined; }
        if (args[0] === 'devices') return 'List of devices attached\nemulator-5554 device\n';
        if (args[2] === 'emu') return `${args[4] === 'path' ? avd : 'Pixel'}\r\nOK\r\n`;
        return 'Pixel\n';
      });
      return { fake, probe: identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn, deadlineMs: 50,
        ...(versionDeadlineMs === undefined ? {} : { versionDeadlineMs }) }) };
    };
    const cold = world();
    const identity = await resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe: cold.probe, signal: identitySignal() });
    assert.deepEqual(identity.category === 'android-emulator' ? identity.provenance.version : null,
      { value: '37.2.12.0', source: 'running-sdk-binary' });
    const bounded = world(50);
    await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe: bounded.probe, signal: identitySignal() }),
      refusal('DEVICE_IDENTITY_UNAVAILABLE', 'PROBE_TIMEOUT'));
    assert.deepEqual(bounded.fake.children.find((_, index) => bounded.fake.calls[index]?.file === launcher)?.killedBy, ['SIGTERM']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an explicit phone transport does not depend on unrelated emulator provenance and absent names refuse', async () => {
  const fake = fakeProbeSpawn((_file, args) => args[0] === 'devices'
    ? 'List of devices attached\nPHONE123 device\nemulator-5554 device\n' : 'PHONE123\n');
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn,
    host: { ...validHost, listener: async () => { throw new Error('unrelated inaccessible emulator'); } } });
  const identity = await resolveIdentity({ request: { category: 'android-phone', name: 'PHONE123' }, probe, signal: identitySignal() });
  assert.deepEqual([identity.category, identity.value], ['android-phone', 'PHONE123']);
  const empty = emulatorWorld({ devices: 'List of devices attached\n' });
  await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'missing' }, probe: empty.probe, signal: identitySignal() }), refusal('DEVICE_NOT_FOUND'));
});

test('production simulator listing pins the account default set despite caller set and HOME overrides', async () => {
  const reply = JSON.stringify({ devices: { runtime: [{ udid: '11111111-aaaa-bbbb-cccc-222222222222', name: 'Private Simulator', isAvailable: true, state: 'Booted' }] } });
  const fake = fakeProbeSpawn(() => reply);
  const probe = identityProbe({ adb: '/fake/adb', environment: { HOME: '/other-home',
    SIMCTL_DEVICE_SET_PATH: '/other-set', SIMULATOR_DEVICE_SET_PATH: '/third-set', TYPESAFE_API_KEY: 'sentinel-key' },
    spawn: fake.spawn, defaultSimulatorSet: async () => '/account/Library/Developer/CoreSimulator/Devices' });
  const identity = await resolveIdentity({ request: { category: 'ios-simulator', name: '11111111-AAAA-BBBB-CCCC-222222222222' }, probe, signal: identitySignal() });
  assert.deepEqual([identity.category, identity.value, identity.category === 'ios-simulator' ? identity.deviceSet : ''],
    ['ios-simulator', '11111111-AAAA-BBBB-CCCC-222222222222', '/account/Library/Developer/CoreSimulator/Devices']);
  assert.deepEqual(fake.calls.map(call => [call.file, call.args]), [
    ['/usr/bin/xcrun', ['simctl', '--set', '/account/Library/Developer/CoreSimulator/Devices', 'list', 'devices', '--json']],
  ]);
  assert.deepEqual(fake.calls[0]?.options.env, { HOME: '/other-home' });
});

test('an emulator binary replaced during version querying cannot establish running provenance', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'identity-version-race-')));
  try {
    const launcher = join(root, 'emulator');
    const executable = join(root, 'qemu/darwin-aarch64/qemu-system-aarch64');
    const avd = join(root, 'Pixel.avd');
    mkdirSync(join(root, 'qemu/darwin-aarch64'), { recursive: true }); mkdirSync(avd);
    writeFileSync(launcher, 'fake launcher'); writeFileSync(executable, 'fake executable');
    chmodSync(launcher, 0o700); chmodSync(executable, 0o700);
    const startedAt = new Date(Date.now() + 1).toISOString();
    const fake = fakeProbeSpawn((file, args) => {
      if (file === '/usr/sbin/lsof' && args.includes('-d')) return `p123\nn${executable}\n`;
      if (file === '/usr/sbin/lsof') return `p123\nu${userInfo().uid}\nn127.0.0.1:5554\n`;
      if (file === '/bin/ps') return startedAt + '\n';
      if (file === launcher) {
        writeFileSync(executable, 'replacement emulator binary changed while querying version');
        return 'Android emulator version 36.6.1.0 (build_id 123)\n';
      }
      if (args[0] === 'devices') return 'List of devices attached\nemulator-5554 device\n';
      if (args[2] === 'emu') return `${args[4] === 'path' ? avd : 'Pixel'}\r\nOK\r\n`;
      return 'Pixel\n';
    });
    const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn });
    await assert.rejects(resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe, signal: identitySignal() }),
      refusal('DEVICE_IDENTITY_UNAVAILABLE', 'PROVENANCE_INACCESSIBLE'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
