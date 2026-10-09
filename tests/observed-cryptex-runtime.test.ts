import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import * as fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { spawn } from 'node:child_process';
import type { Stats } from 'node:fs';
import type { SourceProcess } from '../src/observed/create-source.js';
import { allocationSourceProcess, developerDirectory, verifyInstalledCompatibility } from '../src/observed/allocation-config.js';
import { allocationFixture, typeId, runtimeId, runtimeBundle } from './fixtures/observed-allocation-backend.js';
import { mapPublicFixturePath } from './fixtures/observed-cli-server.js';
import { cryptexFixture, cryptexDirectory, cryptexMount, cryptexRuntimes, cryptexBundle, cryptexInfo,
  cryptexProfile, cryptexSystem, cryptexRuntimeRoot, readonlyMountXml } from './fixtures/observed-cryptex-runtime.js';

const purePublicRoot = '/private/tmp/jev-public-pure-fixture';
for (const path of ['/', '/private', cryptexInfo]) {
  test(`the pure public fixture maps ${path} into its temporary host tree`, () => {
    assert.equal(mapPublicFixturePath(purePublicRoot, path), join(purePublicRoot, 'host', path));
  });
}
for (const path of [purePublicRoot, join(purePublicRoot, 'home'), join(purePublicRoot, 'runs', 'owned.json')]) {
  test(`the pure public fixture preserves its owned temporary path ${path}`, () => {
    assert.equal(mapPublicFixturePath(purePublicRoot, path), path);
  });
}
for (const path of ['/Applications/Xcode.app', '/Library/Developer', '/System/Library', '/usr/bin/plutil']) {
  test(`the pure public fixture preserves installed mapping for ${path}`, () => {
    assert.equal(mapPublicFixturePath(purePublicRoot, path), join(purePublicRoot, 'host', path));
  });
}
for (const path of ['/private-other', '/Applications-other', '/opt/fixture', 'relative/fixture']) {
  test(`the pure public fixture preserves unrelated mapping for ${path}`, () => {
    assert.equal(mapPublicFixturePath(purePublicRoot, path), path);
  });
}

for (const path of ['/', '/private', cryptexInfo]) {
  test(`the installed fixture maps ${path} into its temporary host tree`, async () => {
    const fixture = await allocationFixture();
    try { assert.equal(fixture.map(path), join(fixture.root, 'host', path)); }
    finally { await fixture.cleanup(); }
  });
}
for (const key of ['root', 'home', 'app', 'store', 'configPath'] as const) {
  test(`the installed fixture preserves its owned temporary ${key} path`, async () => {
    const fixture = await allocationFixture();
    try { assert.equal(fixture.map(fixture[key]), fixture[key]); }
    finally { await fixture.cleanup(); }
  });
}

test('the approved readonly Cryptex layout supplies exact installed compatibility without creation', async () => {
  const fixture = await cryptexFixture();
  try {
    const proof = await verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, fixture.host, fixture.source, new AbortController().signal);
    assert.deepEqual(proof, { architecture: 'arm64', runtimeVersion: '27.0', hostVersion: '27.0.1',
      xcodeVersion: '27.0', xcodeBuild: '27A-fixture', runtimeBuild: '24A434' });
    assert.ok(fixture.effects.every(effect => effect.executable !== '/usr/bin/xcrun'));
  } finally { await fixture.cleanup(); }
});

