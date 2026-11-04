import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { BUILT_PRODUCT_ENTRIES, BUILT_PRODUCT_ROOT, createLiveCycleBackend, loadBuiltProduct, resolveLiveCycleParts } from '../scripts/phase4/live/backend.js';
import { runCycles, scriptedCycle } from '../scripts/phase4/live/cycles.js';
import { resolveIdentity, type IdentityProbe } from '../src/device/identity.js';
import { validateRunId } from '../src/log/index.js';
import { sourceProduct } from './fixtures/phase4-live/source-product.js';
import { fakeAndroidAdmission, fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { SERIAL, androidTarget } from './fixtures/appium-wire/matrix.js';
import { IOS_SCENARIO, cycleWorld, iosScenario, worldCycles } from './fixtures/phase4-live/world-cycles.js';

function logRoot(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'p4-backend-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('the live backend runs a cycle on the assigned device, and the cycle releases it with nothing owned left', { timeout: 120_000 }, async t => {
  const { f } = worldCycles(t, { platform: 'ios' });
  const live = createLiveCycleBackend({ device: { category: 'ios-simulator', value: UDID }, target: { platform: 'ios', device: UDID }, admission: f.admission,
    fence: f.fence.run, driver: ({ runId }) => f.open(cycleWorld('ios'), { runId }).driver });
  const result = await runCycles(2, live({ scenario: iosScenario(), logRoot: logRoot(t) }));
  assert.equal(result.passed, true, JSON.stringify(result.failure));
  for (const record of result.cycles) {
    assert.deepEqual([record.attemptState, record.disposition, record.device, record.owner, record.leftovers],
      ['terminal', 'available', 'available', null, []]);
  }
  assert.equal(new Set(result.cycles.map(record => record.attempt.id)).size, 2, 'every cycle is its own admission attempt');
  assert.deepEqual(f.fence.wda, [], 'no runner is left on the simulator');
});

