import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as run from '../src/scripted/run.js';
import { claimOutcome, expectedVerdict, screenVerdict } from '../scripts/phase4/corpus/score.js';

const repoRoot = join(import.meta.dirname, '..');

test('run.ts exports the ADR-0004 assertion bounds: established at 0.9, rejected at 0.1', () => {
  assert.equal(run.CLAIM_ESTABLISHED_AT, 0.9);
  assert.equal(run.CLAIM_REJECTED_AT, 0.1);
});

test('the scripted checkpoint compares against the named bounds, not inline literals', () => {
  const source = readFileSync(join(repoRoot, 'src', 'scripted', 'run.ts'), 'utf8');
  assert.match(source, /value <= CLAIM_REJECTED_AT/);
  assert.match(source, /value < CLAIM_ESTABLISHED_AT/);
  assert.doesNotMatch(source, /value <=? 0\.[19]\b/);
});

test('a true claim is correct at 0.9 and above, confidently wrong at 0.1 and below, uncertain between', () => {
  assert.equal(claimOutcome(true, 0.9), 'correct');
  assert.equal(claimOutcome(true, 0.89), 'uncertain');
  assert.equal(claimOutcome(true, 0.11), 'uncertain');
  assert.equal(claimOutcome(true, 0.1), 'confidently-wrong');
});

test('a false claim is correct at 0.1 and below, confidently wrong at 0.9 and above, uncertain between', () => {
  assert.equal(claimOutcome(false, 0.1), 'correct');
  assert.equal(claimOutcome(false, 0.11), 'uncertain');
  assert.equal(claimOutcome(false, 0.89), 'uncertain');
  assert.equal(claimOutcome(false, 0.9), 'confidently-wrong');
});

test('a screen follows the checkpoint rule: any rejected claim fails it, even beside an uncertain one', () => {
  assert.equal(screenVerdict([0.5, 0.05]), 'failed');
  assert.equal(screenVerdict([0.95, 0.1]), 'failed');
  assert.equal(screenVerdict([0.95, 0.5]), 'inconclusive');
  assert.equal(screenVerdict([0.9, 0.99]), 'passed');
  assert.equal(expectedVerdict([true, false]), 'failed');
  assert.equal(expectedVerdict([true, true]), 'passed');
});

test('the corpus kit imports the bounds from run.ts and copies neither number', () => {
  const dir = join(repoRoot, 'scripts', 'phase4', 'corpus');
  const sources = readdirSync(dir).filter(name => name.endsWith('.ts')).map(name => [name, readFileSync(join(dir, name), 'utf8')] as const);
  for (const [name, source] of sources) assert.doesNotMatch(source, /(?<![\d.])0\.[19](?!\d)/, name);
  const score = sources.find(([name]) => name === 'score.ts')?.[1] ?? '';
  assert.match(score, /import \{[^}]*\bCLAIM_ESTABLISHED_AT\b[^}]*\} from '\.\.\/\.\.\/\.\.\/src\/scripted\/run\.js'/);
  assert.match(score, /import \{[^}]*\bCLAIM_REJECTED_AT\b[^}]*\} from '\.\.\/\.\.\/\.\.\/src\/scripted\/run\.js'/);
});
