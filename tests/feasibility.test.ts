import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Snapshot } from '../src/contracts/index.js';
import type { JevJudge, Scenario } from '../spikes/legacy/contracts.js';
import { JevRequestError } from '../spikes/legacy/jev.js';
import {
  digest, makeDraftManifest, runHeldout, runTuning, validateCorpus, validateFrozenExperiment,
  verifyCorpusAssets,
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
      ...(index === 0 ? { positionalVariant: { goal: 'Tap the second row', acceptableActionIds: ['tap:e1'] } } : {}),
      labels: { acceptableActionIds: ['tap:e1'], goalReached: false, assertions: { expected: index !== 10 } } };
  }) };
}
function frozen(c: FeasibilityCorpus): { manifest: ExperimentManifest; approval: OwnerApproval } {
  const manifest = { ...makeDraftManifest(c), status: 'frozen' as const };
  const approval: OwnerApproval = { version: c.version, approved: true, reviewedBy: 'Synthetic test owner',
    reviewedAt: '2026-09-24', corpusSha256: digest(c), manifestSha256: digest(manifest) };
  return { manifest, approval };
}
function fakeJudge(calls: string[], failCase?: string, falsePassCase?: string): JevJudge {
  return { async judge(_scenario, observation) {
    const id = /Goal: (case-\d+)/.exec(observation.text)?.[1] ??
      (observation.text.includes('Goal: Tap the second row') ? 'positional:case-0' : 'unknown');
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
  assert.equal(recorded.length, 44);
  assert.ok(run.results.every(result => result.gates['0.6']?.reason === 'none'));
});

test('tuning evaluates four configs only on tuning cases and picks threshold without held-out calls', async () => {
  const c = corpus();
  const { manifest, approval } = frozen(c);
  const calls: string[] = [];
  const run = await runTuning(c, manifest, approval, fakeJudge(calls), new AbortController().signal);
  assert.equal(calls.length, 44);
  const primaryCalls = calls.filter(id => id.startsWith('case-'));
  const positionalCalls = calls.filter(id => id.startsWith('positional:'));
  assert.equal(primaryCalls.length, 40);
  assert.ok(primaryCalls.every(id => Number(id.slice(5)) < 10));
  assert.deepEqual(positionalCalls, Array(4).fill('positional:case-0'));
  assert.equal(run.comparison.length, 16);
  assert.equal(run.results.length, 40);
  assert.equal(run.positionalResults.length, 4);
  assert.equal(run.selection?.configuration, 'A');
  assert.equal(run.selection?.threshold, 0.6);
  assert.equal(run.results[0]?.gates['0.6']?.reason, 'accepted');
});

test('a manifest-permitted 25KB state can be gated after evaluation', async () => {
  const c = corpus();
  c.cases[0]!.fullSnapshot.elements[0]!.label = 'X'.repeat(25_000);
  const { manifest, approval } = frozen(c);
  manifest.maxStateBytes = 28_000;
  approval.manifestSha256 = digest(manifest);
  const run = await runTuning(c, manifest, approval, fakeJudge([]), new AbortController().signal);
  assert.equal(run.results.length, 40);
  assert.equal(run.results.find(result => result.caseId === 'case-0' && result.configuration === 'C')?.gates['0.6']?.reason, 'accepted');
});

test('asset preflight binds raw JSON and screenshot bytes under corpus root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-assets-'));
  try {
    const c = corpus();
    const files = { compact: 'compact.json', full: 'full.json', screenshot: 'screen.jpg' };
    const bytes = { compact: '{}', full: '{}', screenshot: 'synthetic-image' };
    await Promise.all(Object.entries(files).map(async ([key, name]) => writeFile(join(root, name), bytes[key as keyof typeof bytes])));
    const sha256 = Object.fromEntries(Object.entries(bytes).map(([key, value]) => [key, createHash('sha256').update(value).digest('hex')])) as { compact: string; full: string; screenshot: string };
    for (const item of c.cases) item.assets = { compactPath: files.compact, fullPath: files.full, screenshotPath: files.screenshot, sha256 };
    await verifyCorpusAssets(c, join(root, 'corpus.json'));
    await writeFile(join(root, files.full), 'changed');
    await assert.rejects(verifyCorpusAssets(c, join(root, 'corpus.json')), /CAPTURE_HASH_MISMATCH/);
  } finally { await rm(root, { recursive: true, force: true }); }
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

