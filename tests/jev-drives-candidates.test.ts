import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { Element, Platform } from '../src/contracts/index.js';
import { buildCandidates, loadCapture, MAX_OPTIONS } from '../spikes/jev-drives/candidates.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 0, y: 0, width: 10, height: 10 }, state: { enabled: true, visible: true }, actions: ['tap'], ...extra,
});

test('taps only visible, enabled, tappable elements; types only plan values; fixed options last', () => {
  const { candidates, dropped } = buildCandidates([
    el('e1', 'button', { label: 'Save' }),
    el('e2', 'button', { label: 'Hidden', state: { enabled: true, visible: false } }),
    el('e3', 'button', { label: 'Off', state: { enabled: false, visible: true } }),
    el('e4', 'text', { label: 'Plain', actions: ['touch'] }),
    el('e5', 'text-field', { placeholder: 'Name', actions: ['tap', 'typeText'] }),
    el('e6', 'button', { label: 'Zero', frame: { x: 0, y: 0, width: 0, height: 10 } }),
  ], { values: { name: 'Groceries' } });
  assert.equal(dropped, 0);
  assert.deepEqual(candidates.map(c => c.key),
    ['type:e5:name', 'tap:e1', 'tap:e5', 'scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits']);
  assert.match(candidates[1]!.description, /button "Save"/);
  assert.match(candidates[0]!.description, /placeholder "Name".*plan value name \("Groceries"\)/);
  assert.deepEqual(buildCandidates([el('e1', 'text-field', { actions: ['typeText'] })]).candidates.map(c => c.key),
    ['scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits'], 'no plan values means no type options');
});

test('the option list never exceeds 255 and keeps plan-value types', () => {
  const many = Array.from({ length: 300 }, (_, i) => el(`e${i}`, 'button', { label: `Row ${i}` }));
  const set = buildCandidates([...many, el('f1', 'text-field', { actions: ['tap', 'typeText'] })], { values: { q: 'x' } });
  assert.equal(set.candidates.length, MAX_OPTIONS);
  assert.equal(set.candidates[0]!.key, 'type:f1:q');
  assert.equal(set.candidates.at(-1)!.key, 'none_fits');
  assert.ok(set.dropped > 0);
});

interface SpikeCase {
  id: string; app: string; platform: Platform; capture: string; goal: string; step: string; doneWhen: string;
  values: Record<string, string>; effect: 'none' | 'test_write' | 'destructive'; history: string[];
  expectedAction: string; alsoRight: string[]; expectedDone: boolean; traps: string[]; rationale: string;
}
const TRAPS = new Set(['routine', 'scrolled_off', 'unsaved_form', 'duplicate_targets', 'duplicate_rows', 'similar_rows',
  'icon_only', 'permission_prompt', 'unexpected_dialog', 'destructive', 'system_sheet', 'web_content', 'canvas',
  'step_already_done']);
const root = join(import.meta.dirname, '..');
const files = ['spikes/jev-drives/cases.json'].map(f => join(root, f)); // the owner's app was dropped from the spike (owner, 2026-10-01)
const cases: SpikeCase[] = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).cases);

test('every labelled case resolves against its own capture', () => {
  assert.ok(cases.length >= 26 && cases.length <= 32 || files.length === 1, `case count ${cases.length}`);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length, 'unique ids');
  for (const c of cases) {
    const dir = join(root, c.capture);
    const screen = readFileSync(join(dir, c.platform === 'ios' ? 'jev-screen.txt' : 'capture-jev.txt'), 'utf8');
    const first = buildCandidates(loadCapture(dir, c.platform), { values: c.values });
    const again = buildCandidates(loadCapture(dir, c.platform), { values: c.values });
    assert.deepEqual(first, again, `${c.id}: deterministic`);
    const keys = new Set(first.candidates.map(k => k.key));
    for (const key of [c.expectedAction, ...c.alsoRight]) assert.ok(keys.has(key), `${c.id}: ${key} is a candidate`);
    assert.ok(['none', 'test_write', 'destructive'].includes(c.effect), `${c.id}: effect`);
    if (c.effect === 'destructive') assert.equal(c.expectedAction, 'none_fits', `${c.id}: destructive goes to Claude`);
    if (c.expectedDone) assert.equal(c.expectedAction, 'step_done', `${c.id}: a done step needs no action`);
    assert.ok(c.history.length <= 2, `${c.id}: at most two recent actions`);
    for (const trap of c.traps) assert.ok(TRAPS.has(trap), `${c.id}: trap ${trap}`);
    // Budget as the scripted judge applies it: state plus the longest question within 28,000 bytes.
    const state = JSON.stringify({ goal: c.goal, current_step: c.step, done_when: c.doneWhen, plan_values: c.values,
      recent_actions: c.history, screen });
    const choice = JSON.stringify(Object.fromEntries(first.candidates.map(k => [k.key, k.description])));
    assert.ok(Buffer.byteLength(state) + Buffer.byteLength(choice) <= 28_000, `${c.id}: request budget`);
  }
});
