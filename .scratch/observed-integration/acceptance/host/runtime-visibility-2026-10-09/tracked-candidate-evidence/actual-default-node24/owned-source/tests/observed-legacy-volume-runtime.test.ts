import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { spawn } from 'node:child_process';
import { allocationSourceProcess, verifyInstalledCompatibility, trackAllocationSourceProcess, isProductionSourceProcess } from '../src/observed/allocation-config.js';
import { typeId, runtimeId, runtimeBundle, allocationFixture } from './fixtures/observed-allocation-backend.js';
import { mapPublicFixturePath } from './fixtures/observed-cli-server.js';
import { cryptexMount, cryptexBundle } from './fixtures/observed-cryptex-runtime.js';
import { legacyFixture, mapLegacyFixturePath, legacyDirectory, legacyMount, legacyRuntimes, legacyBundle,
  legacyInfo, legacyProfile, legacyRuntimeRoot, legacySystem, readonlyXml } from './fixtures/observed-legacy-volume-runtime.js';

const pureRoot = '/private/tmp/legacy-pure-fixture';
for (const path of ['/', '/Library', legacyDirectory, legacyMount, legacyInfo, '/private', '/usr/sbin/diskutil']) {
  test(`pure legacy and public fixture maps isolate ${path}`, () => {
    assert.equal(mapLegacyFixturePath(pureRoot, path), join(pureRoot, 'host', path));
    assert.equal(mapPublicFixturePath(pureRoot, path), join(pureRoot, 'host', path));
  });
}
for (const path of [pureRoot, join(pureRoot, 'home'), join(pureRoot, 'owned', 'Info.plist')]) {
  test(`pure legacy map preserves owned temporary ${path}`, () => { assert.equal(mapLegacyFixturePath(pureRoot, path), path); });
}
for (const path of ['/opt/outside', 'relative', '/Library/../usr', '/Library\0bad']) {
  test(`pure legacy map refuses unsupported ${JSON.stringify(path)}`, () => { assert.throws(() => mapLegacyFixturePath(pureRoot, path)); });
}

type Fixture = Awaited<ReturnType<typeof legacyFixture>>;
const compatibility = (f: Fixture, production = false, signal = new AbortController().signal) =>
  verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host,
    production ? allocationSourceProcess(f.host, [], f.launch) : f.source, signal);
const convert = (f: Fixture, path = legacyInfo, roots: string[] = [], signal = new AbortController().signal) =>
  allocationSourceProcess(f.host, roots, f.launch)('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', path],
    { shell: false, signal, timeoutMs: 10000, maxOutputBytes: 65536 });
async function refuses(f: Fixture, mutate: () => void | Promise<void>, production = false) {
  await compatibility(f, production); await mutate();
  await assert.rejects(compatibility(f, production), { reason: 'HOST_PREREQUISITE_MISSING' });
}

for (const name of ['iOS_22G86', 'iOS_23E254a']) for (const production of [false, true]) {
  test(`${production ? 'production' : 'injected'} observed legacy group modes accept exact ${name} after fresh proofs`, async () => {
    const f = await legacyFixture({ name });
    try {
      const proof = await compatibility(f, production); assert.equal(proof.runtimeVersion, '27.0'); assert.equal(proof.runtimeBuild, 'legacy-fixture');
      const mount = join(legacyDirectory, name); const queries = f.effects.filter(e => e.executable === '/usr/sbin/diskutil');
      assert.equal(queries.length, production ? 14 : 8); assert.ok(queries.every(e => e.args.join('\0') === ['info', '-plist', mount].join('\0')));
      assert.ok(f.effects.every(e => e.executable !== '/usr/bin/xcrun'));
    } finally { await f.cleanup(); }
  });
}
test('recognized strict-mode legacy mounts still require readonly proof and never use the strict fallback', async () => {
  const f = await legacyFixture({ strictModes: true });
  try { await compatibility(f); assert.equal(f.effects.filter(e => e.executable === '/usr/sbin/diskutil').length, 8); }
  finally { await f.cleanup(); }
});
for (const [label, xml] of [
  ['Writable true', readonlyXml(legacyMount).replace('<key>Writable</key><false/>', '<key>Writable</key><true/>')],
  ['WritableMedia true', readonlyXml(legacyMount).replace('<key>WritableMedia</key><false/>', '<key>WritableMedia</key><true/>')],
  ['WritableVolume true', readonlyXml(legacyMount).replace('<key>WritableVolume</key><false/>', '<key>WritableVolume</key><true/>')],
  ['string false', readonlyXml(legacyMount).replace('<key>Writable</key><false/>', '<key>Writable</key><string>false</string>')],
  ['wrong mount point', readonlyXml(legacyMount + '-other')],
  ['missing field', readonlyXml(legacyMount).replace('<key>WritableVolume</key><false/>', '')],
  ['duplicate field', readonlyXml(legacyMount).replace('</dict>', '<key>Writable</key><false/></dict>')],
  ['malformed XML', '<plist><dict>'],
  ['oversized output', 'x'.repeat(65537)],
] as const) {
  test(`recognized strict-mode legacy refuses ${label} proof`, async () => {
    const f = await legacyFixture({ strictModes: true });
    try { f.mountResults.set(legacyMount, { exitCode: 0, stdout: xml, stderr: '' }); await assert.rejects(compatibility(f), { reason: 'HOST_PREREQUISITE_MISSING' }); }
    finally { await f.cleanup(); }
  });
}
for (const code of [1, null]) test(`recognized strict-mode legacy refuses mount exit ${code}`, async () => {
  const f = await legacyFixture({ strictModes: true });
  try { f.mountResults.set(legacyMount, { exitCode: code, stdout: readonlyXml(legacyMount), stderr: '' }); await assert.rejects(compatibility(f)); }
  finally { await f.cleanup(); }
});

