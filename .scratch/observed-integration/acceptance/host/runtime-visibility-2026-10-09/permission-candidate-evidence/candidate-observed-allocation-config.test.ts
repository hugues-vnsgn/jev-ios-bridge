import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrepareAllocation, preparationDigest } from '../src/observed/allocation-schema.js';

const request = { version: 1, actionId: 'allocate-one', source: { kind: 'create',
  deviceTypeId: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0' },
  app: { artifactPath: '/isolated/Fixture.app', bundleId: 'dev.fixture', build: { id: 'fixture', origin: 'host' } } };

test('strict preparation parsing fills only the overall default and canonicalizes object order', () => {
  const parsed = parsePrepareAllocation(request);
  assert.equal(parsed.timeoutMs, 360000);
  assert.equal(preparationDigest(parsed), preparationDigest(parsePrepareAllocation({ timeoutMs: 360000,
    app: request.app, source: request.source, actionId: request.actionId, version: 1 })));
  for (const raw of [{ ...request, extra: true }, { ...request, device: 'raw' }, { ...request, version: 2 },
    { ...request, actionId: '-bad' }, { ...request, timeoutMs: 999 }, { ...request, timeoutMs: 900001 },
    { ...request, app: { ...request.app, artifactPath: 'relative.app' } }]) assert.throws(() => parsePrepareAllocation(raw));
  assert.throws(() => parsePrepareAllocation({ ...request, app: { ...request.app, artifactPath: '/' + 'x'.repeat(4096) } }));
  assert.throws(() => parsePrepareAllocation({ ...request, extra: 'x'.repeat(65536) }));
  assert.equal(parsePrepareAllocation({ ...request, timeoutMs: 1000 }).timeoutMs, 1000);
  assert.equal(parsePrepareAllocation({ ...request, timeoutMs: 900000 }).timeoutMs, 900000);
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAllocationConfig, allocationDefaults } from '../src/observed/allocation-config.js';

test('private fixed account configuration uses defaults and refuses unsafe or malformed settings', async () => {
  const home = mkdtempSync(join(tmpdir(), 'allocation-config-')); chmodSync(home, 0o700);
  const account = { homedir: home, uid: process.getuid!() };
  const directory = join(home, 'Library/Application Support/jev-ios-bridge'); const file = join(directory, 'allocation.json');
  try {
    assert.deepEqual((await readAllocationConfig({ account })).budgets, allocationDefaults);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify({ version: 1, maxRetainedAllocations: 9, inventory: [] }), { mode: 0o600 });
    const configured = await readAllocationConfig({ account }); assert.equal(configured.budgets.maxRetainedAllocations, 9);
    for (const raw of [{ version: 2 }, { version: 1, extra: true }, { version: 1, maxReservedBytes: 1 },
      { version: 1, maxConcurrentPreparations: 9 }, { version: 1, bootTimeoutMs: 900001 }, { version: 1, minFreeBytes: 0 }]) {
      writeFileSync(file, JSON.stringify(raw)); await assert.rejects(readAllocationConfig({ account }), /CONFIG_INVALID/);
    }
    writeFileSync(file, '{"version":1}'); chmodSync(file, 0o644);
    await assert.rejects(readAllocationConfig({ account }), /CONFIG_INVALID/);
    chmodSync(file, 0o600); chmodSync(directory, 0o755);
    await assert.rejects(readAllocationConfig({ account }), /CONFIG_INVALID/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

import { verifyInstalledCompatibility } from '../src/observed/allocation-config.js';
import { allocationFixture, typeId, runtimeId, runtimeProfilePath, runtimeSystemPath } from './fixtures/observed-allocation-backend.js';

test('installed proof uses exact IDs and RuntimeRoot OS, never internal bundle or newest runtime versions', async () => {
  const f = await allocationFixture();
  try {
    const proof = await verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, f.source, new AbortController().signal);
    assert.equal(proof.runtimeVersion, '27.0.1'); assert.equal(proof.architecture, 'arm64');
    await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' }, f.host, f.source, new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
    f.write(runtimeSystemPath, { ProductVersion: '26.4.1', ProductBuildVersion: '26-fixture' });
    await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, f.source, new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
    assert.ok(!f.calls.includes('create'));
  } finally { await f.cleanup(); }
});

test('installed metadata replacement during plutil cannot supply compatibility even with identical bytes', async () => {
  const f = await allocationFixture();
  f.setBefore(async (operation, path) => {
    if (operation === 'plist' && path === runtimeProfilePath) {
      const original = await import('node:fs/promises'); const target = f.map(path); const data = await original.readFile(target);
      await original.writeFile(target + '.replacement', data, { mode: 0o644 }); await original.rename(target + '.replacement', target);
    }
  });
  try { await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, f.source,
    new AbortController().signal), /HOST_PREREQUISITE_MISSING/); }
  finally { await f.cleanup(); }
});

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import type { Stats } from 'node:fs';
import { allocationSourceProcess, developerDirectory } from '../src/observed/allocation-config.js';

function childHarness() {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    killed: 0, kill() { this.killed++; return true; } });
  const invocations: unknown[][] = []; let began!: () => void; const started = new Promise<void>(r => { began = r; });
  const launch = ((...args: unknown[]) => { invocations.push(args); began(); return child; }) as unknown as typeof spawn;
  return { child, invocations, launch, started };
}