test('production composition authorizes the approved Cryptex conversion between fresh mount proofs', async () => {
  const fixture = await cryptexFixture();
  try {
    const process = allocationSourceProcess(fixture.host, [], fixture.launch);
    const result = await process('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', cryptexInfo],
      { shell: false, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 });
    assert.equal(result.exitCode, 0); assert.deepEqual(JSON.parse(result.stdout), {
      CFBundleIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0', CFBundleShortVersionString: '392' });
    const converted = fixture.launches.findIndex(effect => effect.executable === '/usr/bin/plutil');
    assert.ok(converted > 0);
    assert.ok(fixture.launches.slice(0, converted).some(effect => effect.executable === '/usr/sbin/diskutil'));
    assert.ok(fixture.launches.slice(converted + 1).some(effect => effect.executable === '/usr/sbin/diskutil'));
    for (const effect of fixture.launches) {
      assert.equal(effect.options.shell, false);
      assert.deepEqual(effect.options.env, { HOME: fixture.home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        LANG: 'C', LC_ALL: 'C', DEVELOPER_DIR: developerDirectory });
    }
    assert.ok(fixture.launches.every(effect => effect.executable !== '/usr/bin/xcrun'));
  } finally { await fixture.cleanup(); }
});

test('production composition proves all three Cryptex runtime leaves without a native process', async () => {
  const f = await cryptexFixture();
  try {
    const source = allocationSourceProcess(f.host, [cryptexDirectory], f.launch);
    const proof = await verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, source, new AbortController().signal);
    assert.equal(proof.runtimeVersion, '27.0'); assert.equal(proof.runtimeBuild, '24A434');
    for (const path of [cryptexInfo, cryptexProfile, cryptexSystem])
      assert.equal(f.launches.filter(effect => effect.executable === '/usr/bin/plutil' && effect.args[5] === path).length, 1);
    assert.equal(f.launches.filter(effect => effect.executable === '/usr/sbin/diskutil').length, 14);
    assert.equal(f.launches.length, 22);
  } finally { await f.cleanup(); }
});

type Fixture = Awaited<ReturnType<typeof cryptexFixture>>;
const compatibility = (f: Fixture, source = f.source, signal = new AbortController().signal) =>
  verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, source, signal);
const conversion = (f: Fixture, path = cryptexInfo, roots: string[] = []) =>
  allocationSourceProcess(f.host, roots, f.launch)('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', path],
    { shell: false, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 });

test('the Cryptex fixture preserves inherited temporary paths and account stats', async () => {
  const f = await cryptexFixture();
  try {
    for (const path of [f.root, f.home, f.app, f.store, f.configPath]) assert.equal(f.map(path), path);
    assert.equal((await f.host.fs.lstat(f.configPath)).uid, f.host.account.uid);
  } finally { await f.cleanup(); }
});

test('the absent Cryptex namespace is an isolated ENOENT and leaves the existing runtime proof intact', async () => {
  const f = await allocationFixture();
  try {
    await assert.rejects(f.host.fs.lstat(cryptexDirectory), { code: 'ENOENT' });
    const proof = await verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, f.source, new AbortController().signal);
    assert.equal(proof.runtimeBuild, '27A-fixture');
    assert.ok(f.calls.every(call => call !== 'create'));
  } finally { await f.cleanup(); }
});

