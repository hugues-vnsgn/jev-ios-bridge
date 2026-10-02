import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { Element, Platform } from '../src/contracts/index.js';
import { buildCandidates, lookupCandidate, MAX_OPTIONS } from '../src/driven/candidates.js';
// The frozen spike is the reference: its loaders read the public captures, its builder fixes the keys.
import { buildCandidates as spikeBuildCandidates, loadCapture } from '../spikes/jev-drives/candidates.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 0, y: 0, width: 10, height: 10 }, state: { enabled: true, visible: true }, actions: ['tap'], ...extra,
});

test('taps only visible, enabled, selectable, tappable elements; types only allowed value keys; fixed options last', () => {
  const { state: _state, ...stateless } = el('e8', 'button', { label: 'No state' });
  const { candidates, dropped } = buildCandidates([
    el('e1', 'button', { label: 'Save' }),
    el('e2', 'button', { label: 'Hidden', state: { enabled: true, visible: false } }),
    el('e3', 'button', { label: 'Off', state: { enabled: false, visible: true } }),
    el('e4', 'text', { label: 'Plain', actions: ['touch'] }),
    el('e5', 'text-field', { placeholder: 'Name', actions: ['tap', 'typeText'] }),
    el('e6', 'button', { label: 'Zero', frame: { x: 0, y: 0, width: 0, height: 10 } }),
    el('e7', 'text', { label: 'Lifted', selectable: false }),
    stateless,
    el('e9', 'text-field', { label: 'Off field', actions: ['typeText'], state: { enabled: false, visible: true } }),
  ], ['name']);
  assert.equal(dropped, 0);
  assert.deepEqual(candidates.map(c => c.key),
    ['type:e5:name', 'tap:e1', 'tap:e5', 'scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
  assert.match(candidates[1]!.description, /button "Save"/);
  assert.match(candidates[0]!.description, /placeholder "Name".*plan value name$/);
});

test('no allowed value keys means no type options', () => {
  assert.deepEqual(buildCandidates([el('e1', 'text-field', { actions: ['typeText'] })]).candidates.map(c => c.key),
    ['scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
  assert.deepEqual(buildCandidates([el('e1', 'text-field', { actions: ['typeText'] })], []).candidates.map(c => c.key),
    ['scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
});

test('value keys are typed in sorted order, once each, field by field', () => {
  const keys = buildCandidates([
    el('f1', 'text-field', { actions: ['typeText'] }),
    el('f2', 'text-field', { actions: ['typeText'] }),
  ], ['title', 'body', 'title']).candidates.map(c => c.key);
  assert.deepEqual(keys.slice(0, 4), ['type:f1:body', 'type:f1:title', 'type:f2:body', 'type:f2:title']);
});

test('descriptions never carry a value, only its key', () => {
  const set = buildCandidates([el('f1', 'text-field', { label: 'Password', actions: ['typeText'] })], ['secret']);
  assert.equal(set.candidates[0]!.description,
    'Replace the text of the text-field "Password" at x 0, y 0, 10x10 with the plan value secret');
});

test('the option list never exceeds 255 and keeps the type options', () => {
  const many = Array.from({ length: 300 }, (_, i) => el(`e${i}`, 'button', { label: `Row ${i}` }));
  const set = buildCandidates([...many, el('f1', 'text-field', { actions: ['tap', 'typeText'] })], ['q']);
  assert.equal(set.candidates.length, MAX_OPTIONS);
  assert.equal(set.candidates[0]!.key, 'type:f1:q');
  assert.deepEqual(set.candidates.slice(-5).map(c => c.key), ['scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
  assert.equal(set.candidates[1]!.key, 'tap:e0', 'taps kept in document order');
  assert.equal(set.dropped, 300 + 2 - (MAX_OPTIONS - 5));
});

test('a set exactly at the cap drops nothing', () => {
  const many = Array.from({ length: MAX_OPTIONS - 5 }, (_, i) => el(`e${i}`, 'button'));
  const set = buildCandidates(many);
  assert.equal(set.candidates.length, MAX_OPTIONS);
  assert.equal(set.dropped, 0);
});

test('status bars are never candidates', () => {
  const keys = buildCandidates([el('e1', 'StatusBar'), el('e2', 'other', { identifier: 'status_bar' })]).candidates.map(c => c.key);
  assert.deepEqual(keys, ['scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
});

test('type options alone over the cap still leave the five fixed options', () => {
  const fields = Array.from({ length: 30 }, (_, i) => el(`f${i}`, 'text-field', { actions: ['typeText'] }));
  const set = buildCandidates(fields, Array.from({ length: 10 }, (_, i) => `v${i}`));
  assert.equal(set.candidates.length, MAX_OPTIONS);
  assert.equal(set.dropped, 300 - (MAX_OPTIONS - 5));
  assert.deepEqual(set.candidates.slice(-5).map(c => c.key), ['scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
});

test('a ref seen twice is offered once, for its first element', () => {
  const first = el('e1', 'button', { label: 'First' });
  const set = buildCandidates([first, el('e1', 'button', { label: 'Second' })]);
  assert.deepEqual(set.candidates.map(c => c.key), ['tap:e1', 'scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
  assert.match(set.candidates[0]!.description, /"First"/);
  assert.equal((lookupCandidate(set, 'tap:e1') as { element: Element }).element, first);
});

test('each key maps back to the Action and element it means', () => {
  const save = el('e1', 'button', { label: 'Save' });
  const field = el('e5', 'text-field', { placeholder: 'Name', actions: ['tap', 'typeText'] });
  const set = buildCandidates([save, field], ['name']);
  assert.deepEqual(lookupCandidate(set, 'tap:e1'), { kind: 'action', action: { kind: 'tap', targetRef: 'e1' }, element: save });
  assert.deepEqual(lookupCandidate(set, 'type:e5:name'),
    { kind: 'action', action: { kind: 'type', targetRef: 'e5', valueKey: 'name' }, element: field });
  assert.deepEqual(lookupCandidate(set, 'scroll:up'), { kind: 'action', action: { kind: 'scroll', direction: 'up' } });
  assert.deepEqual(lookupCandidate(set, 'scroll:down'), { kind: 'action', action: { kind: 'scroll', direction: 'down' } });
  assert.deepEqual(lookupCandidate(set, 'back'), { kind: 'action', action: { kind: 'back' } });
  assert.deepEqual(lookupCandidate(set, 'step_done'), { kind: 'step_done' });
  assert.deepEqual(lookupCandidate(set, 'none_fits'), { kind: 'none_fits' });
});

test('a key that is not in the set maps to nothing', () => {
  const set = buildCandidates([el('e1', 'button'), el('e2', 'button', { state: { enabled: false, visible: true } })], ['v']);
  assert.equal(lookupCandidate(set, 'tap:e2'), undefined, 'excluded element');
  assert.equal(lookupCandidate(set, 'tap:e9'), undefined, 'unknown ref');
  assert.equal(lookupCandidate(set, 'type:e1:v'), undefined, 'not typeable');
  assert.equal(lookupCandidate(set, 'scroll:left'), undefined);
  assert.equal(lookupCandidate(set, 'toString'), undefined, 'no prototype keys');
});

test('refs containing a colon still map back exactly', () => {
  const field = el('a:1', 'text-field', { actions: ['typeText'] });
  const set = buildCandidates([field], ['k:v']);
  assert.deepEqual(lookupCandidate(set, 'type:a:1:k:v'),
    { kind: 'action', action: { kind: 'type', targetRef: 'a:1', valueKey: 'k:v' }, element: field });
});

interface SpikeCase {
  id: string; platform: Platform; capture: string; values: Record<string, string>; expectedAction: string; alsoRight: string[];
}
const root = join(import.meta.dirname, '..');
const cases: SpikeCase[] = JSON.parse(readFileSync(join(root, 'spikes/jev-drives/cases.json'), 'utf8')).cases;

test('on every spike capture: same keys in the same order as the spike, deterministic, labelled answers offered', () => {
  assert.ok(cases.length > 0);
  for (const c of cases) {
    const dir = join(root, c.capture);
    const elements = loadCapture(dir, c.platform);
    const valueKeys = Object.keys(c.values);
    const first = buildCandidates(elements, valueKeys);
    assert.deepEqual(first, buildCandidates(loadCapture(dir, c.platform), valueKeys), `${c.id}: deterministic`);
    const spike = spikeBuildCandidates(elements, { values: c.values });
    assert.deepEqual(first.candidates.map(k => k.key), spike.candidates.map(k => k.key), `${c.id}: spike keys`);
    assert.equal(first.dropped, spike.dropped, `${c.id}: dropped`);
    const keys = new Set(first.candidates.map(k => k.key));
    for (const key of [c.expectedAction, ...c.alsoRight]) {
      assert.ok(keys.has(key), `${c.id}: ${key} is a candidate`);
      assert.ok(lookupCandidate(first, key), `${c.id}: ${key} maps back`);
    }
    for (const value of Object.values(c.values)) {
      for (const k of first.candidates.filter(k => k.key.startsWith('type:'))) {
        assert.ok(!k.description.includes(`"${value}"`), `${c.id}: value text never in a description`);
      }
    }
  }
});
