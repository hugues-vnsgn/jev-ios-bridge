import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Element, Snapshot } from '../src/contracts/index.js';
import { ANDROID_PROJECTION_RULE, PROJECTION_RULE, renderAssertionState } from '../src/scripted/observe.js';
import { checkGolden } from './fixtures/golden.js';

const goldenDir = join(import.meta.dirname, 'golden');

const base: Snapshot = {
  deviceId: 'sim', capturedAt: 1_700_000_000_000, expiresAt: 1_700_000_060_000,
  sequence: 1, truncated: false, elements: [],
};

test('the Android projection rule is a fixed name beside the iOS rule', () => {
  assert.equal(PROJECTION_RULE, 'visible-full-text-v2');
  assert.equal(ANDROID_PROJECTION_RULE, 'android-full-text-v1');
});

test('an iOS element carrying a placeholder renders exactly as before: label wins, placeholder never appears', () => {
  const withPlaceholder: Element = { ref: 'e1', role: 'text-field', label: 'Amount',
    placeholder: 'Betrag eingeben', state: { enabled: true, visible: true }, actions: ['tap', 'typeText'] };
  const ios = renderAssertionState({ ...base, elements: [withPlaceholder] }, 'ios');
  assert.match(ios, /"label":"Amount"/);
  assert.doesNotMatch(ios, /"placeholder"/);
  const noLabel: Element = { ref: 'e2', role: 'text-field', placeholder: 'Betrag eingeben',
    state: { enabled: true, visible: true }, actions: ['tap', 'typeText'] };
  assert.doesNotMatch(renderAssertionState({ ...base, elements: [noLabel] }, 'ios'), /"placeholder"/);
});

test('on Android, an empty field with only a placeholder shows it in place of label', () => {
  const empty: Element = { ref: 'e1', role: 'text-field', placeholder: 'Betrag eingeben',
    state: { enabled: true, visible: true }, actions: ['tap', 'typeText'] };
  const android = renderAssertionState({ ...base, elements: [empty] }, 'android');
  assert.match(android, /"placeholder":"Betrag eingeben"/);
  assert.doesNotMatch(android, /"label"/);
});

test('on Android, a field carrying both a label and a placeholder shows only the placeholder', () => {
  const both: Element = { ref: 'e1', role: 'text-field', label: 'Betrag eingeben', placeholder: 'Betrag eingeben',
    state: { enabled: true, visible: true }, actions: ['tap', 'typeText'] };
  const android = renderAssertionState({ ...base, elements: [both] }, 'android');
  assert.match(android, /"placeholder":"Betrag eingeben"/);
  assert.doesNotMatch(android, /"label"/);
});

test('golden: the Android renderer on hand-written elements with a placeholder-and-label field, a password field, and unselectable button text', async () => {
  const amountField: Element = { ref: 'e1', role: 'text-field', label: 'Betrag eingeben', placeholder: 'Betrag eingeben',
    identifier: 'amount', frame: { x: 16, y: 200, width: 300, height: 48 },
    state: { enabled: true, visible: true, focused: true }, actions: ['tap', 'typeText'] };
  const passwordField: Element = { ref: 'e2', role: 'text-field', label: 'Password', value: '••••••••',
    identifier: 'password', frame: { x: 16, y: 280, width: 300, height: 48 },
    state: { enabled: true, visible: true }, actions: ['tap', 'typeText'] };
  const breadButton: Element = { ref: 'e3', role: 'button', label: 'Add Bread ($3)',
    frame: { x: 16, y: 360, width: 300, height: 48 }, state: { enabled: true, visible: true }, actions: ['tap'] };
  const breadButtonText: Element = { ref: 'e4', role: 'text', label: 'Add Bread ($3)', selectable: false,
    frame: { x: 24, y: 372, width: 200, height: 24 }, state: { enabled: true, visible: true }, actions: [] };
  const handWritten: Snapshot = { ...base, deviceId: 'emulator-5554',
    elements: [amountField, passwordField, breadButton, breadButtonText] };

  const rendered = renderAssertionState(handWritten, 'android');
  assert.match(rendered, /"placeholder":"Betrag eingeben"/);
  assert.doesNotMatch(rendered, /"label":"Betrag eingeben"/);
  assert.match(rendered, /"value":"••••••••"/);
  assert.doesNotMatch(rendered, /"selectable"/);
  assert.match(rendered, /Add Bread \(\$3\)/);
  await checkGolden(join(goldenDir, 'android-render.json'), rendered);
});
