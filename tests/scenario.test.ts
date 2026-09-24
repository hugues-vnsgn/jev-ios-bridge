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