test('production process composition allows only exact create and trusted fixed plist conversion with sanitized environment', async () => {
  const f = await allocationFixture(); const h = childHarness(); const source = allocationSourceProcess(f.host, [f.app], h.launch);
  const options = { shell: false as const, signal: new AbortController().signal, timeoutMs: 1000, maxOutputBytes: 1024 };
  const create = ['simctl', 'create', 'jev-observed-ABCDEF00-0000-4000-8000-000000000001', typeId, runtimeId];
  try {
    const rejectLaunch = ((...args: unknown[]) => { h.invocations.push(args); queueMicrotask(() => h.child.emit('close', 0, null)); return h.child; }) as unknown as typeof spawn;
    const refusedSource = allocationSourceProcess(f.host, [f.app], rejectLaunch);
    for (const [exe, args] of [['/bin/sh', ['-c', 'x']], ['/usr/bin/xcrun', ['simctl', 'list']],
      ['/usr/bin/xcrun', [...create, 'extra']], ['/usr/bin/xcrun', ['simctl', 'create', 'jev-observed-' + '-'.repeat(36), typeId, runtimeId]],
      ['/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '/tmp/foreign/Info.plist']],
      ['/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '/Library/Developer/CoreSimulator/Profiles/Runtimes/missing.simruntime/Contents/Info.plist']]] as [string, string[]][]) {
      await assert.rejects(refusedSource(exe, args, options));
    }
    assert.equal(h.invocations.length, 0);
    const pending = source('/usr/bin/xcrun', create, options); await h.started;
    assert.equal(h.invocations.length, 1);
    assert.deepEqual((h.invocations[0]![2] as {env: unknown}).env, { HOME: f.home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', DEVELOPER_DIR: developerDirectory });
    h.child.stdout.write('receipt'); h.child.emit('close', 0, null); assert.deepEqual(await pending, { exitCode: 0, stdout: 'receipt', stderr: '' });
  } finally { await f.cleanup(); }
});

test('production child cancellation and capped output do not claim settlement until the actual child closes', async () => {
  const f = await allocationFixture(); const h = childHarness(); const source = allocationSourceProcess(f.host, [], h.launch);
  const controller = new AbortController(); let settled = false;
  try {
    const pending = source('/usr/bin/xcrun', ['simctl', 'create', 'jev-observed-ABCDEF00-0000-4000-8000-000000000001', typeId, runtimeId],
      { shell: false, signal: controller.signal, timeoutMs: 1000, maxOutputBytes: 4 }).finally(() => { settled = true; });
    await h.started; controller.abort(); h.child.stdout.write('too much output');
    await new Promise(r => setImmediate(r)); assert.equal(settled, false); assert.ok(h.child.killed > 0);
    h.child.emit('close', 0, null); assert.equal((await pending).exitCode, null); assert.equal(settled, true);
  } finally { await f.cleanup(); }
});

import { xcodeInfoPath, deviceProfilePath, runtimeBundle } from './fixtures/observed-allocation-backend.js';
const installedMutations: [string, string, Record<string, unknown>][] = [
  ['Xcode identity', xcodeInfoPath, { CFBundleIdentifier: 'foreign.Xcode' }],
  ['Xcode executable', xcodeInfoPath, { CFBundleExecutable: 'foreign' }],
  ['Xcode min host', xcodeInfoPath, { LSMinimumSystemVersion: '28.0' }],
  ['Xcode version', '/Applications/Xcode.app/Contents/version.plist', { CFBundleShortVersionString: '384' }],
  ['Xcode build', '/Applications/Xcode.app/Contents/version.plist', { ProductBuildVersion: '' }],
  ['device architecture', deviceProfilePath, { supportedArchs: ['x86_64'] }],
  ['device family', deviceProfilePath, { supportedProductFamilyIDs: [99] }],
  ['device min runtime', deviceProfilePath, { minRuntimeVersion: '28.0' }],
  ['device max runtime', deviceProfilePath, { maxRuntimeVersion: '26.9' }],
  ['runtime platform', runtimeProfilePath, { platformIdentifier: 'com.apple.platform.iphoneos' }],
  ['runtime architecture', runtimeProfilePath, { supportedArchs: ['x86_64'] }],
  ['runtime family', runtimeProfilePath, { supportedProductFamilyIDs: [2] }],
  ['runtime min host', runtimeProfilePath, { minHostVersion: '28.0' }],
  ['runtime declared OS', runtimeProfilePath, { defaultVersionString: '26.4' }],
  ['runtime actual OS', runtimeSystemPath, { ProductVersion: '26.4.1' }],
  ['runtime build', runtimeSystemPath, { ProductBuildVersion: '' }],
];
for (const [name, path, value] of installedMutations) test(`installed ${name} mismatch refuses without host effects`, async () => {
  const f = await allocationFixture();
  try { const native = await import('node:fs/promises'); const old = JSON.parse(await native.readFile(f.map(path), 'utf8')); f.write(path, { ...old, ...value });
    await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, f.source, new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
    assert.ok(!f.calls.includes('create'));
  } finally { await f.cleanup(); }
});

test('runtime mounted volume metadata is accepted while missing executable, unsafe metadata and excessive enumeration refuse', async () => {
  const fs = await import('node:fs/promises');
  for (const mode of ['volume', 'executable', 'unsafe', 'enumeration'] as const) {
    const f = await allocationFixture();
    try {
      if (mode === 'volume') { const mounted = '/Library/Developer/CoreSimulator/Volumes/iOS_fixture/Library/Developer/CoreSimulator/Profiles/Runtimes';
        await fs.mkdir(f.map(mounted), { recursive: true, mode: 0o700 }); await fs.rename(f.map(runtimeBundle), join(f.map(mounted), 'iOS 27.0.simruntime'));
        assert.equal((await verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, f.source, new AbortController().signal)).runtimeVersion, '27.0.1');
      } else {
        if (mode === 'executable') await fs.chmod(f.map('/Applications/Xcode.app/Contents/Developer/usr/bin/simctl'), 0o644);
        if (mode === 'unsafe') await fs.chmod(f.map(runtimeProfilePath), 0o666);
        if (mode === 'enumeration') { const original = f.host.fs.readdir; f.host.fs.readdir = (async (p: string) => p.endsWith('/DeviceTypes') ? Array.from({ length: 1001 }, (_, i) => 'entry' + i) : original(p)) as typeof original; }
        await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, f.source, new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
      }
      assert.ok(!f.calls.includes('create'));
    } finally { await f.cleanup(); }
  }
});

test('config becoming public between permission validation and stable read refuses', async () => {
  const f = await allocationFixture(); const original = f.host.fs.lstat; let reads = 0;
  f.host.fs.lstat = (async (...args: Parameters<typeof original>) => {
    if (String(args[0]) === f.configPath && ++reads === 2) await (await import('node:fs/promises')).chmod(f.configPath, 0o644);
    return original(...args);
  }) as typeof original;
  try { await assert.rejects(readAllocationConfig({ account: f.host.account, fs: f.host.fs }), /CONFIG_INVALID/); }
  finally { await f.cleanup(); }
});

test('child error alone is not process settlement: a potentially live child stays tracked until close', async () => {
  const f = await allocationFixture(); const h = childHarness(); const source = allocationSourceProcess(f.host, [], h.launch); let settled = false;
  try { const pending = source('/usr/bin/xcrun', ['simctl', 'create', 'jev-observed-ABCDEF00-0000-4000-8000-000000000001', typeId, runtimeId],
    { shell: false, signal: new AbortController().signal, timeoutMs: 1000, maxOutputBytes: 1024 }).then(() => { settled = true; }, () => { settled = true; });
    await h.started; h.child.emit('error', new Error('isolated kill error')); await new Promise(r => setImmediate(r));
    assert.equal(settled, false); h.child.emit('close', null, 'SIGTERM'); await pending; assert.equal(settled, true);
  } finally { h.child.emit('close', null, 'SIGTERM'); await f.cleanup(); }
});

test('private config rejects symlink, hardlink and overlong file without consulting alternate roots', async () => {
  const fs = await import('node:fs/promises');
  for (const mode of ['symlink', 'hardlink', 'size'] as const) {
    const f = await allocationFixture();
    try { if (mode === 'symlink') { await fs.rename(f.configPath, f.configPath + '.target'); await fs.symlink(f.configPath + '.target', f.configPath); }
      if (mode === 'hardlink') await fs.link(f.configPath, f.configPath + '.alias');
      if (mode === 'size') await fs.writeFile(f.configPath, '{"version":1,"unused":"' + 'x'.repeat(65536) + '"}');
      await assert.rejects(readAllocationConfig({ account: f.host.account, fs: f.host.fs }), /CONFIG_INVALID/); assert.deepEqual(f.calls, []);
    } finally { await f.cleanup(); }
  }
});

test('canonical digest keeps build and supplied source immutable while invalid non-JSON requests stay safe', () => {
  assert.notEqual(preparationDigest(parsePrepareAllocation(request)), preparationDigest(parsePrepareAllocation({ ...request,
    app: { ...request.app, build: { ...request.app.build, id: 'different' } } })));
  const supplied = parsePrepareAllocation({ ...request, source: { kind: 'supplied', inventoryId: 'stock' } }); assert.equal(supplied.source.kind, 'supplied');
  assert.throws(() => parsePrepareAllocation(undefined)); assert.throws(() => parsePrepareAllocation(1n));
  const circular: Record<string, unknown> = {}; circular.self = circular; assert.throws(() => parsePrepareAllocation(circular));
});

for (const stop of ['abort', 'deadline'] as const) test(`child ${stop} never reports a successful receipt even when its eventual close code is zero`, async () => {
  const f = await allocationFixture(); const h = childHarness(); const source = allocationSourceProcess(f.host, [], h.launch); const controller = new AbortController();
  try { const pending = source('/usr/bin/xcrun', ['simctl', 'create', 'jev-observed-ABCDEF00-0000-4000-8000-000000000001', typeId, runtimeId],
    { shell:false, signal:controller.signal, timeoutMs:stop === 'deadline' ? 5 : 1000, maxOutputBytes:1024 });
    await h.started; if (stop === 'abort') controller.abort(); else await new Promise(r => setTimeout(r, 15));
    assert.ok(h.child.killed > 0); h.child.emit('close', 0, null); assert.equal((await pending).exitCode, null);
  } finally { h.child.emit('close', null, 'SIGTERM'); await f.cleanup(); }
});

test('plist allowlist distinguishes device profiles from runtime OS metadata and rejects every invalid process option', async () => {
  const f = await allocationFixture(); const h = childHarness();
  const forbidden = '/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone 17.simdevicetype/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist';
  f.write(forbidden, {});
  const launch = ((...args: unknown[]) => { h.invocations.push(args); queueMicrotask(() => h.child.emit('close', 0, null)); return h.child; }) as unknown as typeof spawn;
  const source = allocationSourceProcess(f.host, [], launch);
  const options = { shell:false as const, signal:new AbortController().signal, timeoutMs:1000, maxOutputBytes:1024 };
  try { await assert.rejects(source('/usr/bin/plutil', ['-convert','json','-o','-','--',forbidden], options));
    for (const invalid of [{ timeoutMs:0 }, { timeoutMs:900001 }, { maxOutputBytes:0 }, { maxOutputBytes:65537 }, { shell:true },
      { signal:AbortSignal.abort() }]) await assert.rejects(source('/usr/bin/xcrun', ['simctl','create','jev-observed-ABCDEF00-0000-4000-8000-000000000001',typeId,runtimeId], { ...options, ...invalid } as never));
    assert.equal(h.invocations.length, 0);
  } finally { await f.cleanup(); }
});

type AllocationFixture = Awaited<ReturnType<typeof allocationFixture>>;
function overrideInstalledStats(f: AllocationFixture, change: (path: string, stat: Stats, read: number) => Stats) {
  const original = f.host.fs.lstat; const reads = new Map<string, number>();
  f.host.fs.lstat = (async (path: string) => {
    const stat = await original(path); const read = (reads.get(path) ?? 0) + 1; reads.set(path, read);
    return change(path, stat, read);
  }) as typeof original;
}
const applicationsStats = (stat: Stats) => Object.assign(stat, { uid: 0, gid: 80, mode: 0o040775 });
const exactCreate = ['simctl', 'create', 'jev-observed-ABCDEF00-0000-4000-8000-000000000001', typeId, runtimeId];
const processOptions = () => ({ shell: false as const, signal: new AbortController().signal, timeoutMs: 1000, maxOutputBytes: 65536 });
function installedProcessFixture(f: AllocationFixture) {
  const invocations: unknown[][] = [];
  const launch = ((executable: string, args: string[], options: unknown) => {
    invocations.push([executable, args, options]); const { child } = childHarness();
    queueMicrotask(() => { void (async () => {
      try {
        const output = executable === '/usr/bin/plutil'
          ? await (await import('node:fs/promises')).readFile(f.map(args[5]!), 'utf8')
          : 'ABCDEF00-0000-4000-8000-000000000001\n';
        child.stdout.write(output); child.emit('close', 0, null);
      } catch (error) { child.emit('error', error); child.emit('close', 1, null); }
    })(); });
    return child;
  }) as unknown as typeof spawn;
  return { source: allocationSourceProcess(f.host, [], launch), invocations };
}

test('installed Xcode ancestor policy accepts strict paths and the exact root admin Applications exception', async () => {
  for (const exception of [false, true]) {
    const f = await allocationFixture();
    if (exception) overrideInstalledStats(f, (path, stat) => path === '/Applications' ? applicationsStats(stat) : stat);
    const process = installedProcessFixture(f);
    try {
      const proof = await verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, process.source, new AbortController().signal);
      assert.equal(proof.runtimeVersion, '27.0.1'); assert.equal(proof.xcodeBuild, '27A-fixture');
      assert.ok(process.invocations.length > 0); assert.ok(process.invocations.every(call => call[0] === '/usr/bin/plutil'));
      assert.deepEqual(await process.source('/usr/bin/xcrun', exactCreate, processOptions()),
        { exitCode: 0, stdout: 'ABCDEF00-0000-4000-8000-000000000001\n', stderr: '' });
      assert.equal(process.invocations.filter(call => call[0] === '/usr/bin/xcrun').length, 1);
      for (const call of process.invocations) assert.deepEqual((call[2] as { env: unknown }).env,
        { HOME: f.home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', DEVELOPER_DIR: developerDirectory });
      assert.deepEqual(f.calls, []);
    } finally { await f.cleanup(); }
  }
});

for (const surface of ['compatibility', 'process'] as const) for (const change of ['owner', 'group-write', 'other-write', 'symlink', 'type'] as const) {
  test(`installed fresh leaf ${change} refuses at the ${surface} interface`, async () => {
    const f = await allocationFixture(); const process = installedProcessFixture(f);
    const target = surface === 'compatibility' ? '/Applications/Xcode.app/Contents/MacOS/Xcode' : developerDirectory;
    overrideInstalledStats(f, (path, stat, read) => {
      if (path !== target || read !== 2) return stat;
      if (change === 'owner') return Object.assign(stat, { uid: f.host.account.uid + 10000 });
      if (change === 'group-write') return Object.assign(stat, { mode: stat.mode | 0o020 });
      if (change === 'other-write') return Object.assign(stat, { mode: stat.mode | 0o002 });
      return Object.assign(stat, { mode: (stat.mode & 0o7777) | (change === 'symlink' ? 0o120000 : surface === 'compatibility' ? 0o040000 : 0o100000) });
    });
    try {
      if (surface === 'compatibility') {
        await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, process.source,
          new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
        assert.ok(process.invocations.every(call => call[0] === '/usr/bin/plutil'));
      } else {
        await assert.rejects(process.source('/usr/bin/xcrun', exactCreate, processOptions()));
        assert.deepEqual(process.invocations, []);
      }
      assert.deepEqual(f.calls, []);
    } finally { await f.cleanup(); }
  });
}

const unsafeApplications: [string, (stat: Stats, f: AllocationFixture) => Stats][] = [
  ['account owner', (stat, f) => { const uid = f.host.account.uid || 501; f.host.account.uid = uid; return Object.assign(stat, { uid }); }],
  ['foreign owner', (stat, f) => Object.assign(stat, { uid: f.host.account.uid + 10000 })],
  ['foreign group', stat => Object.assign(stat, { gid: 20 })],
  ['world write', stat => Object.assign(stat, { mode: 0o040777 })],
  ['other write without group write', stat => Object.assign(stat, { mode: 0o040757 })],
  ['different group permissions', stat => Object.assign(stat, { mode: 0o040735 })],
  ['sticky bit', stat => Object.assign(stat, { mode: 0o041775 })],
  ['setgid bit', stat => Object.assign(stat, { mode: 0o042775 })],
  ['setuid bit', stat => Object.assign(stat, { mode: 0o044775 })],
  ['symlink', stat => Object.assign(stat, { mode: 0o120775 })],
  ['file', stat => Object.assign(stat, { mode: 0o100775 })],
];
for (const [name, change] of unsafeApplications) test(`installed Applications exception refuses ${name} without dispatch`, async () => {
  const f = await allocationFixture(); const process = installedProcessFixture(f);
  overrideInstalledStats(f, (path, stat) => path === '/Applications' ? change(applicationsStats(stat), f) : stat);
  try {
    await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, process.source,
      new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
    await assert.rejects(process.source('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', xcodeInfoPath], processOptions()));
    await assert.rejects(process.source('/usr/bin/xcrun', exactCreate, processOptions()));
    assert.deepEqual(process.invocations, []); assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

const strictInstalledPaths = ['/Applications/Xcode.app', '/Applications/Xcode.app/Contents', developerDirectory,
  xcodeInfoPath, runtimeProfilePath, '/Library', '/usr'];
for (const target of strictInstalledPaths) for (const change of ['group-write', 'foreign-owner', 'symlink'] as const) {
  test(`installed Applications exception keeps ${target} strict for ${change}`, async () => {
    const f = await allocationFixture(); const process = installedProcessFixture(f);
    overrideInstalledStats(f, (path, stat) => {
      if (path === '/Applications') return applicationsStats(stat);
      if (path !== target) return stat;
      if (change === 'foreign-owner') return Object.assign(stat, { uid: f.host.account.uid + 10000 });
      if (change === 'group-write') return Object.assign(stat, { uid: 0, gid: 80, mode: stat.mode | 0o020 });
      return Object.assign(stat, { mode: (stat.mode & 0o7777) | 0o120000 });
    });
    try {
      await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, process.source,
        new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
      assert.ok(process.invocations.every(call => call[0] === '/usr/bin/plutil'));
      const before = process.invocations.length;
      const plist = target === xcodeInfoPath || target === runtimeProfilePath || target === '/Library';
      await assert.rejects(process.source(plist ? '/usr/bin/plutil' : '/usr/bin/xcrun',
        plist ? ['-convert', 'json', '-o', '-', '--', target === xcodeInfoPath ? xcodeInfoPath : runtimeProfilePath] : exactCreate, processOptions()));
      assert.equal(process.invocations.length, before); assert.deepEqual(f.calls, []);
    } finally { await f.cleanup(); }
  });
}

test('installed Applications exception permits no alternate or noncanonical Xcode metadata command', async () => {
  const f = await allocationFixture(); const process = installedProcessFixture(f);
  overrideInstalledStats(f, (path, stat) => path === '/Applications' ? applicationsStats(stat) : stat);
  try {
    for (const path of ['/Applications/Info.plist', '/Applications/Other.app/Contents/Info.plist',
      '/Applications/Xcode.app-old/Contents/Info.plist', '/applications/Xcode.app/Contents/Info.plist',
      '/Applications//Xcode.app/Contents/Info.plist', '/Applications/Xcode.app/../Xcode.app/Contents/Info.plist']) {
      await assert.rejects(process.source('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', path], processOptions()));
    }
    assert.deepEqual(process.invocations, []); assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

for (const change of ['hardlink', 'size'] as const) test(`installed Applications exception preserves metadata ${change} refusal`, async () => {
  const f = await allocationFixture(); const process = installedProcessFixture(f); const fs = await import('node:fs/promises');
  overrideInstalledStats(f, (path, stat) => path === '/Applications' ? applicationsStats(stat) : stat);
  try {
    if (change === 'hardlink') await fs.link(f.map(xcodeInfoPath), f.map(xcodeInfoPath + '.alias'));
    else await fs.writeFile(f.map(xcodeInfoPath), ' '.repeat(65537));
    await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, process.source,
      new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
    await assert.rejects(process.source('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', xcodeInfoPath], processOptions()));
    assert.deepEqual(process.invocations, []); assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test('installed Applications policy rechecks unsafe ancestor changes after metadata conversion', async () => {
  const f = await allocationFixture(); const process = installedProcessFixture(f); let changed = false;
  overrideInstalledStats(f, (path, stat) => path === '/Applications'
    ? Object.assign(applicationsStats(stat), changed ? { mode: 0o040777 } : {}) : stat);
  const source: typeof f.source = async (...args) => { const result = await process.source(...args); changed = true; return result; };
  try {
    await assert.rejects(verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, source,
      new AbortController().signal), /HOST_PREREQUISITE_MISSING/);
    assert.equal(process.invocations.length, 1); assert.equal(process.invocations[0]![0], '/usr/bin/plutil');
    await assert.rejects(process.source('/usr/bin/xcrun', exactCreate, processOptions()));
    assert.equal(process.invocations.length, 1); assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test('installed Applications policy checks permission trust without certifying ancestor identity stability', async () => {
  const f = await allocationFixture(); const process = installedProcessFixture(f); const identities = new Set<number>();
  overrideInstalledStats(f, (path, stat, read) => {
    if (path !== '/Applications') return stat;
    const result = Object.assign(applicationsStats(stat), { ino: stat.ino + read }); identities.add(result.ino); return result;
  });
  try {
    assert.equal((await verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, process.source,
      new AbortController().signal)).runtimeVersion, '27.0.1');
    assert.ok(identities.size > 1); assert.ok(process.invocations.every(call => call[0] === '/usr/bin/plutil'));
    assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});
