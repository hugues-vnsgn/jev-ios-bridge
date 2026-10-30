import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as run from '../src/scripted/run.js';

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
