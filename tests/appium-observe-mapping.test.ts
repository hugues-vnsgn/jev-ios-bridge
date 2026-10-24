import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeSource, ObservationIncompleteError } from '../src/appium/observe/normalize.js';
import { renderAssertionState } from '../src/scripted/observe.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/appium-wire/observe/${name}`, import.meta.url), 'utf8');
const android = (attrs = '', children = '') => `<node class="android.widget.Button" text="Go" enabled="true" displayed="true" clickable="true" checkable="false" checked="false" focused="false" selected="false" scrollable="false" password="false" bounds="[0,0][100,50]" ${attrs}>${children}</node>`;
const ios = (kind: string, attrs = '', children = '') => `<XCUIElementType${kind} type="XCUIElementType${kind}" enabled="true" visible="true" x="0" y="0" width="100" height="50" ${attrs}>${children}</XCUIElementType${kind}>`;
const iosSource = (body: string) => `<AppiumAUT>${ios('Application', '', body)}</AppiumAUT>`;
const androidSource = (body: string) => `<hierarchy>${body}</hierarchy>`;
function incomplete(work: () => unknown, reason: string) {
  assert.throws(work, error => error instanceof ObservationIncompleteError && error.truncated === true && error.reason === reason);
}

test('Android XML preserves literal selector, state, geometry and decoded Unicode', () => {
  assert.deepEqual(normalizeSource('android', androidSource(android('resource-id="go" content-desc="Go &amp; &#x1F34E;"'))).elements, [
    { ref: 'e1', role: 'button', actions: ['tap'], label: 'Go & 🍎', identifier: 'go',
      frame: { x: 0, y: 0, width: 100, height: 50 }, state: { enabled: true, visible: true } },
  ]);
});
test('iOS fixes name-as-label, text values, selected values and disabled tap while retaining touch actions', () => {
  const source = iosSource(ios('StaticText', 'name="Hello" label="Hello" value="Hello" selected="true"') +
    ios('Button', 'name="go" label="Go"') + ios('Button', 'label="Disabled"').replace('enabled="true"', 'enabled="false"'));
  const elements = normalizeSource('ios', source).elements;
  assert.deepEqual(elements, [
    { ref: 'e1', role: 'application', actions: [], state: { enabled: true, visible: true }, frame: { x: 0, y: 0, width: 100, height: 50 } },
    { ref: 'e2', role: 'text', actions: ['longPress', 'touch'], state: { enabled: true, visible: true }, frame: { x: 0, y: 0, width: 100, height: 50 }, label: 'Hello' },
    { ref: 'e3', role: 'button', actions: ['tap', 'longPress', 'touch'], state: { enabled: true, visible: true }, frame: { x: 0, y: 0, width: 100, height: 50 }, label: 'Go', identifier: 'go' },
    { ref: 'e4', role: 'button', actions: [], state: { enabled: false, visible: true }, frame: { x: 0, y: 0, width: 100, height: 50 }, label: 'Disabled' },
  ]);
});
for (const platform of ['ios', 'android'] as const) {
  const source = platform === 'ios' ? iosSource(ios('Button', 'label="Go"')) : androidSource(android());
  for (const [name, xml] of [
    ['DTD', '<!DOCTYPE hierarchy [<!ENTITY x "oops">]>' + source],
    ['entity', '<!ENTITY x SYSTEM "file:///tmp/secret">' + source],
    ['mismatched', source.replace(platform === 'ios' ? '</AppiumAUT>' : '</hierarchy>', '</wrong>')],
    ['entity reference', source.replace('Go', '&unknown;')],
    ['duplicate attr', source.replace('enabled="true"', 'enabled="true" enabled="false"')],
    ['geometry', source.replace(platform === 'ios' ? 'width="100"' : '[100,50]', platform === 'ios' ? 'width="NaN"' : '[NaN,50]')],
    ['missing evidence', source.replace('enabled="true"', '')],
  ]) test(`${platform} refuses ${name} as incomplete`, () => incomplete(() => normalizeSource(platform, xml!), 'invalid-source'));
  test(`${platform} rejects the other platform root`, () => incomplete(() => normalizeSource(platform, platform === 'ios' ? androidSource(android()) : iosSource(ios('Button'))), 'invalid-source'));
  const limit = platform === 'ios' ? 50 : 70;
  const nested = (depth: number) => platform === 'ios' ? '<AppiumAUT>' + Array.from({ length: depth }, () => ios('Other').split('</')[0]).join('') + '</XCUIElementTypeOther>'.repeat(depth) + '</AppiumAUT>'
    : '<hierarchy>' + android().split('</')[0]!.repeat(depth) + '</node>'.repeat(depth) + '</hierarchy>';
  test(`${platform} accepts depth ${limit - 1} and refuses depth ${limit} and beyond`, () => {
    assert.equal(normalizeSource(platform, nested(limit - 1)).truncated, false);
    incomplete(() => normalizeSource(platform, nested(limit)), 'depth-limit');
    incomplete(() => normalizeSource(platform, nested(limit + 3)), 'depth-limit');
  });
}
test('source bytes and node count have hard bounds', () => {
  incomplete(() => normalizeSource('android', '<hierarchy>' + ' '.repeat(8 * 1024 * 1024) + '</hierarchy>'), 'source-limit');
  incomplete(() => normalizeSource('android', androidSource(android().repeat(20_001))), 'node-limit');
});
test('iOS status-bar subtree changes never change the bridge hash or shift its element references', () => {
  const a = normalizeSource('ios', iosSource(ios('StatusBar', '', ios('StaticText', 'label="10:30"')) + ios('Button', 'label="Go"')));
  const b = normalizeSource('ios', iosSource(ios('StatusBar', '', ios('StaticText', 'label="10:31"') + ios('Image')) + ios('Button', 'label="Go"')));
  assert.equal(a.screenHash, b.screenHash);
  assert.deepEqual(a.elements, b.elements);
  assert.notEqual(a.screenHash, normalizeSource('ios', iosSource(ios('Button', 'label="Stop"'))).screenHash);
});
test('recorded Android source renders its original P05 selectors without invented values', () => {
  const capture = normalizeSource('android', fixture('android-choose-none.xml'));
  assert.deepEqual(capture.elements.filter(e => e.identifier).map(e => [e.identifier, e.label, e.value ?? null]), [
    ['selection.summary', 'Selected: None', null], ['choose.apple', 'Add Apple ($2)', null],
    ['choose.bread', 'Add Bread ($3)', null], ['order.complete', 'Complete order', null],
  ]);
  assert.match(renderAssertionState({ ...capture, deviceId: 'test', capturedAt: 0, expiresAt: 60000, sequence: 1 }, 'android'), /"label":"Selected: None"/);
});

