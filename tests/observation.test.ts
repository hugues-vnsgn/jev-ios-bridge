import assert from 'node:assert/strict';
import test from 'node:test';
import type { Snapshot } from '../src/contracts/index.js';
import type { Scenario } from '../spikes/legacy/contracts.js';
import { actionOptions, buildObservation, ObservationError } from '../spikes/legacy/observation.js';

const scenario: Scenario = {
  goal: 'Enter the synthetic email', app: { bundleId: 'test.app' },
  assertions: [], values: { email: 'alice@example.invalid' },
};
function snapshot(elements: Snapshot['elements']): Snapshot {
  return { deviceId: 'sim', capturedAt: 1_700_000_000_000, expiresAt: 1_700_000_060_000,
    sequence: 1, truncated: false, screenshotPath: '/private/screen.jpg', elements };
}

test('complete options bind target, value and direction; duplicate labels remain distinct', () => {
  const shot = snapshot([
    { ref: 'e1', role: 'textField', label: 'Email', actions: ['tap', 'typeText'] },
    { ref: 'e2', role: 'textField', label: 'Email', actions: ['tap', 'typeText'] },
    { ref: 'e3', role: 'scrollView', label: 'Results', actions: ['swipeWithin'] },
  ]);
  const options = actionOptions(shot, scenario);
  assert.deepEqual(options.map(option => option.id), [
    'tap:e1', 'type:e1:email', 'tap:e2', 'type:e2:email',
    'swipe:e3:up', 'swipe:e3:down', 'swipe:e3:left', 'swipe:e3:right',
    'wait', 'stop-goal', 'stop-blocked', 'none',
  ]);
  assert.deepEqual(options.find(option => option.id === 'type:e2:email')?.action,
    { kind: 'type', targetRef: 'e2', valueKey: 'email' });
  assert.match(options.find(option => option.id === 'type:e2:email')?.description ?? '', /Replace all text in Email with the supplied scenario value email/);
});

test('compact observation omits full fields, screenshot path and history when window is zero', () => {
  const shot = snapshot([{ ref: 'e1', role: 'button', label: 'Continue', actions: ['tap'],
    frame: { x: 1, y: 2, width: 10, height: 20 }, state: { enabled: true, visible: true } }]);
  const observation = buildObservation(scenario, shot, [{ step: 1, description: 'Previous action' }],
    { variant: 'compact', maxHistory: 0 });
  assert.match(observation.text, /label=Continue/);
  assert.doesNotMatch(observation.text, /frame=|state=|screen\.jpg|Previous action/);
  assert.equal(observation.snapshot.screenshotPath, '/private/screen.jpg');
});

test('candidate cap counts only actionable visible elements and never silently truncates actions', () => {
  const textRows = Array.from({ length: 140 }, (_, index) => ({ ref: `t${index}`, role: 'text', label: `Row ${index}`, actions: [] }));
  const shot = snapshot([...textRows, { ref: 'e1', role: 'button', label: 'Go', actions: ['tap'] }]);
  assert.equal(actionOptions(shot, scenario, 1).length, 5);
  assert.throws(() => actionOptions(snapshot([
    { ref: 'e1', role: 'button', actions: ['tap'] },
    { ref: 'e2', role: 'button', actions: ['tap'] },
  ]), scenario, 1), (error: unknown) => error instanceof ObservationError && error.code === 'TOO_MANY_CANDIDATES');
  const manyValues: Scenario = { ...scenario, values: Object.fromEntries(Array.from({ length: 252 }, (_, index) => [`v${index}`, 'x'])) };
  assert.throws(() => actionOptions(snapshot([{ ref: 'e1', role: 'textField', actions: ['typeText'] }]), manyValues),
    (error: unknown) => error instanceof ObservationError && error.code === 'TOO_MANY_ACTIONS');
});

test('state over conservative byte budget fails before a Jev request', () => {
  const shot = snapshot([{ ref: 'e1', role: 'text', label: 'x'.repeat(1000), actions: [] }]);
  assert.throws(() => buildObservation(scenario, shot, [], { maxStateBytes: 200 }),
    (error: unknown) => error instanceof ObservationError && error.code === 'STATE_BUDGET');
});

