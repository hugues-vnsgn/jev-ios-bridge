import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Snapshot } from '../src/contracts/index.js';
import { PROJECTION_RULE, renderAssertionState as productionState } from '../src/scripted/observe.js';
import { buildAssertionRequest as productionRequest } from '../src/scripted/jev.js';
import { renderAssertionState as frozenV1State } from '../spikes/scripted/observe.js';
import { buildAssertionRequest as frozenRequest } from '../spikes/scripted/jev.js';
import { render as experimentState } from '../spikes/observation-shape/variants.js';

async function corpus() {
  const parsed = JSON.parse(await readFile(new URL('../spikes/scripted/corpus/corpus.json', import.meta.url), 'utf8')) as {
    cases: Array<{ snapshot: Snapshot; claims: Array<{ id: string; claim: string }> }>;
  };
  assert.equal(parsed.cases.length, 24);
  return parsed.cases;
}

test('production v2 projection is exactly the text the observation-shape experiment sent as variant B', async () => {
  assert.equal(PROJECTION_RULE, 'visible-full-text-v2');
  for (const [index, item] of (await corpus()).entries()) {
    assert.equal(productionState(item.snapshot), experimentState(item.snapshot, 'B'), `screen ${index + 1} projection`);
  }
});

test('the experiment baseline V0 is the frozen v1 projection, and the Noul request wrapper is unchanged', async () => {
  for (const [index, item] of (await corpus()).entries()) {
    const assertions = item.claims.map(({ id, claim }) => ({ id, claim }));
    const v1 = frozenV1State(item.snapshot);
    assert.equal(experimentState(item.snapshot, 'V0'), v1, `screen ${index + 1} baseline`);
    assert.equal(JSON.stringify(productionRequest(assertions, v1)), JSON.stringify(frozenRequest(assertions, v1)),
      `screen ${index + 1} request`);
  }
});