const badStats: [string, string, Record<string, unknown>][] = [
  ['root uid', '/', { uid: 501 }], ['Library uid', '/Library', { uid: 501 }],
  ['namespace uid', legacyDirectory, { uid: 501 }], ['namespace group write', legacyDirectory, { mode: 0o40775 }],
  ['ancestor group write', '/Library/Developer', { mode: 0o40775 }], ['ancestor symlink', '/Library', { isSymbolicLink: () => true }],
  ['mount uid', legacyMount, { uid: 501 }], ['mount gid', legacyMount, { gid: 1 }],
  ['mount world write', legacyMount, { mode: 0o40777 }], ['mount setgid', legacyMount, { mode: 0o42775 }],
  ['mount symlink', legacyMount, { isSymbolicLink: () => true }], ['mount type', legacyMount, { mode: 0o100755 }],
  ['inner directory uid', legacyRuntimes, { uid: 501 }], ['inner directory gid', legacyRuntimes, { gid: 1 }],
  ['inner directory world write', legacyRuntimes, { mode: 0o40777 }], ['inner directory sticky', legacyRuntimes, { mode: 0o41775 }],
  ['RuntimeRoot setgid', legacyRuntimeRoot, { mode: 0o43775 }], ['leaf sticky', legacyInfo, { mode: 0o101664 }],
  ['leaf uid', legacyInfo, { uid: 501 }], ['leaf gid', legacyInfo, { gid: 1 }],
  ['leaf world write', legacyInfo, { mode: 0o100666 }], ['leaf setuid', legacyInfo, { mode: 0o104664 }],
  ['leaf executable', legacyInfo, { mode: 0o100755 }], ['leaf symlink', legacyInfo, { isSymbolicLink: () => true }],
  ['leaf wrong type', legacyInfo, { mode: 0o40664 }], ['hardlink', legacyInfo, { nlink: 2 }],
  ['large file', legacyInfo, { size: 65537 }], ['negative size', legacyInfo, { size: -1 }],
  ['nested directory device', legacyRuntimes, { dev: 9 }], ['leaf device', legacyInfo, { dev: 9 }],
];
for (const [label, path, value] of badStats) for (const production of [false, true]) {
  test(`${production ? 'production' : 'injected'} legacy refuses ${label} without weakening the valid mounted precondition`, async () => {
    const f = await legacyFixture();
    try { await refuses(f, () => { f.overrides.set(path, value); }, production); }
    finally { await f.cleanup(); }
  });
}
for (const field of ['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink']) {
  test(`legacy refuses unsafe numeric ${field} rather than recovering rounded identity`, async () => {
    const f = await legacyFixture({ strictModes: true });
    try { f.overrides.set(legacyInfo, { [field]: Number(2n ** 54n + 1n) }); await assert.rejects(compatibility(f)); }
    finally { await f.cleanup(); }
  });
}
test('distinct large integer identities colliding under Number remain distinguishable', async () => {
  const f = await legacyFixture({ strictModes: true }); const a = 2n ** 54n; const b = a + 1n;
  try {
    assert.equal(Number(a), Number(b)); f.overrides.set(legacyInfo, { ino: Number(a) });
    f.setBefore((operation, path) => { if (operation === 'convert' && path === legacyInfo) f.overrides.set(legacyInfo, { ino: Number(b) }); });
    await assert.rejects(compatibility(f));
  } finally { await f.cleanup(); }
});
test('legacy accepts exact large bigint identity and detects its one-unit replacement', async () => {
  const f = await legacyFixture(); const a = 2n ** 54n;
  try { f.overrides.set(legacyInfo, { ino: a }); await compatibility(f);
    f.setBefore((operation, path) => { if (operation === 'convert' && path === legacyInfo) f.overrides.set(legacyInfo, { ino: a + 1n }); });
    await assert.rejects(compatibility(f));
  } finally { await f.cleanup(); }
});
for (const field of ['ctimeNs', 'mtimeNs']) test(`legacy detects ${field} changes below supplied millisecond precision`, async () => {
  const f = await legacyFixture({ strictModes: true });
  try { f.overrides.set(legacyInfo, { [field]: 1800000000000000000n });
    f.setBefore((operation, path) => { if (operation === 'convert' && path === legacyInfo) f.overrides.set(legacyInfo, { [field]: 1800000000000000001n }); });
    await assert.rejects(compatibility(f));
  } finally { await f.cleanup(); }
});
for (const [label, mutate] of [
  ['namespace appearance', (f: Fixture) => { f.addMount('iOS_22G86'); }],
  ['namespace disappearance', (f: Fixture) => { f.missing.add(legacyDirectory); }],
  ['entry addition', (f: Fixture) => { f.listings.set(legacyDirectory, ['iOS_22G86', 'iOS_23E254a']); }],
  ['entry removal', (f: Fixture) => { f.listings.set(legacyDirectory, []); }],
  ['candidate replacement', (f: Fixture) => { f.overrides.set(legacyMount, { ino: 999999n }); }],
  ['namespace replacement', (f: Fixture) => { f.overrides.set(legacyDirectory, { ino: 999998n }); }],
] as const) test(`legacy final binding refuses ${label}`, async () => {
  const absent = label === 'namespace appearance'; const f = await legacyFixture({ absent, strictModes: true, defaultVisible: absent || label === 'namespace disappearance' });
  try {
    if (label === 'namespace disappearance') { f.listings.set(legacyDirectory, []); }
    f.setBefore((operation, path) => { if (operation === 'convert' && path.endsWith('/Contents/Resources/profile.plist') && !path.includes('DeviceTypes')) mutate(f); });
    await assert.rejects(compatibility(f));
  } finally { await f.cleanup(); }
});
test('stable absent legacy namespace preserves the ordinary explicit runtime proof', async () => {
  const f = await legacyFixture({ absent: true, defaultVisible: true });
  try { const proof = await compatibility(f); assert.equal(proof.runtimeBuild, '27A-fixture'); assert.equal(f.effects.filter(e => e.executable === '/usr/sbin/diskutil').length, 0); }
  finally { await f.cleanup(); }
});
for (const name of ['iOS_22G86', 'iOS_23E254a']) test(`an older recognized ${name} cannot be skipped for a different identifier`, async () => {
  const f = await legacyFixture({ name, strictModes: true, defaultVisible: true });
  try { f.write(join(legacyDirectory, name, 'Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Info.plist'), { CFBundleIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' });
    f.mountResults.set(join(legacyDirectory, name), { exitCode: 0, stdout: readonlyXml(join(legacyDirectory, name)).replace('<key>Writable</key><false/>', '<key>Writable</key><true/>'), stderr: '' });
    await assert.rejects(compatibility(f));
  } finally { await f.cleanup(); }
});
for (const other of ['default', 'legacy', 'cryptex']) test(`duplicate explicit identifiers across legacy and ${other} refuse`, async () => {
  const f = await legacyFixture();
  try { if (other === 'default') f.setDefaultVisible(true); else if (other === 'legacy') f.addMount('iOS_23E254a'); else f.addCryptex(); await assert.rejects(compatibility(f)); }
  finally { await f.cleanup(); }
});
for (const target of [legacyMount + '/arbitrary/Info.plist', legacyMount + '/Contents/Info.plist', legacyInfo.replace('/Contents/', '/../Contents/')]) {
  test(`artifact roots cannot authorize an invalid recognized legacy target ${target}`, async () => {
    const f = await legacyFixture();
    try { await assert.rejects(convert(f, target, [legacyDirectory, legacyMount])); assert.equal(f.launches.length, 0); }
    finally { await f.cleanup(); }
  });
}
test('legacy refuses more than 64 recognized immediate candidates before any mount query', async () => {
  const f = await legacyFixture({ strictModes: true, defaultVisible: true });
  try { f.listings.set(legacyDirectory, Array.from({ length: 65 }, (_, i) => 'iOS_22G' + (i + 1))); await assert.rejects(compatibility(f)); assert.equal(f.effects.filter(e => e.executable === '/usr/sbin/diskutil').length, 0); }
  finally { await f.cleanup(); }
});
for (const [path, names] of [[legacyDirectory, Array.from({ length: 1001 }, (_, i) => 'ignored_' + i)], [legacyRuntimes, Array.from({ length: 1001 }, (_, i) => i + '.simruntime')], [legacyDirectory, ['../escape']], [legacyRuntimes, ['../escape.simruntime']], [legacyDirectory, ['x'.repeat(256)]]] as const) {
  test(`legacy bounded listing refuses ${path} with ${names.length} entries and invalid/overflow names`, async () => {
    const f = await legacyFixture();
    try { await refuses(f, () => { f.listings.set(path, [...names]); }); }
    finally { await f.cleanup(); }
  });
}
test('legacy shared abort dispatches no filesystem or source effect', async () => {
  const f = await legacyFixture(); const abort = new AbortController(); abort.abort();
  try { await assert.rejects(compatibility(f, true, abort.signal)); assert.equal(f.reads.length, 0); assert.equal(f.effects.length, 0); assert.equal(f.launches.length, 0); }
  finally { await f.cleanup(); }
});
test('legacy metadata bytes are checked again after conversion', async () => {
  const f = await legacyFixture();
  try { await refuses(f, () => f.setBefore((operation, path) => { if (operation === 'convert' && path === legacyInfo) f.write(legacyInfo, { CFBundleIdentifier: runtimeId, replaced: true }); })); }
  finally { await f.cleanup(); }
});
test('legacy readonly proof can change during a metadata conversion only by refusing the result', async () => {
  const f = await legacyFixture({ strictModes: true });
  try { f.setBefore((operation, path) => { if (operation === 'convert' && path === legacyInfo) f.mountResults.set(legacyMount, { exitCode: 0, stdout: readonlyXml(legacyMount).replace('<key>Writable</key><false/>', '<key>Writable</key><true/>'), stderr: '' }); }); await assert.rejects(compatibility(f)); }
  finally { await f.cleanup(); }
});
test('legacy initial entry set cannot be aliased by an injected mutable listing array', async () => {
  const f = await legacyFixture({ strictModes: true }); const entries = ['iOS_22G86'];
  try { f.listings.set(legacyDirectory, entries);
    f.setBefore((operation, path) => { if (operation === 'convert' && path === legacyProfile) entries.push('iOS_23E254a'); });
    await assert.rejects(compatibility(f));
  } finally { await f.cleanup(); }
});
for (const field of ['ino', 'gid', 'mode', 'size', 'nlink', 'ctimeNs', 'mtimeNs']) for (const stage of ['convert', 'opened-stat', 'final-opened-stat']) {
  test(`legacy full identity detects ${field} at ${stage}`, async () => {
    const f = await legacyFixture(); let opened = 0;
    try { await compatibility(f);
      f.setBefore((operation, path) => {
        if (path !== legacyInfo) return;
        if (operation === 'opened-stat') opened++;
        if (operation !== (stage === 'convert' ? 'convert' : 'opened-stat') || (stage === 'final-opened-stat' && opened !== 2)) return;
        f.overrides.set(path, { [field]: ({ ino: 999999n, gid: 0n, mode: 0o100644n, size: 1n, nlink: 2n,
          ctimeNs: 1800000000000000001n, mtimeNs: 1800000000000000001n } as Record<string, bigint>)[field] });
      });
      await assert.rejects(compatibility(f));
    } finally { await f.cleanup(); }
  });
}
for (const field of ['ino', 'gid', 'mode', 'mtimeNs', 'ctimeNs']) test(`legacy candidate binding detects allowed-value mount ${field} replacement`, async () => {
  const f = await legacyFixture(); let reads = 0;
  try { f.setBefore((operation, path) => {
    if (operation === 'lstat' && path === legacyMount && ++reads === 2) f.overrides.set(path, { [field]: ({ ino: 999991n, gid: 0n, mode: 0o40755n,
      mtimeNs: 1800000000000000001n, ctimeNs: 1800000000000000001n } as Record<string, bigint>)[field] });
  }); await assert.rejects(compatibility(f)); }
  finally { await f.cleanup(); }
});
for (const path of [legacyDirectory, legacyRuntimes]) test(`legacy detects identity change during ${path} listing`, async () => {
  const f = await legacyFixture();
  try { f.setBefore((operation, p) => { if (operation === 'readdir' && p === path) f.overrides.set(path, { ino: 999999n }); }); await assert.rejects(compatibility(f)); }
  finally { await f.cleanup(); }
});
for (const [label, fields] of [
  ['numeric nanosecond rounding', { ctimeNs: Number(1800000000000000001n) }],
  ['mixed precision', { ctimeNs: undefined }],
  ['nonfinite milliseconds', { ctimeNs: undefined, mtimeNs: undefined, ctimeMs: NaN, mtimeMs: 17.25 }],
  ['unsafe millisecond integer', { ctimeNs: undefined, mtimeNs: undefined, ctimeMs: Number.MAX_SAFE_INTEGER + 1, mtimeMs: 17.25 }],
  ['numeric string integer', { ino: '16777243' }],
  ['fractional identity', { ino: 17.25 }],
] as const) test(`legacy refuses uncertain ${label}`, async () => {
  const f = await legacyFixture();
  try { await refuses(f, () => { f.overrides.set(legacyInfo, { ...fields }); }); }
  finally { await f.cleanup(); }
});
test('legacy preserves fractional safe millisecond timestamps supplied by an injected stat adapter', async () => {
  const f = await legacyFixture();
  try { f.overrides.set(legacyInfo, { ctimeNs: undefined, mtimeNs: undefined, ctimeMs: 17.25, mtimeMs: 19.125 }); await compatibility(f);
    f.setBefore((operation, path) => { if (operation === 'convert' && path === legacyInfo) f.overrides.set(path, { ctimeNs: undefined, mtimeNs: undefined, ctimeMs: 17.2501, mtimeMs: 19.125 }); });
    await assert.rejects(compatibility(f));
  } finally { await f.cleanup(); }
});
for (const gid of [0n, 80n]) for (const mode of [0o100444n, 0o100644n, 0o100664n]) test(`legacy accepts exact leaf group ${gid} mode ${mode.toString(8)}`, async () => {
  const f = await legacyFixture();
  try { for (const path of [legacyInfo, legacyProfile, legacySystem]) f.overrides.set(path, { gid, mode }); await compatibility(f, true); }
  finally { await f.cleanup(); }
});
for (const result of [{ exitCode: 1, stdout: '{}', stderr: '' }, { exitCode: 0, stdout: 'x'.repeat(65537), stderr: '' },
  { exitCode: 0, stdout: '{}', stderr: 'x'.repeat(65535) }, { exitCode: 0, stdout: '[]', stderr: '' }, { exitCode: 0, stdout: 'null', stderr: '' }] as const) {
  test(`legacy refuses conversion exit/output/shape ${result.exitCode}/${result.stdout.length}/${result.stderr.length}`, async () => {
    const f = await legacyFixture();
    try { await refuses(f, () => { f.convertedResults.set(legacyInfo, result); }); }
    finally { await f.cleanup(); }
  });
}
test('legacy actual byte input cannot escape 64KiB through an understated stat size', async () => {
  const f = await legacyFixture();
  try { await refuses(f, () => { f.write(legacyInfo, 'x'.repeat(65537)); f.overrides.set(legacyInfo, { size: 1n }); }); }
  finally { await f.cleanup(); }
});
for (const target of [legacyInfo, legacyMount]) test(`legacy fixed command bounds reject ${target} options before launch`, async () => {
  const f = await legacyFixture(); const source = allocationSourceProcess(f.host, [legacyDirectory], f.launch);
  try { const mount = target === legacyMount; await assert.rejects(source(mount ? '/usr/sbin/diskutil' : '/usr/bin/plutil',
    mount ? ['info', '-plist', target] : ['-convert', 'json', '-o', '-', '--', target],
    { shell: false, signal: new AbortController().signal, timeoutMs: 10001, maxOutputBytes: 65536 })); assert.equal(f.launches.length, 0); }
  finally { await f.cleanup(); }
});
test('legacy total runtime bundles share the 1000 bound with ordinary roots', async () => {
  const f = await legacyFixture({ defaultVisible: true });
  try { f.listings.set(legacyRuntimes, Array.from({ length: 1000 }, (_, i) => i + '.simruntime')); await assert.rejects(compatibility(f));
    assert.ok(f.effects.every(e => e.args[5] !== legacyInfo)); }
  finally { await f.cleanup(); }
});
test('legacy refuses duplicate namespace entry aliases', async () => {
  const f = await legacyFixture();
  try { f.listings.set(legacyDirectory, ['iOS_22G86', 'iOS_22G86']); await assert.rejects(compatibility(f)); }
  finally { await f.cleanup(); }
});
test('legacy recognized mount grammar does not infer a runtime from a build name', async () => {
  const f = await legacyFixture({ name: 'iOS_23E254a' });
  try { const older = f.addMount('iOS_22G86', 'com.apple.CoreSimulator.SimRuntime.iOS-26-4'); const proof = await compatibility(f);
    assert.equal(proof.runtimeVersion, '27.0'); assert.ok(f.effects.some(e => e.executable === '/usr/sbin/diskutil' && e.args[2] === older)); }
  finally { await f.cleanup(); }
});
for (const production of [false, true]) test(`unrecognized iOS_fixture retains strict account ownership allowance ${production}`, async () => {
  const f = await legacyFixture({ name: 'iOS_fixture', strictModes: true });
  try {
    for (const path of ['/', '/Library', '/Library/Developer', '/Library/Developer/CoreSimulator', legacyDirectory]) f.overrides.set(path, { uid: f.host.account.uid });
    assert.equal((await compatibility(f, production)).runtimeVersion, '27.0');
    assert.equal(f.effects.filter(effect => effect.executable === '/usr/sbin/diskutil').length, 0);
  } finally { await f.cleanup(); }
});
test('stable empty legacy presence remains distinct from stable absence and preserves default lookup', async () => {
  const f = await legacyFixture({ defaultVisible: true });
  try { f.listings.set(legacyDirectory, []); assert.equal((await compatibility(f)).runtimeBuild, '27A-fixture'); }
  finally { await f.cleanup(); }
});
test('absent legacy namespace still binds the identity of its observed existing ancestor prefix', async () => {
  const f = await legacyFixture({ absent: true, defaultVisible: true });
  try { f.setBefore((operation, path) => { if (operation === 'convert' && path === runtimeBundle + '/Contents/Resources/profile.plist') f.overrides.set('/Library/Developer/CoreSimulator', { ino: 888888n }); });
    await assert.rejects(compatibility(f)); }
  finally { await f.cleanup(); }
});
for (const field of ['dev', 'ino']) for (const path of ['/', '/Library', legacyMount]) test(`legacy refuses unsafe numeric ${field} in ancestor ${path}`, async () => {
  const f = await legacyFixture();
  try { await refuses(f, () => { f.overrides.set(path, { [field]: Number(2n ** 54n) }); }); }
  finally { await f.cleanup(); }
});
for (const stage of ['convert', 'opened-stat']) test(`legacy checks shared cancellation at ${stage} without a later conversion`, async () => {
  const f = await legacyFixture(); const abort = new AbortController();
  try { f.setBefore((operation, path) => { if (operation === stage && path === legacyInfo) abort.abort(); });
    await assert.rejects(compatibility(f, false, abort.signal));
    const index = f.reads.findIndex(read => read.operation === 'opened-stat' && read.path === legacyInfo);
    if (stage === 'opened-stat') { assert.ok(index >= 0); assert.equal(f.effects.filter(effect => effect.args[5] === legacyInfo).length, 0); }
  } finally { await f.cleanup(); }
});
for (const name of ['iOS_1A1', 'iOS_999ZZZ999999z']) test(`legacy recognizes only bounded exact build grammar ${name}`, async () => {
  const f = await legacyFixture({ name });
  try { assert.equal((await compatibility(f)).runtimeVersion, '27.0'); assert.equal(f.effects.filter(e => e.executable === '/usr/sbin/diskutil').length, 8); }
  finally { await f.cleanup(); }
});
for (const name of ['iOS_1000A1', 'iOS_1AAAA1', 'iOS_1A1000000', 'iOS_1A1zz', 'iOS_1a1', 'prefix_iOS_22G86']) {
  test(`unrecognized ${name} retains strict permissions and receives no mounted exception`, async () => {
    const f = await legacyFixture({ name });
    try { await assert.rejects(compatibility(f)); assert.equal(f.effects.filter(e => e.executable === '/usr/sbin/diskutil').length, 0); }
    finally { await f.cleanup(); }
  });
}
test('legacy mount termination waits for actual close after deadline and bounded escalation', async t => {
  const f = await legacyFixture(); t.mock.timers.enable({ apis: ['setTimeout'] });
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), signals: [] as string[], kill(signal: string) { this.signals.push(signal); return true; } });
  let launched = false; let settled = false;
  const launch = (() => { launched = true; return child; }) as unknown as typeof spawn;
  const source = allocationSourceProcess(f.host, [], launch);
  const pending = source('/usr/sbin/diskutil', ['info', '-plist', legacyMount], { shell: false, signal: new AbortController().signal, timeoutMs: 10000, maxOutputBytes: 65536 }).then(value => { settled = true; return value; }, error => { settled = true; throw error; });
  pending.catch(() => {});
  try {
    for (let i = 0; i < 20 && !launched && !settled; i++) await nextTurn(); assert.equal(launched, true);
    t.mock.timers.tick(10000); assert.deepEqual(child.signals, ['SIGTERM']); assert.equal(settled, false);
    t.mock.timers.tick(250); assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']); assert.equal(settled, false);
    child.emit('close', null, 'SIGKILL'); assert.equal((await pending).exitCode, null);
  } finally { if (launched && !settled) child.emit('close', null, 'SIGKILL'); await pending.catch(() => {}); await f.cleanup(); }
});

