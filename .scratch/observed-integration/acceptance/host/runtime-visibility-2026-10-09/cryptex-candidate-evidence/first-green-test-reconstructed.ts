import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { allocationSourceProcess, developerDirectory, verifyInstalledCompatibility } from '../src/observed/allocation-config.js';
import { allocationFixture, typeId, runtimeId } from './fixtures/observed-allocation-backend.js';
import { cryptexFixture, cryptexInfo } from './fixtures/observed-cryptex-runtime.js';

for (const path of ['/', '/private', cryptexInfo]) {
  test(`the installed fixture maps ${path} into its temporary host tree`, async () => {
    const fixture = await allocationFixture();
    try { assert.equal(fixture.map(path), join(fixture.root, 'host', path)); }
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
