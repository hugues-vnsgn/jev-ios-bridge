import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Snapshot } from '../src/contracts/index.js';
import { renderAssertionState as productionState } from '../src/scripted/observe.js';
import { buildAssertionRequest as productionRequest } from '../src/scripted/jev.js';
import { renderAssertionState as frozenState } from '../spikes/scripted/observe.js';
import { buildAssertionRequest as frozenRequest } from '../spikes/scripted/jev.js';

test('production projection and Noul requests match all 24 frozen assertion cases byte for byte', async () => {
  const corpus = JSON.parse(await readFile(new URL('../spikes/scripted/corpus/corpus.json', import.meta.url), 'utf8')) as {
    cases: Array<{ snapshot: Snapshot; claims: Array<{ id: string; claim: string }> }>;
  };
  assert.equal(corpus.cases.length, 24);
  for (const [index, item] of corpus.cases.entries()) {
    const assertions = item.claims.map(({ id, claim }) => ({ id, claim }));
    const frozen = frozenState(item.snapshot);
    const production = productionState(item.snapshot);
    assert.equal(production, frozen, `screen ${index + 1} projection`);
    assert.equal(JSON.stringify(productionRequest(assertions, production)),
      JSON.stringify(frozenRequest(assertions, frozen)), `screen ${index + 1} request`);
  }
});