const correctionLeaves = ['Contents/Info.plist', 'Contents/Resources/profile.plist',
  'Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist'] as const;
async function correctionFixture(kind: 'legacy' | 'cryptex') {
  const fixture = await legacyFixture({ absent: kind === 'cryptex' });
  if (kind === 'cryptex') fixture.addCryptex();
  const mount = kind === 'legacy' ? legacyMount : cryptexMount;
  const bundle = kind === 'legacy' ? legacyBundle : cryptexBundle;
  fixture.overrides.set(mount, { ino: 101n });
  return { fixture, mount, bundle };
}
function clearCorrectionLog(f: Fixture) {
  f.reads.length = 0; f.identities.length = 0; f.effects.length = 0; f.launches.length = 0;
}
for (const kind of ['legacy', 'cryptex'] as const) for (const leaf of correctionLeaves) {
  for (const layer of ['caller', 'factory conversion', 'factory bootstrap'] as const) {
    test(`review correction ${kind} binds ${leaf} during restored ${layer} identity`, async t => {
      const { fixture: f, mount, bundle } = await correctionFixture(kind); const path = join(bundle, leaf);
      const production = layer !== 'caller'; let changed = false; let restored = false;
      try {
        assert.equal((await compatibility(f, production)).runtimeVersion, '27.0');
        // Derive the injected window from its actual successful filesystem log.
        const firstOpen = f.reads.findIndex(read => read.operation === 'open' && read.path === path);
        const lastClose = f.reads.findLastIndex(read => read.operation === 'close' && read.path === path);
        assert.ok(firstOpen >= 0 && lastClose > firstOpen);
        const initialMountReads = f.reads.slice(0, firstOpen).filter(read => read.operation === 'lstat' && read.path === mount).length;
        const finalMountReads = f.reads.slice(0, lastClose).filter(read => read.operation === 'lstat' && read.path === mount).length;
        clearCorrectionLog(f); let bootstrapStart: number | undefined;
        f.setBefore((operation, target) => {
          const mountReads = f.reads.filter(read => read.operation === 'lstat' && read.path === mount).length;
          const closes = f.reads.filter(read => read.operation === 'close' && read.path === path).length;
          const change = () => { f.overrides.set(mount, { ino: 202n }); changed = true; };
          const restore = () => { f.overrides.set(mount, { ino: 101n }); restored = true; };
          if (layer === 'caller' && operation === 'lstat' && target === mount) {
            if (mountReads === initialMountReads - 2) change();
            if (mountReads === finalMountReads + 1) restore();
          }
          // Production windows use only this fixture's real open/close log, not
          // the injected layer's observation counts.
          if (layer === 'factory conversion' && operation === 'close' && target === path) {
            if (closes === 1) change();
            if (closes === 3) restore();
          }
          if (layer === 'factory bootstrap') {
            if (operation === 'close' && target === path && closes === 1) bootstrapStart = mountReads;
            if (operation === 'lstat' && target === mount && bootstrapStart !== undefined) {
              if (mountReads === bootstrapStart + 2) change();
              if (mountReads === bootstrapStart + 4) restore();
            }
          }
        });
        const outcome = await compatibility(f, production).then(value => ({ value, error: undefined }),
          error => ({ value: undefined, error }));
        const observed = f.identities.filter(identity => identity.operation === 'lstat' && identity.path === mount);
        t.diagnostic(JSON.stringify({ kind, leaf, layer, changed, restored, accepted: !!outcome.value,
          mountObservations: observed.map((identity, index) => ({ ordinal: index + 1, ino: identity.ino })),
          metadataConversions: f.effects.filter(effect => effect.args[5] === path).length,
          fixtureLaunches: f.launches.length, readonlyXmlUnchanged: !f.mountResults.size }));
        assert.equal(changed, true, 'The valid mounted fixture must enter the mismatch window');
        assert.ok(observed.some(identity => identity.ino === '202'), 'The verifier must actually observe the changed mount');
        if (outcome.value) assert.equal(restored, true, 'The original accepting trace restores identity before final validation');
        assert.equal(outcome.error?.reason, 'HOST_PREREQUISITE_MISSING', 'Observed identity restoration must refuse compatibility');
        assert.equal(f.effects.filter(effect => effect.args[5] === path).length, 0, 'No mismatching metadata conversion may launch');
      } finally { await f.cleanup(); }
    });
  }
  for (const production of [false, true]) for (const stage of ['open-result', 'eof-read-result'] as const) {
    test(`review correction ${kind} ${production ? 'factory' : 'caller'} ${leaf} abort at ${stage} permits close only`, async t => {
      const { fixture: f, bundle } = await correctionFixture(kind); const path = join(bundle, leaf);
      const abort = new AbortController(); let abortIndex = -1; let effectsAtAbort = -1; let launchesAtAbort = -1;
      try {
        assert.equal((await compatibility(f, production)).runtimeVersion, '27.0'); clearCorrectionLog(f);
        f.setBefore((operation, target) => {
          const opens = f.reads.filter(read => read.operation === 'open' && read.path === path).length;
          if (!abort.signal.aborted && operation === stage && target === path && opens === (production ? 2 : 1)) {
            abortIndex = f.reads.length; effectsAtAbort = f.effects.length; launchesAtAbort = f.launches.length; abort.abort();
          }
        });
        await assert.rejects(compatibility(f, production, abort.signal), { reason: 'HOST_PREREQUISITE_MISSING' });
        const later = f.reads.slice(abortIndex);
        t.diagnostic(JSON.stringify({ kind, leaf, layer: production ? 'factory' : 'caller', stage,
          abortObserved: abort.signal.aborted, postAbort: later, newEffects: f.effects.length - effectsAtAbort,
          newFixtureLaunches: f.launches.length - launchesAtAbort }));
        assert.ok(abortIndex >= 0, 'Cancellation must occur inside the requested awaited file stage');
        assert.deepEqual(later, [{ operation: 'close', path }], 'After shared abort only one handle close may dispatch');
        assert.equal(f.effects.length, effectsAtAbort); assert.equal(f.launches.length, launchesAtAbort);
      } finally { await f.cleanup(); }
    });
  }
}

