import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import test from 'node:test';
import { parsePrepareAllocation } from '../src/observed/allocation-schema.js';
import { parseObservedAction } from '../src/observed/schema.js';
import { parseMigrationDeclaration } from '../src/device/admission-migration.js';
import { observedCommands } from '../src/observed/cli.js';

const guide = readFileSync('docs/guide/14-observed-actions.md', 'utf8');
const reference = readFileSync('docs/guide/reference/observed-format.md', 'utf8');
test('observed guide example requests parse through production strict schemas', () => {
  const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(([, text]) => JSON.parse(text!));
  assert.equal(examples.length, 3);
  assert.deepEqual(parseMigrationDeclaration(examples[0]), { version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
    additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [] });
  assert.equal(parsePrepareAllocation(examples[1]).actionId, 'open-settings-001');
  assert.equal(parseObservedAction(examples[2]).actionId, 'open-settings-001');
});
test('observed installed guide links resolve and the index/skill expose it', () => {
  for (const file of ['docs/guide/14-observed-actions.md', 'docs/guide/reference/observed-format.md']) {
    for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|#)/.test(target!)) continue;
      assert.ok(existsSync(normalize(join(dirname(file), target!.split('#')[0]!))), `${file}: ${target}`);
    }
  }
  const index = readFileSync('docs/guide/README.md', 'utf8');
  assert.ok(index.includes('](14-observed-actions.md)')); assert.ok(index.includes('](reference/observed-format.md)'));
  const skill = readFileSync('skills/test-ios/SKILL.md', 'utf8');
  assert.ok(skill.includes('14-observed-actions.md')); assert.ok(skill.includes('reference/observed-format.md'));
});
test('observed operation map covers the actual command surface and seven MCP names', () => {
  for (const name of observedCommands) assert.ok(guide.includes('`' + name), name);
  const golden = JSON.parse(readFileSync('tests/golden/observed-mcp-v1.json', 'utf8'));
  assert.equal(golden.tools.length, 7);
  for (const tool of golden.tools) assert.ok(guide.includes('`' + tool.name + '`'), tool.name);
});
test('observed reference separates key-free startup, offline migration and unverified native/live scope', () => {
  for (const term of ['JEV_EXPERIMENTAL_OBSERVED=1', 'writersStopped', 'historicalRootsDeclaredOrExcluded',
    'node dist/device/admission-maintenance.js migrate <declaration.json>', 'no destination override', 'OS account',
    'L04 is synthetic reply loss after backend success', 'TYPESAFE_API_KEY']) assert.ok(guide.includes(term), term);
  for (const term of ['unconfirmed', 'HOST_CREATION_UNRESOLVED', 'capacityHeld', 'retired_unused',
    'transport acknowledgement', 'not native ownership/release certification']) assert.ok(reference.includes(term), term);
});