test('the live parts resolve the assigned simulator and refuse an assignment that names another category', async t => {
  const root = mkdtempSync(join(tmpdir(), 'p4-parts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const admission = fakeAndroidAdmission(root);
  const parts = await resolveLiveCycleParts({ category: 'ios-simulator', device: UDID, admission,
    probe: fakeSimulatorProbe(UDID), adbPath: '/fake/adb', environment: {}, product: sourceProduct });
  assert.deepEqual(parts.device, { category: 'ios-simulator', value: UDID });
  assert.equal(parts.admission, admission, 'the caller\'s authority is the one the cycles record on');
  await assert.rejects(() => resolveLiveCycleParts({ category: 'android-emulator', device: SERIAL, admission,
    probe: androidTarget().options.identityProbe, adbPath: '/fake/adb', environment: {}, product: sourceProduct }),
  /The assignment names android-emulator .*, but the live device is android-phone/);
});

test('the scenario file the runner reads is the one the corpus kit shipped', () => {
  assert.ok(IOS_SCENARIO.endsWith('ios-cycle.json'));
});

const AVD = 'jev_p4_emulator';
const AVD_FOLDER = '/Users/someone/.android/avd/jev_p4_emulator.avd';
const emulatorProbe = (): IdentityProbe => ({
  android: async () => [{ category: 'android-emulator', value: AVD_FOLDER, transport: { serial: 'emulator-5554', state: 'device' },
    provenance: { avdName: AVD, avdId: AVD, directory: { device: '1', inode: '2' }, version: { value: '36.2.12', source: 'running-sdk-binary' }, process: { pid: 42, startedAt: 'Tue Nov  4 10:00:00 2026' } },
    probeReplies: { name: AVD, id: AVD, path: AVD_FOLDER, guestName: { kind: 'read', reply: AVD }, finalId: AVD } }],
  simulatorSet: async () => { throw new Error('no simulator'); },
  simulatorApp: async () => { throw new Error('no simulator'); },
});

test('an emulator assigned by its AVD name gets a driver target the driver can resolve again, not the AVD folder path', async t => {
  const root = mkdtempSync(join(tmpdir(), 'p4-emulator-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const probe = emulatorProbe();
  const parts = await resolveLiveCycleParts({ category: 'android-emulator', device: AVD, admission: fakeAndroidAdmission(root), probe,
    adbPath: '/fake/adb', environment: {}, product: sourceProduct });
  assert.equal(parts.target.platform, 'android');
  assert.equal(parts.target.device, 'emulator-5554', 'the running serial, resolved from the AVD');
  assert.equal(parts.device.value, AVD_FOLDER, 'admission still records the device by its resolved identity');
  const again = await resolveIdentity({ request: { category: 'android-emulator', name: parts.target.device }, probe, signal: new AbortController().signal });
  assert.equal(again.value, AVD_FOLDER, 'the driver resolves the target to the same emulator');
});

test('two attempts at the same cycle number get different run ids, so their kept log files do not collide', { timeout: 120_000 }, async t => {
  const { f } = worldCycles(t, { platform: 'ios' });
  const runIds: string[] = [];
  const attemptOf = () => scriptedCycle({ scenario: iosScenario(), logRoot: logRoot(t),
    driver: ({ runId }) => { runIds.push(runId); return f.open(cycleWorld('ios'), { runId }).driver; } });
  await attemptOf()(1, new AbortController().signal);
  await attemptOf()(1, new AbortController().signal);
  assert.equal(runIds.length, 2);
  assert.notEqual(runIds[0], runIds[1], 'cycle 1 of the second attempt is not cycle 1 of the first');
  for (const id of runIds) assert.doesNotThrow(() => validateRunId(id), id);
  const cycle = attemptOf();
  await cycle(2, new AbortController().signal);
  await cycle(3, new AbortController().signal);
  assert.equal(new Set(runIds.slice(2)).size, 2, 'the cycles of one attempt differ from each other');
});

function stubProduct(root: string, omit: string[] = []) {
  const exports: Record<string, string[]> = {
    'device/admission.js': ['Admission'], 'device/android/probe.js': ['identityProbe'], 'device/android/adb.js': ['adbRunner'],
    'device/android/tools.js': ['adbEnvironment', 'findAdb'], 'device/identity.js': ['resolveIdentity'],
    'appium/composition.js': ['ComposedAppiumDriver', 'productionAppiumHost'], 'appium/fence/runner.js': ['createFenceRunner'], 'appium/native/simctl.js': ['simctlRunner'],
    'appium/stack-identity.js': ['default'], 'appium/extension/entry.js': [],
  };
  for (const [file, names] of Object.entries(exports)) {
    if (omit.includes(file)) continue;
    const path = join(root, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, names.map(name => name === 'default' ? 'export default {};' : `export const ${name} = { builtFrom: ${JSON.stringify(file)} };`).join('\n') + '\n');
  }
}

test('the live kit loads the built product: it names the dist modules and the two dist-only files, and refuses a dist without them', async t => {
  const root = mkdtempSync(join(tmpdir(), 'p4-dist-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(BUILT_PRODUCT_ROOT, join(import.meta.dirname, '..', 'dist') + '/', 'the default root is this checkout\'s dist');
  for (const file of BUILT_PRODUCT_ENTRIES.modules) {
    assert.equal(existsSync(join(import.meta.dirname, '..', 'src', file.replace(/\.js$/, '.ts'))), true, `${file} has a source module`);
  }
  stubProduct(root);
  const product = await loadBuiltProduct(root) as unknown as Record<string, { builtFrom: string }>;
  assert.equal(product.Admission!.builtFrom, 'device/admission.js');
  assert.equal(product.ComposedAppiumDriver!.builtFrom, 'appium/composition.js');
  assert.equal(product.simctlRunner!.builtFrom, 'appium/native/simctl.js');
  const missing = mkdtempSync(join(tmpdir(), 'p4-dist-'));
  t.after(() => rmSync(missing, { recursive: true, force: true }));
  stubProduct(missing, ['appium/extension/entry.js']);
  await assert.rejects(loadBuiltProduct(missing), /appium\/extension\/entry\.js.*npm run build/);
  const noIdentity = mkdtempSync(join(tmpdir(), 'p4-dist-'));
  t.after(() => rmSync(noIdentity, { recursive: true, force: true }));
  stubProduct(noIdentity, ['appium/stack-identity.js']);
  await assert.rejects(loadBuiltProduct(noIdentity), /appium\/stack-identity\.js.*npm run build/);
});