const trackedCompatibility = (f: Fixture, signal = new AbortController().signal) =>
  verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host,
    trackAllocationSourceProcess(allocationSourceProcess(f.host, [], f.launch), (_operation, invoke) => Promise.resolve().then(invoke)), signal);
for (const kind of ['legacy', 'cryptex'] as const) for (const leaf of correctionLeaves) {
  for (const layer of ['factory conversion', 'factory bootstrap'] as const) {
    test(`tracked correction ${kind} binds ${leaf} during restored ${layer} identity`, async t => {
      const { fixture: f, mount, bundle } = await correctionFixture(kind); const path = join(bundle, leaf);
       let changed = false; let restored = false;
      try {
        assert.equal((await trackedCompatibility(f)).runtimeVersion, '27.0');
        clearCorrectionLog(f); let bootstrapStart: number | undefined;
        f.setBefore((operation, target) => {
          const mountReads = f.reads.filter(read => read.operation === 'lstat' && read.path === mount).length;
          const closes = f.reads.filter(read => read.operation === 'close' && read.path === path).length;
          const change = () => { f.overrides.set(mount, { ino: 202n }); changed = true; };
          const restore = () => { f.overrides.set(mount, { ino: 101n }); restored = true; };
          // Production windows use only this fixture's real open/close log, not
          // the injected layer's observation counts.
          if (layer === 'factory conversion' && operation === 'close' && target === path) {
            if (closes === 1) change();
            if (closes === 3) restore();
          }
          if (layer === 'factory bootstrap') {
            if (operation === 'close' && target === path && closes === 1) bootstrapStart = mountReads;
            if (operation === 'lstat' && target === mount && bootstrapStart !== undefined) {
              if (mountReads === bootstrapStart + 2) change();
              if (mountReads === bootstrapStart + 4) restore();
            }
          }
        });
        const outcome = await trackedCompatibility(f).then(value => ({ value, error: undefined }),
          error => ({ value: undefined, error }));
        const observed = f.identities.filter(identity => identity.operation === 'lstat' && identity.path === mount);
        t.diagnostic(JSON.stringify({ kind, leaf, layer, changed, restored, accepted: !!outcome.value,
          mountObservations: observed.map((identity, index) => ({ ordinal: index + 1, ino: identity.ino })),
          metadataConversions: f.effects.filter(effect => effect.args[5] === path).length,
          fixtureLaunches: f.launches.length, readonlyXmlUnchanged: !f.mountResults.size }));
        assert.equal(changed, true, 'The valid mounted fixture must enter the mismatch window');
        assert.ok(observed.some(identity => identity.ino === '202'), 'The verifier must actually observe the changed mount');
        if (outcome.value) assert.equal(restored, true, 'The original accepting trace restores identity before final validation');
        assert.equal(outcome.error?.reason, 'HOST_PREREQUISITE_MISSING', 'Observed identity restoration must refuse compatibility');
        assert.equal(f.effects.filter(effect => effect.args[5] === path).length, 0, 'No mismatching metadata conversion may launch');
      } finally { await f.cleanup(); }
    });
  }
}

