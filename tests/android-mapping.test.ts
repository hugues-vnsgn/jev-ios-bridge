import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Snapshot } from '../src/contracts/index.js';
import { mapAndroidTree, type AndroidNode, type AndroidTree } from '../src/device/android/mapping.js';
import { renderAssertionState } from '../src/scripted/observe.js';
import { checkGolden } from './fixtures/golden.js';

/**
 * The captures and judged texts in tests/fixtures/android/ are copied from the prototype branch
 * prototype/android-element-mapping at commit 2366759 (spikes/android/captures/*.json and
 * spikes/android/jev-check/observations/*.txt). Each judged text is exactly what Jev saw in the 10-screen
 * check; cmp-3-number-input.txt is the version re-checked after the placeholder fix.
 */
const fixtures = join(import.meta.dirname, 'fixtures', 'android');
const elementsGolden = join(import.meta.dirname, 'golden', 'android-elements.json');
const SCREENS = ['cmp-1-launch', 'cmp-2-home', 'cmp-3-number-input', 'cmp-4-fullscreen-modal', 'settings-1-main',
  'settings-2-display', 'settings-3-search', 'twin-1-choose', 'twin-2-apple-added', 'twin-3-confirmation'];

/** A capture is mobilecli's `dump ui --format raw` envelope, whose `rawData` has the agent's tree shape. */
function captureTree(screen: string): AndroidTree {
  const envelope = JSON.parse(readFileSync(join(fixtures, 'captures', `${screen}.json`), 'utf8'));
  return JSON.parse(envelope.data.rawData);
}

function snapshotOf(tree: AndroidTree): Snapshot {
  return { deviceId: 'emulator-5554', capturedAt: 1_700_000_000_000, expiresAt: 1_700_000_060_000,
    sequence: 1, truncated: false, elements: mapAndroidTree(tree) };
}

function walk(nodes: AndroidNode[], visit: (node: AndroidNode) => void): void {
  for (const node of nodes) { visit(node); walk(node.children ?? [], visit); }
}

for (const screen of SCREENS) {
  test(`${screen}: the raw tree has the agent's node shape`, () => {
    const tree = captureTree(screen);
    assert.ok(Array.isArray(tree.hierarchy) && tree.hierarchy.length > 0);
    walk(tree.hierarchy, node => {
      for (const key of ['class', 'text', 'hint', 'content-desc', 'resource-id'] as const) assert.equal(typeof node[key], 'string', key);
      for (const key of ['checkable', 'checked', 'clickable', 'enabled', 'focused', 'selected', 'visible'] as const) {
        assert.equal(typeof node[key], 'boolean', key);
      }
      assert.deepEqual(Object.keys(node.rect ?? {}).sort(), ['height', 'width', 'x', 'y']);
    });
  });

  test(`${screen}: Jev sees exactly the judged text`, () => {
    const judged = readFileSync(join(fixtures, 'observations', `${screen}.txt`), 'utf8');
    assert.equal(renderAssertionState(snapshotOf(captureTree(screen)), 'android'), judged);
  });
}

test('golden: the elements each capture maps to', async () => {
  await checkGolden(elementsGolden, Object.fromEntries(SCREENS.map(screen => [screen, mapAndroidTree(captureTree(screen))])));
});

/** Small fixtures for the flags the captures lack: three scrollable lists from the agent's own tree on API 36
 *  (`.scratch/android-support/findings/05-assets/api36-lists-direct.json`), and hand-made text fields. */
function fixtureTree(name: string): AndroidTree {
  return JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8'));
}

function byIdentifier(elements: Element[], identifier: string): Element {
  const found = elements.filter(element => element.identifier === identifier);
  assert.equal(found.length, 1, identifier);
  return found[0]!;
}

