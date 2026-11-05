import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { main, type CliDeps } from '../scripts/phase4/corpus/cli.js';
import { takeCapture, type CaptureIdentity } from '../scripts/phase4/corpus/capture-screen.js';
import { KIT_DIR, KIT_FILES, REPO_ROOT } from '../scripts/phase4/corpus/sources.js';
import { parseInventory } from '../scripts/phase4/corpus/inventory.js';
import { loadBuiltProduct } from '../scripts/phase4/live/backend.js';
import { SERIAL, androidTarget, iosTarget } from './fixtures/appium-wire/matrix.js';
import { ONE_PIXEL_PNG, androidScreen, iosScreen, world } from './fixtures/appium-wire/world.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';
import { NOW, custody, scratch, writeActivation, writeAssignment } from './fixtures/phase4-live/records.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { sourceProduct } from './fixtures/phase4-live/source-product.js';
import { compiledCopy } from './fixtures/phase4-live/built-copy.js';
import { stackRelease } from './fixtures/stack-release.js';

const IOS_SCREEN = 's01-weather-ber-query';
const ANDROID_SCREEN = 'twin-1-choose';
const iosHome = iosScreen([{ type: 'TextField', name: 'search', value: 'Ber', frame: [16, 120, 200, 40] }], 'com.sentry.weather.Weather');
const androidHome = androidScreen([{ className: 'android.widget.TextView', text: 'Selected: None', id: 'dev.jevbridge.diagnostic:id/summary', bounds: [16, 100, 216, 140] }],
  'dev.jevbridge.diagnostic');
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

type Rig = ReturnType<typeof rig>;
function rig(t: TestContext, platform: 'ios' | 'android', screens?: Record<string, string>) {
  const root = scratch(t);
  const phone = androidTarget();
  const probe = platform === 'ios' ? iosTarget.identityProbe : phone.options.identityProbe;
  const w = platform === 'ios'
    ? worldHost(t, { worlds: [world('ios', screens ?? { home: iosHome })], identityProbe: probe })
    : worldHost(t, { worlds: [world('android', screens ?? { home: androidHome })], identityProbe: probe, adb: phone.options.adb, nativeReply: phone.nativeReply });
  const kit = join(root, 'kit');
  mkdirSync(kit);
  for (const name of Object.values(KIT_FILES)) copyFileSync(join(REPO_ROOT, KIT_DIR, name), join(kit, name));
  const out = join(root, 'captures');
  const lines: string[] = [];
  const assignment = (fields: Record<string, unknown> = {}) => writeAssignment(root, platform === 'ios' ? fields : { device: SERIAL, category: 'android-phone', ...fields });
  const cli = (fields: Record<string, unknown> = {}): CliDeps => ({ cwd: root, env: {}, out: line => lines.push(line), createClient: () => { throw new Error('no judge'); },
    takeCapture: input => takeCapture(input, { cwd: root, now: () => NOW, signal: AbortSignal.timeout(60_000), readOs: async () => 'fake OS 1.0',
      live: { admission: w.admission, host: w.host, probe, adbPath: '/fake/adb', environment: {}, product: sourceProduct }, ...fields }) });
  const base = (screen: string) => ['--dir', kit, 'capture', 'take', '--screen', screen, '--platform', platform, '--out', out, '--app-build', 'fixture build 1',
    '--device', platform === 'ios' ? UDID : SERIAL];
  return { root, w, kit, out, lines, assignment, cli, base, platform };
}
const take = async (r: Rig, screen: string, assignment = r.assignment(), activation = writeActivation(r.root), deps = r.cli()) =>
  main([...r.base(screen), '--assignment', assignment, '--activation', activation], deps);
const identityOf = (r: Rig, screen: string) => JSON.parse(readFileSync(join(r.out, `${screen}.identity.json`), 'utf8')) as CaptureIdentity;
const attach = (r: Rig, screen: string) => {
  const identity = identityOf(r, screen);
  return main(['--dir', r.kit, 'capture', 'attach', '--screen', screen, '--xml', join(r.out, `${screen}.xml`), '--screenshot', join(r.out, `${screen}.png`),
    '--kind', 'live', '--app-build', identity.appBuild, '--device', identity.device, '--captured-at', identity.capturedAt, '--session-id', identity.sessionId],
  r.cli());
};
const files = (r: Rig) => { try { return readdirSync(r.out).sort(); } catch { return []; } };