for (const reject of [false, true]) test(`tracked adapter preserves three argument injected ${reject ? 'failure' : 'success'} and tracking diagnostics`, async () => {
  const events: string[] = []; const receipt = { exitCode: 0, stdout: 'fixture', stderr: '' }; const failure = new Error('fixture rejection');
  const signal = new AbortController().signal;
  const options = { signal, shell: false as const, timeoutMs: 10000, maxOutputBytes: 65536 };
  const args = ['fixture']; let sourceArguments: unknown[] = []; let trackerArity = 0;
  const process: import('../src/observed/create-source.js').SourceProcess = async function (...parameters) {
    sourceArguments = parameters; events.push('source'); if (reject) throw failure; return receipt;
  };
  const tracked = trackAllocationSourceProcess(process, function (operation, invoke) {
    trackerArity = arguments.length; assert.equal(operation, '/fixture'); events.push('tracked');
    return Promise.resolve().then(invoke).then(result => { events.push('diagnostic success'); return result; },
      error => { events.push('diagnostic failure'); throw error; });
  });
  assert.equal(tracked.length, 3); assert.equal(isProductionSourceProcess(tracked), false);
  const pending = tracked('/fixture', args, options); assert.deepEqual(events, ['tracked']);
  if (reject) await assert.rejects(pending, error => error === failure); else assert.equal(await pending, receipt);
  assert.equal(trackerArity, 2); assert.deepEqual(sourceArguments, ['/fixture', args, options]);
  assert.equal(sourceArguments[1], args); assert.equal(sourceArguments[2], options);
  assert.deepEqual(events, ['tracked', 'source', reject ? 'diagnostic failure' : 'diagnostic success']);
});

