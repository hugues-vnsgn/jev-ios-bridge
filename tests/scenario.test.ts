import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseScenario } from '../src/scenario/index.js';

const valid = {
  goal: 'Create a reminder for today',
  app: { bundleId: 'com.apple.reminders' },
  assertions: [{ id: 'saved', claim: 'The reminder appears in Today' }],
  values: { title: 'Buy milk' },
};

test('accepts a scenario with explicit typed values', () => {
  assert.deepEqual(parseScenario(valid), valid);
});

test('rejects non-US keyboard text and duplicate assertion IDs', () => {
  assert.throws(() => parseScenario({ ...valid, values: { title: 'Café' } }), /Typed values/);
  assert.throws(() => parseScenario({ ...valid, assertions: [valid.assertions[0], valid.assertions[0]] }), /unique/);
});

test('rejects malformed device IDs and unrecognized fields', () => {
  assert.throws(() => parseScenario({ ...valid, device: { udid: 'OPS iPhone' } }));
  assert.throws(() => parseScenario({ ...valid, unreviewed: true }));
});

test('accepts ordered checkpoints while preserving the legacy scenario form', () => {
  const ordered = {
    app: { bundleId: 'com.example.weather' },
    checkpoints: [
      { id: 'settings', goal: 'Verify selected units', assertions: [{ id: 'visible', claim: 'Fahrenheit is selected' }] },
      { id: 'home', goal: 'Return Home', assertions: [{ id: 'visible', claim: 'Home forecast is visible' }], values: { query: 'London' } },
    ],
  };
  assert.deepEqual(parseScenario(ordered), ordered);
  assert.deepEqual(parseScenario(valid), valid);
});

test('rejects mixed root assertions and malformed checkpoint sequences before device work', () => {
  const checkpoints = [
    { id: 'settings', goal: 'Verify settings', assertions: [{ id: 'units', claim: 'Fahrenheit is selected' }] },
    { id: 'home', goal: 'Return Home', assertions: [{ id: 'home', claim: 'Home is visible' }] },
  ];
  const base = { app: { bundleId: 'com.example.weather' }, checkpoints };
  assert.throws(() => parseScenario({ ...base, goal: 'Ambiguous root goal', assertions: valid.assertions }));
  assert.throws(() => parseScenario({ ...base, values: { query: 'future' } }));
  assert.throws(() => parseScenario({ ...base, checkpoints: [checkpoints[0]] }));
  assert.throws(() => parseScenario({ ...base, checkpoints: [{ ...checkpoints[0], assertions: [] }, checkpoints[1]] }));
  assert.throws(() => parseScenario({ ...base, checkpoints: [checkpoints[0], { ...checkpoints[1], id: 'settings' }] }));
});

test('rejects leading hyphen text that pinned MobileBuildMCP cannot type', () => {
  assert.throws(() => parseScenario({ ...valid, values: { query: '-L' } }), /MobileBuildMCP 2\.7\.1.*leading hyphen/);
  assert.deepEqual(parseScenario({ ...valid, values: { query: 'London-' } }).values, { query: 'London-' });
  const ordered = { app: valid.app, checkpoints: [
    { id: 'first', goal: 'Search', assertions: valid.assertions },
    { id: 'second', goal: 'Verify', assertions: valid.assertions, values: { query: '--London' } },
  ] };
  assert.throws(() => parseScenario(ordered), /MobileBuildMCP 2\.7\.1.*leading hyphen/);
});

test('rejects an unbounded typed-value list before action expansion', () => {
  assert.throws(() => parseScenario({
    goal: 'Fill a field', app: { bundleId: 'com.example.app' },
    assertions: [{ id: 'filled', claim: 'Field contains the supplied value' }],
    values: Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['value' + i, 'text'])),
  }), /at most 32/);
});