test('a simulator capture writes the raw page source, the raw screenshot and an identity, and the kit attaches it into a manifest copy that verifies', { timeout: 120_000 }, async t => {
  const r = rig(t, 'ios');
  assert.equal(await take(r, IOS_SCREEN), 0, r.lines.join('\n'));
  assert.deepEqual(files(r), [`${IOS_SCREEN}.identity.json`, `${IOS_SCREEN}.png`, `${IOS_SCREEN}.xml`]);
  const xml = readFileSync(join(r.out, `${IOS_SCREEN}.xml`));
  const png = readFileSync(join(r.out, `${IOS_SCREEN}.png`));
  assert.equal(xml.toString('utf8'), iosHome, 'the production page source, untouched');
  assert.equal(png.toString('base64'), ONE_PIXEL_PNG, 'the production screenshot, untouched');
  const identity = identityOf(r, IOS_SCREEN);
  assert.deepEqual([identity.screenId, identity.platform, identity.category, identity.device, identity.os, identity.appBuild, identity.capturedAt, identity.sessionId],
    [IOS_SCREEN, 'ios', 'ios-simulator', UDID, 'fake OS 1.0', 'fixture build 1', NOW.toISOString(), 'ios-session']);
  assert.deepEqual([identity.appId.observed, identity.appId.expected], ['com.sentry.weather.Weather', 'com.sentry.weather.Weather']);
  assert.deepEqual(identity.files, { xml: { name: `${IOS_SCREEN}.xml`, sha256: sha(xml), bytes: xml.length }, png: { name: `${IOS_SCREEN}.png`, sha256: sha(png), bytes: png.length } });
  assert.equal(identity.stack.backend, 'appium');
  assert.match(identity.assignmentSha256, /^[0-9a-f]{64}$/);
  for (const name of files(r)) assert.equal(statSync(join(r.out, name)).mode & 0o777, 0o600, `${name} is private`);

  assert.equal(await attach(r, IOS_SCREEN), 0, r.lines.join('\n'));
  assert.equal(await main(['--dir', r.kit, 'manifest', 'verify'], r.cli()), 0, r.lines.join('\n'));
  const manifest = JSON.parse(readFileSync(join(r.kit, KIT_FILES.manifest), 'utf8')) as { screens: { screenId: string; capture: { status: string; kind?: string } }[] };
  assert.deepEqual(manifest.screens.filter(screen => screen.capture.status === 'captured').map(screen => [screen.screenId, screen.capture.kind]), [[IOS_SCREEN, 'live']]);
  assert.equal(await attach(r, IOS_SCREEN).catch(() => 'refused'), 'refused', 'one attach per screen, as the kit keeps it');

  const [only] = r.w.opened;
  assert.equal(r.w.opened.length, 1, 'one private session');
  assert.deepEqual(only!.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_session_management']);
  assert.deepEqual(r.w.native.calls.map(call => call.command.kind), [], 'no simctl launch, terminate or install');
  assert.deepEqual(r.w.fence.wda, [], 'no runner is left on the simulator');
  assert.equal(r.w.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
});

test('a phone capture is the same files from the Android page source, and releases the phone', { timeout: 120_000 }, async t => {
  const r = rig(t, 'android');
  assert.equal(await take(r, ANDROID_SCREEN), 0, r.lines.join('\n'));
  assert.equal(readFileSync(join(r.out, `${ANDROID_SCREEN}.xml`), 'utf8'), androidHome);
  const identity = identityOf(r, ANDROID_SCREEN);
  assert.deepEqual([identity.platform, identity.category, identity.device, identity.appId.observed], ['android', 'android-phone', SERIAL, 'dev.jevbridge.diagnostic']);
  assert.ok('uiautomator2ServerSha256' in identity.stack);
  assert.equal(await attach(r, ANDROID_SCREEN), 0, r.lines.join('\n'));
  assert.equal(await main(['--dir', r.kit, 'manifest', 'verify'], r.cli()), 0, r.lines.join('\n'));
  assert.deepEqual(r.w.opened[0]!.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_session_management']);
  assert.ok(r.w.native.calls.every(call => ['android-keyguard', 'android-wake'].includes(call.command.kind)), 'no launch, stop or install');
  assert.equal(r.w.admission.inspect({ category: 'android-phone', value: SERIAL })!.state, 'available');
});

test('a second capture of the same screen is refused before any session, and the first capture is byte for byte what it was', { timeout: 120_000 }, async t => {
  const r = rig(t, 'ios');
  assert.equal(await take(r, IOS_SCREEN), 0);
  const before = files(r).map(name => [name, sha(readFileSync(join(r.out, name)))]);
  const sessions = r.w.opened.length;
  r.lines.length = 0;
  assert.equal(await take(r, IOS_SCREEN), 1);
  assert.match(r.lines.join('\n'), /refused would-overwrite/);
  assert.equal(r.w.opened.length, sessions, 'the refusal opened no session');
  assert.deepEqual(files(r).map(name => [name, sha(readFileSync(join(r.out, name)))]), before);
});

test('a half-written earlier capture also blocks the screen, whichever of its files is left', { timeout: 120_000 }, async t => {
  const r = rig(t, 'ios');
  mkdirSync(r.out);
  copyFileSync(join(r.kit, KIT_FILES.inventory), join(r.out, `${IOS_SCREEN}.png`));
  assert.equal(await take(r, IOS_SCREEN), 1);
  assert.match(r.lines.join('\n'), /refused would-overwrite/);
  assert.equal(r.w.opened.length, 0);
  assert.deepEqual(files(r), [`${IOS_SCREEN}.png`]);
});

const refusals: [string, (r: Rig) => Parameters<typeof take>, RegExp][] = [
  ['an assignment whose custody ended', r => [r, IOS_SCREEN, r.assignment({ custody: custody(-3, -1) })], /refused custody-ended/],
  ['an assignment for another device', r => [r, IOS_SCREEN, r.assignment({ device: '11111111-2222-3333-4444-555555555555' })], /refused device-mismatch/],
  ['an assignment that is not the owner\'s', r => [r, IOS_SCREEN, r.assignment({ assignedBy: 'worker' })], /refused assignment-invalid/],
  ['an activation outside its window', r => [r, IOS_SCREEN, r.assignment(), writeActivation(r.root, { window: custody(1, 2) })], /refused activation-outside-window/],
  ['an activation that is not the owner\'s', r => [r, IOS_SCREEN, r.assignment(), writeActivation(r.root, { assignedBy: 'worker' })], /refused activation-invalid/],
  ['a screen the inventory does not know', r => [r, 's99-nothing'], /refused unknown-screen/],
  ['an Android screen on a simulator', r => [r, ANDROID_SCREEN], /refused unknown-screen/],
];
for (const [name, args, pattern] of refusals) {
  test(`${name} is refused before the store or any device is touched`, { timeout: 60_000 }, async t => {
    const r = rig(t, 'ios');
    assert.equal(await take(...args(r)), 1);
    assert.match(r.lines.join('\n'), pattern);
    assert.equal(r.w.opened.length, 0, 'no session was opened');
    assert.deepEqual(files(r), []);
  });
}

test('a platform flag that disagrees with the assigned device is refused', { timeout: 60_000 }, async t => {
  const r = rig(t, 'ios');
  const code = await main([...r.base(ANDROID_SCREEN).map(word => word === 'ios' ? 'android' : word), '--assignment', r.assignment(), '--activation', writeActivation(r.root)], r.cli());
  assert.equal(code, 1);
  assert.match(r.lines.join('\n'), /refused platform-mismatch/);
  assert.equal(r.w.opened.length, 0);
});

test('a page source the production normalizer rejects is not kept, and the session still closes clean', { timeout: 120_000 }, async t => {
  const r = rig(t, 'ios', { home: '<hierarchy><node/></hierarchy>' });
  assert.equal(await take(r, IOS_SCREEN), 1);
  assert.match(r.lines.join('\n'), /refused xml-rejected/);
  assert.deepEqual(files(r), []);
  assert.deepEqual(r.w.fence.wda, []);
  assert.equal(r.w.admission.inspect({ category: 'ios-simulator', value: UDID })!.state, 'available');
});

test('a capture without the required flags prints the usage and exits 2', async t => {
  const r = rig(t, 'ios');
  assert.equal(await main(['--dir', r.kit, 'capture', 'take', '--screen', IOS_SCREEN], r.cli()), 2);
  assert.match(r.lines.join('\n'), /capture take/);
});

test('a capture on the built product refuses that build\'s broken stack as a stack refusal, because its driver comes from the same build', { timeout: 180_000 }, async t => {
  const root = compiledCopy(t);
  const product = await loadBuiltProduct(root);
  const { FrozenStack } = await import(pathToFileURL(join(root, 'appium', 'stack.js')).href) as typeof import('../src/appium/stack.js');
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  writeFileSync(join(release.artifactRoot, 'wda.tar.gz'), 'tampered');
  const r = rig(t, 'ios');
  const store = join(realpathSync(r.root), 'built-admission');
  mkdirSync(store, { mode: 0o700 });
  const admission = product.Admission.forTesting({ root: store, backend: 'fake', durability: 'fast' });
  const host = product.productionAppiumHost({ environment: {}, stack: FrozenStack.forTesting(release), readVersions: async () => ({}), openAdmission: () => admission });
  const inventory = parseInventory(JSON.parse(readFileSync(join(r.kit, KIT_FILES.inventory), 'utf8')));
  await assert.rejects(takeCapture({ assignment: r.assignment(), activation: writeActivation(r.root), device: UDID, platform: 'ios', screen: IOS_SCREEN,
    out: r.out, appBuild: 'fixture build 1', inventory },
  { cwd: r.root, now: () => NOW, signal: AbortSignal.timeout(60_000), readOs: async () => 'fake OS 1.0',
    live: { product, admission, host, probe: iosTarget.identityProbe, adbPath: '/fake/adb', environment: {} } }),
  { name: 'StackRefusalError', code: 'DEVICE_ERROR', vendorCode: 'WDA_ARCHIVE_MISMATCH', vendorSource: 'bridge' });
  assert.deepEqual(files(r), [], 'nothing was kept');
});