test('tracked adapter abort before deferred invocation records failure without source dispatch', async () => {
  const controller = new AbortController(); const reason = new Error('cancel before dispatch'); let calls = 0; const diagnostics: unknown[] = [];
  const tracked = trackAllocationSourceProcess(async () => { calls++; return { exitCode: 0, stdout: '', stderr: '' }; },
    (_operation, invoke) => Promise.resolve().then(invoke).catch(error => { diagnostics.push(error); throw error; }));
  const pending = tracked('/fixture', [], { signal: controller.signal, shell: false, timeoutMs: 10000, maxOutputBytes: 65536 });
  controller.abort(reason); await assert.rejects(pending, error => error === reason);
  assert.equal(calls, 0); assert.deepEqual(diagnostics, [reason]);
});

test('tracked adapter retains production brand through nested composition and allocator rejects fake authority', async () => {
  const f = await allocationFixture();
  try {
    const direct = allocationSourceProcess(f.host); const once = trackAllocationSourceProcess(direct, (_operation, invoke) => Promise.resolve().then(invoke));
    const twice = trackAllocationSourceProcess(once, (_operation, invoke) => Promise.resolve().then(invoke));
    const { ObservedAllocator } = await import('../src/observed/allocation.js');
    for (const process of [direct, once, twice]) {
      assert.equal(process.length, 3); assert.equal(isProductionSourceProcess(process), true);
      assert.throws(() => new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir,
        fakeBackend: { process, runner: f.runner, window: f.window, host: f.host } }), { code: 'CONFIG_INVALID' });
    }
    assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

for (const kind of ['legacy', 'cryptex'] as const) test(`tracked adapter ${kind} concurrent calls retain separate expectations and invoke tracking`, async () => {
  const { fixture: f, mount, bundle } = await correctionFixture(kind); const path = join(bundle, 'Contents/Info.plist');
  let release!: () => void; let reached!: () => void; let held = false; const gate = new Promise<void>(resolve => { release = resolve; });
  const began = new Promise<void>(resolve => { reached = resolve; }); const operations: string[] = []; const diagnostics: unknown[] = [];
  const tracked = trackAllocationSourceProcess(allocationSourceProcess(f.host, [], f.launch), (operation, invoke) => {
    operations.push(operation);
    return Promise.resolve().then(async () => {
      if (!held && operation === '/usr/bin/plutil' && f.reads.at(-1)?.operation === 'close' && f.reads.at(-1)?.path === path) {
        held = true; reached(); await gate;
      }
      return invoke();
    }).then(result => { diagnostics.push(result); return result; }, error => { diagnostics.push(error); throw error; });
  });
  const lookup = () => verifyInstalledCompatibility({ deviceTypeId: typeId, runtimeId }, f.host, tracked, new AbortController().signal);
  const first = lookup().then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
  try {
    const started = await Promise.race([began.then(() => true), first.then(() => false)]); assert.equal(started, true);
    f.overrides.set(mount, { ino: 202n });
    assert.equal((await lookup()).runtimeVersion, '27.0', 'Concurrent lookup captures its own fresh identity');
    release(); const stale = await first; assert.equal(stale.error?.reason, 'HOST_PREREQUISITE_MISSING');
    assert.equal(stale.value, undefined); assert.ok(diagnostics.some(value => value instanceof Error));
    assert.equal(diagnostics.length, operations.length, 'Every public/private tracked invocation settles through diagnostics');
    assert.ok(operations.includes('/usr/sbin/diskutil')); assert.ok(operations.includes('/usr/bin/plutil'));
    assert.equal(f.effects.filter(effect => effect.args[5] === path).length, 1, 'Stale invocation must not convert metadata');
  } finally { release(); await first; await f.cleanup(); }
});
