import assert from 'node:assert/strict';
import test from 'node:test';
import type { JevJudge, Scenario, Snapshot } from '../src/contracts/index.js';
import { JevRequestError } from '../src/jev/index.js';
import {
  digest, makeDraftManifest, runHeldout, runTuning, validateCorpus, validateFrozenExperiment,
  type ExperimentManifest, type FeasibilityCorpus, type OwnerApproval,
} from '../spikes/feasibility/harness.js';

function corpus(): FeasibilityCorpus {
  return { version: 1, cases: Array.from({ length: 30 }, (_, index) => {
    const id = `case-${index}`;
    const scenario: Scenario = { goal: id, app: { bundleId: 'synthetic.app' }, values: {},
      assertions: [{ id: 'expected', claim: 'The synthetic result is present' }] };
    const shot: Snapshot = { deviceId: 'sim', capturedAt: 1_700_000_000_000, expiresAt: 1_700_000_060_000,
      sequence: 1, truncated: false, elements: [{ ref: 'e1', role: 'button', label: 'Continue', actions: ['tap'] }] };
    return { id, scenarioGroup: `group-${index}`, partition: index < 10 ? 'tuning' as const : 'heldout' as const,
      scenario, compactSnapshot: shot, fullSnapshot: shot, history: [{ step: 1, description: 'Opened screen' }],
      labels: { acceptableActionIds: ['tap:e1'], goalReached: false, assertions: { expected: index !== 10 } } };
  }) };
}
function frozen(c: FeasibilityCorpus): { manifest: ExperimentManifest; approval: OwnerApproval } {
  const manifest = { ...makeDraftManifest(c), status: 'frozen' as const };
  const approval: OwnerApproval = { version: 1, approved: true, reviewedBy: 'Synthetic test owner',
    reviewedAt: '2026-09-24', corpusSha256: digest(c), manifestSha256: digest(manifest) };
  return { manifest, approval };
}
function fakeJudge(calls: string[], failCase?: string, falsePassCase?: string): JevJudge {
  return { async judge(_scenario, observation) {
    const id = /Goal: (case-\d+)/.exec(observation.text)?.[1] ?? 'unknown';
    calls.push(id);
    if (id === failCase) throw new JevRequestError('NETWORK');
    return { choice: 'tap:e1', confidence: 0.95,
      probabilities: Object.fromEntries(observation.options.map(option => [option.id, option.id === 'tap:e1' ? 1 : 0])),
      goalReached: 0.02, assertions: { expected: id === falsePassCase ? 0.95 : 0.05 },
      inputTokens: 10, latencyMs: 5, model: 'jev-1.13.0' };
  } };
}

test('corpus validation enforces group partitioning and 10/20 split', () => {
  const c = corpus();
  validateCorpus(c);
  c.cases[10]!.scenarioGroup = c.cases[0]!.scenarioGroup;
  assert.throws(() => validateCorpus(c), /SCENARIO_LEAKAGE/);
});

test('live stages require reviewed corpus and frozen manifest hashes', () => {
  const c = corpus();
  const { manifest, approval } = frozen(c);
  validateFrozenExperiment(c, manifest, approval);
  assert.throws(() => validateFrozenExperiment(c, { ...manifest, status: 'draft' }, approval), /MANIFEST_NOT_FROZEN/);
  assert.throws(() => validateFrozenExperiment(c, { ...manifest, implementationSha256: 'changed' }, approval), /IMPLEMENTATION_CHANGED/);
  c.cases[0]!.labels.acceptableActionIds = ['none'];
  assert.throws(() => validateFrozenExperiment(c, manifest, approval), /MANIFEST_NOT_FROZEN/);
});

test('a no-go tuning run retains every result and emits per-case evidence', async () => {
  const c = corpus();
  const { manifest, approval } = frozen(c);
  const recorded: string[] = [];
  const judge: JevJudge = { async judge(_scenario, observation) {
    return { choice: 'none', confidence: 0.99,
      probabilities: Object.fromEntries(observation.options.map(option => [option.id, option.id === 'none' ? 1 : 0])),
      goalReached: 0.02, assertions: { expected: 0.05 }, inputTokens: 10, latencyMs: 1, model: 'jev-1.13.0' };
  } };
  const run = await runTuning(c, manifest, approval, judge, new AbortController().signal,
    async result => { recorded.push(result.caseId); });
  assert.equal(run.selection, null);
  assert.equal(run.results.length, 40);
  assert.equal(recorded.length, 40);
  assert.ok(run.results.every(result => result.gates['0.6']?.reason === 'none'));
});

test('tuning evaluates four configs only on tuning cases and picks threshold without held-out calls', async () => {
  const c = corpus();
  const { manifest, approval } = frozen(c);
  const calls: string[] = [];
  const run = await runTuning(c, manifest, approval, fakeJudge(calls), new AbortController().signal);
  assert.equal(calls.length, 40);
  assert.ok(calls.every(id => Number(id.slice(5)) < 10));
  assert.equal(run.comparison.length, 16);
  assert.equal(run.selection?.configuration, 'A');
  assert.equal(run.selection?.threshold, 0.6);
  assert.equal(run.results[0]?.gates['0.6']?.reason, 'accepted');
});

test('held-out denominators retain failures and count false-pass assertions even after action gating', async () => {
  const c = corpus();
  const { manifest, approval } = frozen(c);
  const tuned = await runTuning(c, manifest, approval, fakeJudge([]), new AbortController().signal);
  assert.ok(tuned.selection);
  const calls: string[] = [];
  const heldout = await runHeldout(c, manifest, approval, tuned.selection,
    tuned, fakeJudge(calls, 'case-11', 'case-10'), new AbortController().signal);
  assert.equal(calls.length, 20);
  assert.ok(calls.every(id => Number(id.slice(5)) >= 10));
  assert.equal(heldout.metrics.total, 20);
  assert.equal(heldout.metrics.requestFailures, 1);
  assert.equal(heldout.metrics.top1Correct, 19);
  assert.equal(heldout.metrics.accepted, 19);
  assert.equal(heldout.metrics.knownFailingAssertions, 1);
  assert.equal(heldout.metrics.falsePassAssertions, 1);
  assert.equal(heldout.metrics.passesExploratoryBar, false);
});

test('held-out run rejects a changed tuning selection before querying Jev', async () => {
  const c = corpus();
  const { manifest, approval } = frozen(c);
  const tuned = await runTuning(c, manifest, approval, fakeJudge([]), new AbortController().signal);
  assert.ok(tuned.selection);
  const calls: string[] = [];
  await assert.rejects(runHeldout(c, manifest, approval,
    { ...tuned.selection, threshold: 0.9 }, tuned, fakeJudge(calls), new AbortController().signal), /TUNING_LOCK_MISMATCH|SELECTION_MISMATCH/);
  assert.equal(calls.length, 0);
});