test('legacy Android corpus passes through XML without changing any frozen elements or capture output bytes', () => {
  const golden = JSON.parse(readFileSync(new URL('./golden/android-elements.json', import.meta.url), 'utf8'));
  const encode = (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
    .replaceAll('\n', '&#10;').replaceAll('\r', '&#13;').replaceAll('\t', '&#9;');
  const toXml = (node: Record<string, unknown>): string => {
    const rect = node.rect as { x: number; y: number; width: number; height: number };
    const fields = { ...node, children: undefined, rect: undefined, visible: undefined, displayed: node.visible ?? true,
      bounds: `[${rect.x},${rect.y}][${rect.x + rect.width},${rect.y + rect.height}]`, scrollable: node.scrollable ?? false, password: node.password ?? false };
    return `<node ${Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}="${encode(v)}"`).join(' ')}>` +
      ((node.children ?? []) as Record<string, unknown>[]).map(toXml).join('') + '</node>';
  };
  const actual: Record<string, unknown> = {};
  const printed: Record<string, unknown> = {};
  for (const screen of Object.keys(golden)) {
    const envelope = JSON.parse(readFileSync(new URL(`./fixtures/android/captures/${screen}.json`, import.meta.url), 'utf8'));
    const tree = JSON.parse(envelope.data.rawData);
    const capture = normalizeSource('android', androidSource(tree.hierarchy.map(toXml).join('')));
    actual[screen] = capture.elements;
    printed[screen] = capture.elements.map(e => ({ role: e.role, ...(e.label !== undefined ? { label: e.label } : {}),
      ...(e.value !== undefined ? { value: e.value } : {}), ...(e.identifier !== undefined ? { identifier: e.identifier } : {}),
      ...(e.placeholder !== undefined ? { placeholder: e.placeholder } : {}), ...(e.state ? { state: e.state } : {}),
      ...(e.selectable === false ? { selectable: false } : {}) }));
    assert.equal(renderAssertionState({ ...capture, deviceId: 'test', sequence: 1, capturedAt: 0, expiresAt: 60000 }, 'android'),
      readFileSync(new URL(`./fixtures/android/observations/${screen}.txt`, import.meta.url), 'utf8'));
  }
  assert.equal(JSON.stringify(actual, null, 2) + '\n', readFileSync(new URL('./golden/android-elements.json', import.meta.url), 'utf8'));
  const captureGolden = JSON.parse(readFileSync(new URL('./golden/android-capture.json', import.meta.url), 'utf8'));
  assert.equal(JSON.stringify(Object.fromEntries(Object.keys(captureGolden).map(k => [k, printed[k]])), null, 2) + '\n',
    readFileSync(new URL('./golden/android-capture.json', import.meta.url), 'utf8'));
});

test('the XML path preserves the android-render golden byte for byte', () => {
  const base = 'enabled="true" displayed="true" checkable="false" checked="false" focused="false" selected="false" scrollable="false" password="false"';
  const node = (attrs: string, children = '') => `<node ${base} ${attrs}>${children}</node>`;
  const xml = androidSource(
    node('class="android.widget.EditText" text="" content-desc="" hint="Betrag eingeben" resource-id="amount" clickable="true" bounds="[16,200][316,248]"').replace('focused="false"', 'focused="true"') +
    node('class="android.widget.EditText" text="12345678" content-desc="Password" resource-id="password" clickable="true" bounds="[16,280][316,328]"').replace('password="false"', 'password="true"') +
    node('class="android.widget.Button" text="" clickable="true" bounds="[16,360][316,408]"',
      node('class="android.widget.TextView" text="Add Bread ($3)" clickable="false" bounds="[24,372][224,396]"')));
  const capture = normalizeSource('android', xml);
  const rendered = renderAssertionState({ ...capture, deviceId: 'test', sequence: 1, capturedAt: 0, expiresAt: 60000 }, 'android');
  assert.equal(JSON.stringify(rendered, null, 2) + '\n', readFileSync(new URL('./golden/android-render.json', import.meta.url), 'utf8'));
});

test('iOS preserves real accessibility values on buttons and other roles, plus numeric switch values', () => {
  const capture = normalizeSource('ios', iosSource(
    ios('Button', 'label="°F" value="selected"') + ios('Button', 'label="Distance" value="Miles"') +
    ios('Switch', 'label="Enabled" value="1"') + ios('Image', 'label="Rating" value="Five stars"')));
  assert.deepEqual(capture.elements.slice(1).map(e => ({ role: e.role, label: e.label, value: e.value })), [
    { role: 'button', label: '°F', value: 'selected' }, { role: 'button', label: 'Distance', value: 'Miles' },
    { role: 'switch', label: 'Enabled', value: '1' }, { role: 'image', label: 'Rating', value: 'Five stars' },
  ]);
});
test('P05 choose-apple keeps the legacy e16 and e17 meanings without a numeric button selection flag or repeated text value', () => {
  const capture = normalizeSource('ios', fixture('ios-historical-choose-apple.xml'));
  assert.deepEqual(capture.elements.filter(e => e.label === 'Add Apple ($2)').map(e => [e.role, e.identifier ?? null, e.value ?? null]),
    [['button', 'choose.apple', null], ['text', null, null]]);
});
test('P05 live choose-none still has all three gap-proof fixes after keeping genuine accessibility values', () => {
  const capture = normalizeSource('ios', fixture('ios-live-choose-none.xml'));
  assert.deepEqual(capture.elements.filter(e => e.role === 'text').map(e => [e.label, e.value ?? null]),
    [['Sample Shop', null], ['Choose two items', null], ['Selected: None', null]]);
  assert.deepEqual(capture.elements.filter(e => e.role === 'button').map(e => [e.identifier, e.actions]), [
    ['choose.apple', ['tap', 'longPress', 'touch']], ['choose.bread', ['tap', 'longPress', 'touch']], ['order.complete', []],
  ]);
  assert.equal(capture.elements.filter(e => e.identifier && e.identifier === e.label).length, 0);
});
test('iOS accepts per-node odd geometry, since only structural defects refuse', () => {
  const capture = normalizeSource('ios', iosSource(ios('Button', 'label="Odd"').replace('width="100"', 'width="-4"')));
  assert.deepEqual(capture.elements[1]!.frame, { x: 0, y: 0, width: -4, height: 50 });
});
test('iOS keeps a typed value on input controls even when it equals the label', () => {
  const capture = normalizeSource('ios', iosSource(ios('TextField', 'label="Name" value="Name"') + ios('StaticText', 'label="Name" value="Name"')));
  assert.deepEqual(capture.elements.slice(1).map(e => e.value ?? null), ['Name', null]);
});
