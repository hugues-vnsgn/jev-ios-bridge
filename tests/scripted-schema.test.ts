import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSnapshot } from '../src/device/index.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { resolveActionTarget } from '../src/scripted/select.js';

const scenario = {
  version: 1,
  app: { bundleId: 'dev.example.Sample' },
  values: { query: 'Berlin' },
  steps: [
    { id: 'enterQuery', kind: 'action', guard: { present: [{ identifier: 'search.field', role: 'text-field' }] },
      action: { kind: 'replaceText', selector: { identifier: 'search.field', role: 'text-field' }, valueKey: 'query' } },
    { id: 'verifyResults', kind: 'checkpoint', guard: { present: [{ identifier: 'search.results' }] },
      assertions: [{ id: 'city', claim: 'Berlin is visible in the results.' }] },
  ],
} as const;

test('strict scripted schema omits undefined optionals', () => {
  const parsed = parseScriptedScenario({ ...scenario, device: { udid: undefined }, preconditions: undefined });
  assert.equal(parsed.steps.length, 2);
  assert.deepEqual(parsed.device, {});
  assert.ok(!Object.hasOwn(parsed, 'preconditions'));
  assert.equal(parsed.steps[0]?.kind, 'action');
});

test('script device accepts the real dedicated simulator 8-4-4-4-12 UUID shape', () => {
  const parsed = parseScriptedScenario({ ...scenario,
    device: { udid: '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7' } });
  assert.equal(parsed.platform === 'android' ? undefined : parsed.device?.udid, '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7');
});

test('selectors require identity and reject ephemeral refs, indices, and value-only guesses', () => {
  for (const selector of [{ value: '' }, { role: '' }, { identifier: 'search.field', ref: 'e1' },
    { identifier: 'search.field', index: 2 }]) {
    const steps = [{ ...scenario.steps[0], action: { ...scenario.steps[0].action, selector } }, scenario.steps[1]];
    assert.throws(() => parseScriptedScenario({ ...scenario, steps }));
  }
});

test('script ends at a checkpoint and rejects missing values, duplicate IDs, and unsupported typing', () => {
  assert.throws(() => parseScriptedScenario({ ...scenario, steps: [scenario.steps[0]] }));
  assert.throws(() => parseScriptedScenario({ ...scenario, steps: [scenario.steps[0],
    { ...scenario.steps[1], id: 'enterQuery' }] }));
  assert.throws(() => parseScriptedScenario({ ...scenario, values: {} }));
  assert.throws(() => parseScriptedScenario({ ...scenario, values: { query: '--Berlin' } }));
  assert.throws(() => parseScriptedScenario({ ...scenario, values: { query: 'Đà Nẵng' } }));
  assert.throws(() => parseScriptedScenario({ ...scenario, steps: [scenario.steps[0],
    { ...scenario.steps[1], assertions: [] }] }));
});

test('bounded wait requires explicit current and target guards', () => {
  const wait = { id: 'waitForResults', kind: 'wait', guard: { present: [{ identifier: 'search.loading' }] },
    until: { present: [{ identifier: 'search.results' }] }, timeoutMs: 5_000 };
  assert.equal(parseScriptedScenario({ ...scenario, steps: [wait, scenario.steps[1]] }).steps[0]?.kind, 'wait');
  assert.throws(() => parseScriptedScenario({ ...scenario, steps: [{ ...wait, timeoutMs: 0 }, scenario.steps[1]] }));
  assert.throws(() => parseScriptedScenario({ ...scenario, steps: [{ ...wait, until: { present: [] } }, scenario.steps[1]] }));
});

const androidCheckpoint = { id: 'verify', kind: 'checkpoint' as const, guard: { present: [{ identifier: 'search.results' }] },
  assertions: [{ id: 'city', claim: 'Berlin is visible in the results.' }] };

test('an Android script with a package and a device serial parses, keeping the platform and app fields', () => {
  const parsed = parseScriptedScenario({ version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp' }, device: { serial: 'emulator-5554' },
    values: {}, steps: [androidCheckpoint] });
  assert.equal(parsed.platform, 'android');
  assert.deepEqual(parsed.app, { package: 'com.hugues.test_cmp' });
  assert.deepEqual(parsed.device, { serial: 'emulator-5554' });
});

test('an Android script names its device by AVD name instead of a serial', () => {
  const parsed = parseScriptedScenario({ version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp' }, device: { avd: 'jev-actions-api31' },
    values: {}, steps: [androidCheckpoint] });
  assert.deepEqual(parsed.device, { avd: 'jev-actions-api31' });
});