test('v2 corpus preserves compact aliases and requires the full canonical accepted ID', () => {
  const c = corpus();
  c.version = 2;
  const elements: Snapshot['elements'] = [
    { ref: 'e1', role: 'button', label: 'Continue', identifier: 'continue', frame: { x: 0, y: 0, width: 200, height: 50 }, actions: ['tap'] },
    { ref: 'e2', role: 'button', label: 'Continue', identifier: 'continue', frame: { x: 10, y: 10, width: 80, height: 20 }, actions: ['tap'] },
  ];
  c.cases[0]!.fullSnapshot = { ...c.cases[0]!.fullSnapshot, elements };
  c.cases[0]!.compactSnapshot = { ...c.cases[0]!.compactSnapshot, elements };
  c.cases[0]!.labels.acceptableActionIds = ['tap:e1', 'tap:e2'];
  c.cases[0]!.positionalVariant!.acceptableActionIds = ['tap:e1', 'tap:e2'];
  validateCorpus(c);
  const draft = makeDraftManifest(c);
  assert.equal(draft.version, 2);
  assert.equal(draft.optionRule, 'complete-actions-v2');
  assert.match(draft.wording.nextAction, /blocking setup or permission prompt/i);
  c.cases[0]!.labels.acceptableActionIds = ['tap:e2'];
  assert.throws(() => validateCorpus(c), /CANONICAL_LABEL_REQUIRED/);
});

test('v2 tuning scores canonical full option and raw compact alias under one approved set', async () => {
  const c = corpus();
  c.version = 2;
  const elements: Snapshot['elements'] = [
    { ref: 'e1', role: 'button', label: 'Continue', identifier: 'continue', frame: { x: 0, y: 0, width: 200, height: 50 }, actions: ['tap'] },
    { ref: 'e2', role: 'button', label: 'Continue', identifier: 'continue', frame: { x: 10, y: 10, width: 80, height: 20 }, actions: ['tap'] },
  ];
  c.cases[0]!.fullSnapshot = { ...c.cases[0]!.fullSnapshot, elements };
  c.cases[0]!.compactSnapshot = { ...c.cases[0]!.compactSnapshot, elements };
  c.cases[0]!.labels.acceptableActionIds = ['tap:e1', 'tap:e2'];
  c.cases[0]!.positionalVariant!.acceptableActionIds = ['tap:e1', 'tap:e2'];
  const { manifest, approval } = frozen(c);
  const run = await runTuning(c, manifest, approval, fakeJudge([]), new AbortController().signal);
  assert.equal(run.selection?.version, 2);
  const compact = run.results.find(result => result.caseId === 'case-0' && result.configuration === 'A')!;
  const full = run.results.find(result => result.caseId === 'case-0' && result.configuration === 'C')!;
  assert.ok(Object.hasOwn(compact.probabilities ?? {}, 'tap:e2'));
  assert.ok(!Object.hasOwn(full.probabilities ?? {}, 'tap:e2'));
  assert.deepEqual(full.collapsedTapRefs, { e1: ['e2'] });
  assert.equal(compact.top1Correct, true);
  assert.equal(full.top1Correct, true);
});

test('v3 freezes checkpoint wording while retaining v2 options and the original gate', async () => {
  const c = corpus();
  c.version = 3;
  const elements: Snapshot['elements'] = [
    { ref: 'e1', role: 'button', label: 'Continue', identifier: 'continue', frame: { x: 0, y: 0, width: 200, height: 50 }, actions: ['tap'] },
    { ref: 'e2', role: 'button', label: 'Continue', identifier: 'continue', frame: { x: 10, y: 10, width: 80, height: 20 }, actions: ['tap'] },
  ];
  c.cases[0]!.fullSnapshot = { ...c.cases[0]!.fullSnapshot, elements };
  c.cases[0]!.compactSnapshot = { ...c.cases[0]!.compactSnapshot, elements };
  c.cases[0]!.labels.acceptableActionIds = ['tap:e1', 'tap:e2'];
  c.cases[0]!.positionalVariant!.acceptableActionIds = ['tap:e1', 'tap:e2'];
  const { manifest, approval } = frozen(c);
  assert.equal(manifest.version, 3);
  assert.equal(manifest.candidateRule, 'visible-enabled-v2');
  assert.equal(manifest.optionRule, 'complete-actions-v2');
  assert.deepEqual(manifest.thresholds, [0.6, 0.7, 0.8, 0.9]);
  assert.equal(manifest.noulYes, 0.9);
  assert.equal(manifest.noulNo, 0.1);
  assert.equal(manifest.gateRule, 'ticket-07-v1');
  assert.match(manifest.wording.nextAction, /current checkpoint.*desired screen state/i);
  validateFrozenExperiment(c, manifest, approval);
  const run = await runTuning(c, manifest, approval, fakeJudge([]), new AbortController().signal);
  assert.equal(run.selection?.version, 3);
  assert.equal(run.comparison.length, 16);
  assert.equal(run.results.length, 40);
  const compact = run.results.find(result => result.caseId === 'case-0' && result.configuration === 'A')!;
  const full = run.results.find(result => result.caseId === 'case-0' && result.configuration === 'C')!;
  assert.ok(Object.hasOwn(compact.probabilities ?? {}, 'tap:e2'));
  assert.ok(!Object.hasOwn(full.probabilities ?? {}, 'tap:e2'));
});