test('any node with scrollable: true is a scroll view whatever its class, so a LazyColumn-style View can be swiped', () => {
  const elements = mapAndroidTree(fixtureTree('api36-lists-scrollable'));
  for (const identifier of ['list.lazy', 'list.row', 'list.column']) {
    const list = byIdentifier(elements, identifier);
    assert.equal(list.role, 'scroll-view', identifier);
    assert.deepEqual(list.actions, ['swipeWithin'], identifier);
  }
  assert.equal(byIdentifier(elements, 'list.lazy').frame?.height, 683);
  assert.deepEqual(elements.filter(element => element.role === 'text').map(element => element.label).slice(0, 3),
    ['Row 0', 'Row 1', 'Row 2']);
});

test('a multi-line EditText that reports scrollable stays a text field and keeps typeText', () => {
  const notes = byIdentifier(mapAndroidTree(fixtureTree('text-fields')), 'field.notes');
  assert.equal(notes.role, 'text-field');
  assert.deepEqual(notes.actions, ['tap', 'typeText']);
  assert.equal(notes.value, 'First line\nSecond line');
});

test('a password field shows dots of its text\'s length, and its raw text appears nowhere in the element', () => {
  const password = byIdentifier(mapAndroidTree(fixtureTree('text-fields')), 'field.password');
  assert.equal(password.value, '••••••••••••••');
  assert.equal(password.value?.length, 'hunter2-secret'.length);
  assert.equal(password.label, 'Password');
  assert.doesNotMatch(JSON.stringify(password), /hunter2/);
});

test('a password node\'s raw text never becomes a label, even with no content-desc', () => {
  const tree: AndroidTree = { hierarchy: [
    { class: 'android.view.View', text: '', clickable: true, rect: { x: 0, y: 0, width: 100, height: 50 }, children: [
      { class: 'android.view.View', text: 'hunter2-secret', password: true, rect: { x: 0, y: 0, width: 100, height: 50 } },
    ] },
  ] };
  assert.doesNotMatch(JSON.stringify(mapAndroidTree(tree)), /hunter2/);
});

test('a field holding only spaces has those spaces as its value, not its hint as a placeholder', () => {
  const spaces = byIdentifier(mapAndroidTree(fixtureTree('text-fields')), 'field.spaces');
  assert.equal(spaces.value, '   ');
  assert.equal(spaces.placeholder, undefined);
  assert.equal(spaces.label, 'Name');
});

test('a field\'s value with a trailing space is kept exactly as the device reports it', () => {
  assert.equal(byIdentifier(mapAndroidTree(fixtureTree('text-fields')), 'field.city').value, 'Hà Nội ');
});

test('an empty field has no value, and its hint is the placeholder Jev sees', () => {
  const elements = mapAndroidTree(fixtureTree('text-fields'));
  const empty = byIdentifier(elements, 'field.empty');
  assert.equal(empty.value, undefined);
  assert.equal(empty.placeholder, 'Email');
  const rendered = renderAssertionState(snapshotOf(fixtureTree('text-fields')), 'android');
  assert.match(rendered, /\{"role":"text-field","placeholder":"Email","identifier":"field.empty"/);
  assert.match(rendered, /"value":"Hà Nội ","identifier":"field.city"/);
});

test('refs are unique within one capture and the same when the capture is mapped again', () => {
  for (const screen of SCREENS) {
    const refs = mapAndroidTree(captureTree(screen)).map(element => element.ref);
    assert.equal(new Set(refs).size, refs.length, screen);
    assert.deepEqual(mapAndroidTree(captureTree(screen)).map(element => element.ref), refs, screen);
  }
});

test('a password field shows one dot per UTF-16 unit of its text, as Android draws it, so an emoji takes two', () => {
  const tree: AndroidTree = { hierarchy: [{ class: 'android.widget.EditText', text: 'pin😀', password: true,
    'resource-id': 'field.pin', rect: { x: 0, y: 0, width: 100, height: 50 } }] };
  assert.equal(byIdentifier(mapAndroidTree(tree), 'field.pin').value, '•••••');
});