const unsafeStats: [string, string, Partial<Stats>][] = [
  ['writable root', '/', { mode: 0o40777 }],
  ['foreign private owner', '/private', { uid: 123456 }],
  ['foreign run owner', '/private/var/run', { uid: 123456 }],
  ['wrong run group', '/private/var/run', { gid: 80 }],
  ['other writable run', '/private/var/run', { mode: 0o40777 }],
  ['sticky run', '/private/var/run', { mode: 0o41775 }],
  ['symlink run', '/private/var/run', { mode: 0o120777 }],
  ['file namespace', cryptexDirectory, { mode: 0o100755 }],
  ['foreign cryptexd owner', '/private/var/run/com.apple.security.cryptexd', { uid: 123456 }],
  ['writable cryptexd', '/private/var/run/com.apple.security.cryptexd', { mode: 0o40775 }],
  ['writable mount parent', cryptexDirectory, { mode: 0o40775 }],
  ['foreign mount owner', cryptexMount, { uid: 123456 }],
  ['daemon mount group', cryptexMount, { gid: 1 }],
  ['symlink mount', cryptexMount, { mode: 0o120755 }],
  ['sticky mount', cryptexMount, { mode: 0o41775 }],
  ['setgid mount', cryptexMount, { mode: 0o42775 }],
  ['nested device transition', cryptexRuntimes, { dev: 99999 }],
  ['foreign directory group', cryptexBundle, { gid: 1 }],
  ['other writable directory', cryptexBundle, { mode: 0o40777 }],
  ['sticky ordinary directory', cryptexBundle, { mode: 0o41775 }],
  ['setuid RuntimeRoot', cryptexRuntimeRoot, { mode: 0o44775 }],
  ['setgid RuntimeRoot', cryptexRuntimeRoot, { mode: 0o42775 }],
  ['foreign leaf owner', cryptexInfo, { uid: 123456 }],
  ['foreign leaf group', cryptexInfo, { gid: 1 }],
  ['other writable leaf', cryptexInfo, { mode: 0o100666 }],
  ['executable leaf', cryptexInfo, { mode: 0o100755 }],
  ['setuid leaf', cryptexInfo, { mode: 0o104644 }],
  ['sticky leaf', cryptexInfo, { mode: 0o101644 }],
  ['symlink leaf', cryptexInfo, { mode: 0o120644 }],
  ['directory leaf', cryptexInfo, { mode: 0o40644 }],
  ['aliased leaf', cryptexInfo, { nlink: 2 }],
  ['oversized leaf', cryptexInfo, { size: 65537 }],
  ['wrong leaf device', cryptexInfo, { dev: 99999 }],
];
for (const [name, path, override] of unsafeStats) {
  test(`installed compatibility refuses ${name}`, async () => {
    const f = await cryptexFixture();
    try { f.overrides.set(path, override); await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' }); }
    finally { await f.cleanup(); }
  });
}
for (const [name, path, override] of unsafeStats.filter(([, path]) => !path.startsWith(cryptexBundle + '/Contents/Resources/'))) {
  test(`production authorization refuses ${name} even under an overlapping artifact root`, async () => {
    const f = await cryptexFixture();
    try {
      f.overrides.set(path, override); await assert.rejects(conversion(f, cryptexInfo, [cryptexDirectory]));
      assert.ok(f.launches.every(effect => effect.executable !== '/usr/bin/plutil'));
    } finally { await f.cleanup(); }
  });
}

const mountReplies: [string, string, string, number | null][] = [
  ['wrong exact mount', readonlyMountXml.replace(cryptexMount, cryptexMount + '-wrong'), '', 0],
  ...['Writable', 'WritableMedia', 'WritableVolume'].flatMap(key => [
    [key + ' true', readonlyMountXml.replace(`<key>${key}</key><false/>`, `<key>${key}</key><true/>`), '', 0],
    [key + ' string', readonlyMountXml.replace(`<key>${key}</key><false/>`, `<key>${key}</key><string>false</string>`), '', 0],
    [key + ' absent', readonlyMountXml.replace(`<key>${key}</key><false/>`, ''), '', 0],
  ] as [string, string, string, number][]),
  ['duplicate field', readonlyMountXml.replace('</dict>', '<key>Writable</key><false/></dict>'), '', 0],
  ['malformed XML', readonlyMountXml.slice(0, -10), '', 0],
  ['external entity declaration', readonlyMountXml.replace('<plist', '<!ENTITY outside SYSTEM "file:///unread-secret"><plist'), '', 0],
  ['stdout overflow', 'x'.repeat(65537), '', 0],
  ['combined overflow', readonlyMountXml, 'x'.repeat(65536), 0],
  ['unsuccessful exit', readonlyMountXml, '', 1],
  ['uncertain exit', readonlyMountXml, '', null],
];
for (const [name, stdout, stderr, exitCode] of mountReplies) {
  test(`mount proof refuses ${name} before reading runtime bytes`, async () => {
    const f = await cryptexFixture();
    try {
      f.setMountResult({ stdout, stderr, exitCode }); await assert.rejects(conversion(f));
      assert.ok(f.reads.every(read => !(read.operation === 'open' && read.path === cryptexInfo)));
      assert.ok(f.launches.every(effect => effect.executable !== '/usr/bin/plutil'));
    } finally { await f.cleanup(); }
  });
}

for (const [field, value] of Object.entries({ gid: 0, ino: 987654321, dev: 99999, uid: 123456,
  mode: 0o100644, size: 1, ctimeMs: 123456, mtimeMs: 123456, nlink: 2 })) {
  test(`conversion refuses a concurrent leaf ${field} change`, async () => {
    const f = await cryptexFixture();
    try {
      f.setBefore((operation, path) => { if (operation === 'convert' && path === cryptexInfo) f.overrides.set(path, { [field]: value }); });
      await assert.rejects(conversion(f));
      assert.equal(f.launches.filter(effect => effect.executable === '/usr/bin/plutil').length, 1);
    } finally { await f.cleanup(); }
  });
}
for (const path of ['/', '/private/var/run', cryptexDirectory, cryptexMount, cryptexBundle]) {
  test(`conversion refuses a concurrent ancestor replacement at ${path}`, async () => {
    const f = await cryptexFixture();
    try {
      f.setBefore((operation, target) => { if (operation === 'convert' && target === cryptexInfo) f.overrides.set(path, { ino: 987654321 }); });
      await assert.rejects(conversion(f));
    } finally { await f.cleanup(); }
  });
}
test('opened metadata identity must match the same-device path snapshot', async () => {
  const f = await cryptexFixture();
  try {
    f.setBefore((operation, path) => { if (operation === 'opened-stat' && path === cryptexInfo) f.overrides.set(path, { dev: 99999 }); });
    await assert.rejects(conversion(f));
    assert.ok(f.launches.every(effect => effect.executable !== '/usr/bin/plutil'));
  } finally { await f.cleanup(); }
});
test('mount identity changes during bootstrap cannot authorize a metadata read', async () => {
  const f = await cryptexFixture();
  try {
    f.setBefore(operation => { if (operation === 'mount') f.overrides.set(cryptexMount, { ino: 987654321 }); });
    await assert.rejects(conversion(f));
    assert.ok(f.reads.every(read => !(read.operation === 'open' && read.path === cryptexInfo)));
  } finally { await f.cleanup(); }
});
test('a fresh post-conversion query refuses a mount that becomes writable', async () => {
  const f = await cryptexFixture();
  try {
    let mounts = 0;
    f.setBefore(operation => { if (operation === 'mount' && ++mounts === 2) f.setMountResult({ exitCode: 0, stdout: readonlyMountXml.replace('<key>Writable</key><false/>', '<key>Writable</key><true/>'), stderr: '' }); });
    await assert.rejects(conversion(f)); assert.equal(mounts, 2);
    assert.equal(f.launches.filter(effect => effect.executable === '/usr/bin/plutil').length, 1);
  } finally { await f.cleanup(); }
});
test('stable metadata bytes remain required after conversion', async () => {
  const f = await cryptexFixture();
  try {
    f.setBefore((operation, path) => { if (operation === 'convert' && path === cryptexInfo) f.write(path, { CFBundleIdentifier: runtimeId, changed: true }); });
    await assert.rejects(conversion(f));
  } finally { await f.cleanup(); }
});
for (const [name, result] of [
  ['combined conversion overflow', { exitCode: 0, stdout: '{}', stderr: 'x'.repeat(65535) }],
  ['conversion exit failure', { exitCode: 1, stdout: '{}', stderr: '' }],
  ['array conversion result', { exitCode: 0, stdout: '[]', stderr: '' }],
  ['malformed conversion JSON', { exitCode: 0, stdout: '{', stderr: '' }],
] as const) {
  test(`installed compatibility refuses ${name}`, async () => {
    const f = await cryptexFixture();
    try { f.setConvertedResult(result); await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' }); }
    finally { await f.cleanup(); }
  });
}

for (const [name, entries] of [
  ['more than 1000 namespace entries', Array.from({ length: 1001 }, (_, i) => `irrelevant-${i}`)],
  ['more than 64 matching mount roots', Array.from({ length: 65 }, (_, i) => `com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.fixture${i}`)],
  ['overlong namespace basename', ['x'.repeat(256)]],
  ['namespace slash alias', ['unsafe/name']],
  ['namespace NUL alias', ['unsafe\0name']],
] as const) {
  test(`discovery refuses ${name} before querying mounts`, async () => {
    const f = await cryptexFixture();
    try {
      f.listings.set(cryptexDirectory, [...entries]); await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' });
      assert.ok(f.effects.every(effect => effect.executable !== '/usr/sbin/diskutil'));
    } finally { await f.cleanup(); }
  });
}
test('mount-name version is not used as the runtime identifier', async () => {
  const f = await cryptexFixture();
  try { f.write(cryptexInfo, { CFBundleIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' });
    await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' }); }
  finally { await f.cleanup(); }
});
for (const [name, path, value] of [
  ['wrong runtime architecture', cryptexProfile, { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0', supportedArchs: ['x86_64'], supportedProductFamilyIDs: [1], defaultVersionString: '27.0' }],
  ['wrong runtime platform', cryptexProfile, { platformIdentifier: 'com.apple.platform.iphoneos', minHostVersion: '14.0', supportedArchs: ['arm64'], supportedProductFamilyIDs: [1], defaultVersionString: '27.0' }],
  ['missing product family', cryptexProfile, { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0', supportedArchs: ['arm64'], supportedProductFamilyIDs: [2], defaultVersionString: '27.0' }],
  ['newer minimum host', cryptexProfile, { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '28.0', supportedArchs: ['arm64'], supportedProductFamilyIDs: [1], defaultVersionString: '27.0' }],
  ['declared runtime version mismatch', cryptexProfile, { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0', supportedArchs: ['arm64'], supportedProductFamilyIDs: [1], defaultVersionString: '26.4' }],
  ['actual runtime version mismatch', cryptexSystem, { ProductVersion: '26.4', ProductBuildVersion: '24A434' }],
  ['missing actual build', cryptexSystem, { ProductVersion: '27.0' }],
] as const) {
  test(`Cryptex compatibility still refuses ${name}`, async () => {
    const f = await cryptexFixture();
    try { f.write(path, value); await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' }); }
    finally { await f.cleanup(); }
  });
}
test('duplicate explicit runtime matches across old and Cryptex roots are refused', async () => {
  const f = await cryptexFixture();
  try { f.listings.set(runtimeBundle.slice(0, runtimeBundle.lastIndexOf('/')), ['iOS 27.0.simruntime']);
    await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' }); }
  finally { await f.cleanup(); }
});
test('the aggregate runtime bound includes both legacy and Cryptex bundles before conversion', async () => {
  const f = await cryptexFixture();
  try {
    f.listings.set(runtimeBundle.slice(0, runtimeBundle.lastIndexOf('/')), Array.from({ length: 1000 }, (_, i) => `iOS ${i}.simruntime`));
    await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' });
    assert.ok(f.effects.every(effect => !(effect.executable === '/usr/bin/plutil' && effect.args[5]?.includes('.simruntime/'))));
  } finally { await f.cleanup(); }
});
for (const [name, root, entries] of [
  ['runtime bundle listing cap', cryptexRuntimes, Array.from({ length: 1001 }, (_, i) => `iOS ${i}.simruntime`)],
  ['runtime basename cap', cryptexRuntimes, ['x'.repeat(256) + '.simruntime']],
  ['device listing cap', '/Library/Developer/CoreSimulator/Profiles/DeviceTypes', Array.from({ length: 1001 }, (_, i) => `phone${i}.simdevicetype`)],
] as const) {
  test(`discovery retains the ${name}`, async () => {
    const f = await cryptexFixture();
    try { f.listings.set(root, [...entries]); await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' }); }
    finally { await f.cleanup(); }
  });
}

for (const path of [cryptexMount + '/Info.plist', cryptexInfo + '/extra', cryptexInfo.replace('/Contents/', '/Contents/../Contents/'),
  cryptexDirectory + '/com.apple.iPhoneOS.SimulatorRuntime-v24.1.fixture' + cryptexInfo.slice(cryptexMount.length),
  cryptexDirectory + '/x'.repeat(4100) + '/Info.plist', cryptexInfo + '\0']) {
  test(`artifact overlap cannot authorize the unsupported Cryptex target ${path.slice(0, 150)}`, async () => {
    const f = await cryptexFixture();
    try { await assert.rejects(conversion(f, path, [cryptexDirectory])); assert.equal(f.launches.length, 0); }
    finally { await f.cleanup(); }
  });
}

test('a cancelled batch does not enumerate, read or dispatch', async () => {
  const f = await cryptexFixture();
  try {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(compatibility(f, f.source, controller.signal), { reason: 'HOST_PREREQUISITE_MISSING' });
    assert.equal(f.reads.length, 0); assert.equal(f.effects.length, 0);
  } finally { await f.cleanup(); }
});
test('cancellation after mount confirmation stops before runtime metadata dispatch', async () => {
  const f = await cryptexFixture();
  try {
    const controller = new AbortController();
    f.setBefore(operation => { if (operation === 'mount') controller.abort(); });
    await assert.rejects(compatibility(f, f.source, controller.signal), { reason: 'HOST_PREREQUISITE_MISSING' });
    assert.equal(f.effects.filter(effect => effect.executable === '/usr/sbin/diskutil').length, 1);
    assert.ok(f.effects.every(effect => !effect.args[5]?.startsWith(cryptexMount + '/')));
  } finally { await f.cleanup(); }
});

test('the production child budget counts hidden mount proofs as actual launches', async () => {
  const f = await cryptexFixture();
  try {
    const cache = new Map<string, Stats>();
    const host = { ...f.host, fs: { ...f.host.fs, lstat: (async (path: string) => {
      if (!cache.has(path)) cache.set(path, await f.host.fs.lstat(path)); return cache.get(path)!;
    }) as typeof fs.lstat } };
    const process = allocationSourceProcess(host, [], f.launch);
    for (let i = 0; i < 2730; i++) await process('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', cryptexInfo],
      { shell: false, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 });
    assert.equal(f.launches.length, 8190);
    await assert.rejects(process('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', cryptexInfo],
      { shell: false, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 }));
    assert.equal(f.launches.length, 8192);
    assert.equal(f.launches.filter(effect => effect.executable === '/usr/sbin/diskutil').length, 5461);
    const fresh = allocationSourceProcess(host, [], f.launch);
    assert.equal((await fresh('/usr/sbin/diskutil', ['info', '-plist', cryptexMount],
      { shell: false, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 })).exitCode, 0);
    assert.equal(f.launches.length, 8193);
  } finally { await f.cleanup(); }
});

for (const trigger of ['timeout', 'abort', 'overflow'] as const) {
  test(`diskutil ${trigger} escalates once but remains pending until actual close`, async t => {
    const f = await cryptexFixture();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
        signals: [] as string[], kill(signal: string) { this.signals.push(signal); return true; } });
      let launched = false;
      const launch = ((executable: string) => { assert.equal(executable, '/usr/sbin/diskutil'); launched = true; return child; }) as unknown as typeof spawn;
      const controller = new AbortController(); let settled = false;
      const pending = allocationSourceProcess(f.host, [], launch)('/usr/sbin/diskutil', ['info', '-plist', cryptexMount],
        { shell: false, signal: controller.signal, timeoutMs: 10000, maxOutputBytes: 65536 });
      void pending.then(() => { settled = true; }, () => { settled = true; });
      while (!launched) await nextTurn();
      if (trigger === 'timeout') t.mock.timers.tick(10000);
      else if (trigger === 'abort') controller.abort();
      else child.stdout.write('x'.repeat(65537));
      assert.deepEqual(child.signals, ['SIGTERM']); assert.equal(settled, false);
      t.mock.timers.tick(250); await nextTurn();
      assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']); assert.equal(settled, false);
      child.emit('close', null, 'SIGKILL');
      if (trigger === 'abort') await assert.rejects(pending); else assert.equal((await pending).exitCode, null);
      assert.equal(settled, true); t.mock.timers.tick(10000); assert.equal(child.signals.length, 2);
    } finally { t.mock.timers.reset(); await f.cleanup(); }
  });
}

test('metadata command authorization rejects substituted executable, argv and budgets before launch', async () => {
  const f = await cryptexFixture();
  try {
    const process = allocationSourceProcess(f.host, [], f.launch);
    const options = { shell: false as const, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 };
    for (const [executable, args] of [
      ['/bin/diskutil', ['info', '-plist', cryptexMount]],
      ['/usr/sbin/diskutil', ['info', '-plist', cryptexMount, 'extra']],
      ['/usr/sbin/diskutil', ['list', '-plist', cryptexMount]],
      ['/usr/sbin/diskutil', ['info', '-plist', cryptexMount + '/Library']],
      ['/usr/sbin/diskutil', ['info', '-plist', cryptexMount.replace('/private/', '/private/../private/')]],
    ] as [string, string[]][]) await assert.rejects(process(executable, args, options));
    for (const overrides of [{ timeoutMs: 10001 }, { timeoutMs: 0 }, { timeoutMs: NaN }, { maxOutputBytes: 65537 }, { maxOutputBytes: 0 }, { maxOutputBytes: NaN }, { shell: true }])
      await assert.rejects(process('/usr/sbin/diskutil', ['info', '-plist', cryptexMount], { ...options, ...overrides } as Parameters<SourceProcess>[2]));
    assert.equal(f.launches.length, 0);
  } finally { await f.cleanup(); }
});

for (const mode of [0o444, 0o644, 0o664]) for (const gid of [0, 80]) {
  test(`confirmed readonly metadata permits only the stated leaf mode ${mode.toString(8)} and group ${gid}`, async () => {
    const f = await cryptexFixture();
    try { f.overrides.set(cryptexInfo, { mode: 0o100000 | mode, gid }); assert.equal((await conversion(f)).exitCode, 0); }
    finally { await f.cleanup(); }
  });
}
test('the Cryptex input and converted output accept exactly 64KiB', async () => {
  const f = await cryptexFixture();
  try {
    const value = { CFBundleIdentifier: runtimeId, padding: '' };
    value.padding = 'x'.repeat(65536 - Buffer.byteLength(JSON.stringify(value)));
    f.write(cryptexInfo, value); const result = await conversion(f);
    assert.equal(result.exitCode, 0); assert.equal(Buffer.byteLength(result.stdout), 65536);
  } finally { await f.cleanup(); }
});
test('the Cryptex read counts actual bytes even if an injected size understates them', async () => {
  const f = await cryptexFixture();
  try {
    f.write(cryptexInfo, 'x'.repeat(65537)); f.overrides.set(cryptexInfo, { size: 1 });
    await assert.rejects(conversion(f)); assert.ok(f.launches.every(effect => effect.executable !== '/usr/bin/plutil'));
  } finally { await f.cleanup(); }
});
for (const path of [cryptexDirectory, cryptexRuntimes]) {
  test(`enumeration refuses an identity change during listing ${path}`, async () => {
    const f = await cryptexFixture();
    try {
      f.setBefore((operation, target) => { if (operation === 'readdir' && target === path) f.overrides.set(path, { ino: 987654321 }); });
      await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' });
      assert.ok(f.effects.every(effect => !effect.args[5]?.startsWith(cryptexMount + '/')));
    } finally { await f.cleanup(); }
  });
}
test('unmatched mount-name grammars are ignored without a mount command or version inference', async () => {
  const f = await cryptexFixture();
  try {
    f.listings.set(cryptexDirectory, [cryptexMount.slice(cryptexDirectory.length + 1),
      'com.apple.iPhoneOS.SimulatorRuntime-v27.0.bad', 'com.apple.iPhoneOS.SimulatorRuntime-v9999.0.0.bad', 'unrelated']);
    assert.equal((await compatibility(f)).runtimeVersion, '27.0');
    assert.ok(f.effects.filter(effect => effect.executable === '/usr/sbin/diskutil').every(effect => effect.args[2] === cryptexMount));
  } finally { await f.cleanup(); }
});
test('runtime aggregation refuses more than 1000 bundles across two individually bounded Cryptex roots', async () => {
  const f = await cryptexFixture();
  try {
    const other = cryptexDirectory + '/com.apple.iPhoneOS.SimulatorRuntime-v25.0.0.second';
    const root = other + '/Library/Developer/CoreSimulator/Profiles/Runtimes'; f.write(root + '/.fixture', '');
    f.listings.set(cryptexRuntimes, Array.from({ length: 501 }, (_, i) => `iOS ${i}.simruntime`));
    f.listings.set(root, Array.from({ length: 500 }, (_, i) => `iOS ${i}.simruntime`));
    const source: SourceProcess = (executable, args, options) => {
      if (executable === '/usr/sbin/diskutil' && args[2] === other) {
        assert.deepEqual(args, ['info', '-plist', other]);
        return Promise.resolve({ exitCode: 0, stdout: readonlyMountXml.replace(cryptexMount, other), stderr: '' });
      }
      return f.source(executable, args, options);
    };
    await assert.rejects(compatibility(f, source), { reason: 'HOST_PREREQUISITE_MISSING' });
    assert.ok(f.effects.every(effect => !effect.args[5]?.includes('.simruntime/')));
  } finally { await f.cleanup(); }
});
test('an error notification does not settle a metadata child before close', async () => {
  const f = await cryptexFixture();
  try {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() { return true; } });
    let launched = false; let settled = false;
    const launch = (() => { launched = true; return child; }) as unknown as typeof spawn;
    const pending = allocationSourceProcess(f.host, [], launch)('/usr/sbin/diskutil', ['info', '-plist', cryptexMount],
      { shell: false, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 });
    void pending.then(() => { settled = true; }, () => { settled = true; });
    while (!launched) await nextTurn();
    child.emit('error', new Error('fixture child uncertainty')); await nextTurn(); assert.equal(settled, false);
    child.emit('close', null, null); await assert.rejects(pending, /fixture child uncertainty/); assert.equal(settled, true);
  } finally { await f.cleanup(); }
});

for (const [name, path, override] of [
  ['nonexecuting diskutil', '/usr/sbin/diskutil', { mode: 0o100644 }],
  ['writable diskutil', '/usr/sbin/diskutil', { mode: 0o100775 }],
  ['symlink diskutil', '/usr/sbin/diskutil', { mode: 0o120755 }],
  ['foreign diskutil owner', '/usr/sbin/diskutil', { uid: 123456 }],
  ['writable command ancestor', '/usr/sbin', { mode: 0o40775 }],
  ['writable Xcode tree', developerDirectory, { mode: 0o40775 }],
] as [string, string, Partial<Stats>][]) {
  test(`mount bootstrap refuses ${name}`, async () => {
    const f = await cryptexFixture();
    try { f.overrides.set(path, override); await assert.rejects(conversion(f)); assert.equal(f.launches.length, 0); }
    finally { await f.cleanup(); }
  });
}