test('filtered full state drops empty containers but keeps semantic and actionable rows', () => {
  const frame = { x: 0, y: 0, width: 20, height: 20 };
  const empty = Array.from({ length: 150 }, (_, index) => ({ ref: `c${index}`, role: 'other', frame,
    state: { enabled: true, visible: true }, actions: [] as string[] }));
  const shot = snapshot([...empty,
    { ref: 'title', role: 'text', label: 'About', frame, actions: [] },
    { ref: 'alert', role: 'alert', frame, actions: [] },
    { ref: 'go', role: 'button', frame, actions: ['tap'] },
  ]);
  const observation = buildObservation(scenario, shot, [], { variant: 'full', maxStateBytes: 1_000 });
  assert.doesNotMatch(observation.text, /ref=c0\b|ref=c149\b/);
  assert.match(observation.text, /ref=title\b/);
  assert.match(observation.text, /ref=alert\b/);
  assert.match(observation.text, /ref=go\b/);
  assert.ok(observation.options.some(option => option.id === 'tap:go'));
});

test('v2 full options collapse only overlapping same-identity taps and keep distant rows', () => {
  const shot = snapshot([
    { ref: 'e1', role: 'button', label: 'About', identifier: 'about', frame: { x: 0, y: 0, width: 200, height: 50 }, actions: ['tap'] },
    { ref: 'e2', role: 'button', label: 'About', identifier: 'about', frame: { x: 10, y: 10, width: 80, height: 20 }, actions: ['tap'] },
    { ref: 'e3', role: 'button', label: 'About', identifier: 'about', frame: { x: 0, y: 100, width: 200, height: 50 }, actions: ['tap'] },
    { ref: 'e4', role: 'button', label: 'About', identifier: 'about', frame: { x: 0, y: 0, width: 200, height: 50 }, actions: ['tap'] },
    { ref: 'e5', role: 'button', label: 'About', identifier: 'about', frame: { x: 110, y: 10, width: 80, height: 20 }, actions: ['tap'] },
  ]);
  const full = buildObservation(scenario, shot, [], { variant: 'full', optionRule: 'v2' });
  assert.deepEqual(full.options.filter(option => option.action.kind === 'tap').map(option => option.id), ['tap:e1', 'tap:e3', 'tap:e5']);
  assert.doesNotMatch(full.text, /ref=e2\b|ref=e4\b/);
  const compact = buildObservation(scenario, shot, [], { variant: 'compact', optionRule: 'v2' });
  assert.deepEqual(compact.options.filter(option => option.action.kind === 'tap').map(option => option.id), ['tap:e1', 'tap:e2', 'tap:e3', 'tap:e4', 'tap:e5']);
});

test('v2 type action removes focus-only tap and swipe spells out finger and content direction', () => {
  const shot = snapshot([
    { ref: 'field', role: 'text-field', label: 'Email', actions: ['tap', 'typeText'] },
    { ref: 'scroll', role: 'scroll-view', label: 'Results', actions: ['swipeWithin'] },
    { ref: 'bar', role: 'slider', label: 'Vertical scroll bar, 1 page', actions: ['tap'] },
    { ref: 'size', role: 'slider', label: 'Text Size', actions: ['tap'] },
  ]);
  const observation = buildObservation(scenario, shot, [], { variant: 'full', optionRule: 'v2' });
  assert.ok(observation.options.some(option => option.id === 'type:field:email'));
  assert.ok(!observation.options.some(option => option.id === 'tap:field'));
  assert.ok(!observation.options.some(option => option.id === 'tap:bar'));
  assert.ok(observation.options.some(option => option.id === 'tap:size'));
  assert.doesNotMatch(observation.text, /ref=bar\b/);
  assert.match(observation.options.find(option => option.id === 'swipe:scroll:up')?.description ?? '', /finger.*bottom to top.*later/i);
});