test('an Android script rejects app.bundleId, app.launchArgs, and device.udid, and requires app.package', () => {
  const base = { version: 1, platform: 'android' as const, device: { serial: 'emulator-5554' }, values: {},
    steps: [androidCheckpoint] };
  assert.throws(() => parseScriptedScenario({ ...base, app: { bundleId: 'com.example.app' } }));
  assert.throws(() => parseScriptedScenario({ ...base, app: { package: 'com.example.app', launchArgs: ['-x'] } }));
  assert.throws(() => parseScriptedScenario({ ...base, app: { package: 'com.example.app' },
    device: { udid: '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7' } }));
  assert.throws(() => parseScriptedScenario({ ...base, app: {} }));
});

test('an Android script names at most one of device.serial or device.avd, both under their own character pattern', () => {
  const base = { version: 1, platform: 'android' as const, app: { package: 'com.example.app' }, values: {},
    steps: [androidCheckpoint] };
  assert.throws(() => parseScriptedScenario({ ...base, device: { serial: 'emulator-5554', avd: 'jev-actions-api31' } }));
  assert.throws(() => parseScriptedScenario({ ...base, device: { serial: 'has a space' } }));
  assert.throws(() => parseScriptedScenario({ ...base, device: { avd: 'has a space' } }));
});

test('an iOS script (no platform, or "ios") rejects any Android-only field', () => {
  const iosBase = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [scenario.steps[1]] };
  assert.throws(() => parseScriptedScenario({ ...iosBase, app: { bundleId: 'com.example.app', package: 'com.example.app' } }));
  assert.throws(() => parseScriptedScenario({ ...iosBase, app: { bundleId: 'com.example.app', activity: '.Main' } }));
  assert.throws(() => parseScriptedScenario({ ...iosBase, app: { bundleId: 'com.example.app', intentExtras: { a: 'b' } } }));
  assert.throws(() => parseScriptedScenario({ ...iosBase, device: { serial: 'emulator-5554' } }));
  assert.throws(() => parseScriptedScenario({ ...iosBase, device: { avd: 'jev-actions-api31' } }));
  assert.throws(() => parseScriptedScenario({ ...{ ...iosBase, platform: 'ios' as const },
    device: { avd: 'jev-actions-api31' } }));
});

test('Android typed values allow non-English Unicode text and a leading hyphen, but not control characters', () => {
  const base = { version: 1, platform: 'android' as const, app: { package: 'com.example.app' },
    device: { serial: 'emulator-5554' }, steps: [androidCheckpoint] };
  const parsed = parseScriptedScenario({ ...base, values: { query: '-Đà Nẵng' } });
  assert.equal(parsed.values.query, '-Đà Nẵng');
  assert.throws(() => parseScriptedScenario({ ...base, values: { query: 'a\u0007b' } }));
});

test('an Android script accepts an optional activity and intent extras', () => {
  const parsed = parseScriptedScenario({ version: 1, platform: 'android', app: { package: 'com.example.app',
    activity: '.DebugGalleryActivity', intentExtras: { screen: 'gallery' } }, device: { serial: 'emulator-5554' },
    values: {}, steps: [androidCheckpoint] });
  assert.deepEqual(parsed.app, { package: 'com.example.app', activity: '.DebugGalleryActivity',
    intentExtras: { screen: 'gallery' } });
});

test('an empty value filter is rejected, because a real empty field carries no value to match', async () => {
  const withEmpty = (selector: object) => ({ ...scenario, steps: [{ ...scenario.steps[0],
    action: { ...scenario.steps[0].action, selector } }, scenario.steps[1]] });
  assert.throws(() => parseScriptedScenario(withEmpty({ identifier: 'search.field', value: '' })),
    /A selector value cannot be empty/);
  // The owner's Compose app (docs/research/compose-cmp-capture.md): its empty OutlinedTextField has no value key.
  const capture = JSON.parse(await readFile('docs/research/assets/compose-cmp/03-fullscreen-modal-outer-open-full.json', 'utf8'));
  const snapshot = parseSnapshot(capture.data, 'sim');
  const field = snapshot.elements.find(element => element.identifier === 'imeField')!;
  assert.equal(field.role, 'text-field');
  assert.ok(!Object.hasOwn(field, 'value'));
  assert.equal(resolveActionTarget(snapshot, { identifier: 'imeField', role: 'text-field' }, 'typeText').ref, field.ref);
});
