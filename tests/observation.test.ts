import assert from 'node:assert/strict';
import test from 'node:test';
import type { Scenario, Snapshot } from '../src/contracts/index.js';
import { actionOptions, buildObservation, ObservationError } from '../src/observation/index.js';

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
