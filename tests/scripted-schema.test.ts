import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptedScenario } from '../spikes/scripted/schema.js';

const scenario = {
  app: { bundleId: 'dev.example.Sample' },
  values: { query: 'Berlin' },
  steps: [
    { id: 'enterQuery', kind: 'action', guard: { present: [{ identifier: 'search.field', role: 'text-field', value: '' }] },
      action: { kind: 'replaceText', selector: { identifier: 'search.field', role: 'text-field', value: '' }, valueKey: 'query' } },
    { id: 'verifyResults', kind: 'checkpoint', guard: { present: [{ identifier: 'search.results' }] },
      assertions: [{ id: 'city', claim: 'Berlin is visible in the results.' }] },
  ],
} as const;

test('strict scripted schema accepts an empty-value filter and omits undefined optionals', () => {
  const parsed = parseScriptedScenario({ ...scenario, device: { udid: undefined }, preconditions: undefined });
  assert.equal(parsed.steps.length, 2);
  assert.deepEqual(parsed.device, {});
  assert.ok(!Object.hasOwn(parsed, 'preconditions'));
  assert.equal(parsed.steps[0]?.kind, 'action');
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
