import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../src/device/index.js';
import type { AssertionApproval, AssertionManifest, ScriptedCorpus, ScriptedJudge } from '../spikes/scripted/contracts.js';
import { ScriptedJevError } from '../spikes/scripted/jev.js';
import { digest, evaluateCase, evaluateCorpus, makeDraftManifest, preflightCorpus, renderLabelReview, validateCorpus,
  validateFrozenExperiment, verifyCorpusAssets } from '../spikes/scripted/harness.js';

const sha = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

async function fixture(root: string): Promise<{ corpus: ScriptedCorpus; corpusPath: string }> {
  await mkdir(join(root, 'raw'));
  const cases: ScriptedCorpus['cases'] = [];
  for (let index = 0; index < 24; index++) {
    const id = `case${String(index + 1).padStart(2, '0')}`;
    const fullPath = `raw/${id}.full.json`, screenshotPath = `raw/${id}.jpg`;
    const raw = { schema: 'mobilebuildmcp.output.capture-result', schemaVersion: '2', didError: false,
      data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: 'sim' }, capture: {
        type: 'runtime-snapshot', protocol: 'rs/1', simulatorId: 'sim',
        seq: index + 1, screenHash: `hash-${index}`, capturedAtMs: 1_700_000_000_000 + index,
        expiresAtMs: 1_700_000_060_000 + index, count: 1,
        elements: [{ ref: 'e1', role: 'text', label: `Case ${index + 1} Ready`,
          frame: { x: 1, y: 2, width: 100, height: 30 }, state: { enabled: true, visible: true }, actions: [] }],
      } } };
    const full = `${JSON.stringify(raw, null, 2)}\n`;
    const screenshot = Buffer.from([0xff, 0xd8, index, 0xff, 0xd9]);
    await writeFile(join(root, fullPath), full);
    await writeFile(join(root, screenshotPath), screenshot);
    const trueClaim = { id: (index % 4 < 2 ? 'a' : 'b') as 'a' | 'b',
      claim: `Case ${index + 1} shows Ready`, expected: true, rationale: 'Ready is visible' };
    const falseClaim = { id: (index % 4 < 2 ? 'b' : 'a') as 'a' | 'b',
      claim: `Case ${index + 1} shows Broken`, expected: false, rationale: 'Broken is absent' };
    cases.push({ id, workflowGroup: `group${Math.floor(index / 3) + 1}`,
      app: { bundleId: `dev.example.App${index % 3}` }, setupSteps: ['Open synthetic screen'],
      snapshot: { ...parseSnapshot(raw.data, 'sim'), screenshotPath },
      claims: index < 12 ? [trueClaim, falseClaim] : [falseClaim, trueClaim],
      assets: { fullPath, screenshotPath, sha256: { full: sha(full), screenshot: sha(screenshot) } } });
  }
  const corpus: ScriptedCorpus = { version: 1, cases };
  const corpusPath = join(root, 'corpus.json');
  await writeFile(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
  return { corpus, corpusPath };
}

function frozen(corpus: ScriptedCorpus): { manifest: AssertionManifest; approval: AssertionApproval } {
  const manifest = { ...makeDraftManifest(corpus), status: 'frozen' as const };
  return { manifest, approval: { version: 1, approved: true, reviewedBy: 'fixture owner',
    reviewedAt: '2026-09-24T00:00:00.000Z', corpusSha256: digest(corpus), manifestSha256: digest(manifest) } };
}

test('24-screen corpus binds paired neutral claims, balanced ordering, raw captures, screenshots and source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-corpus-'));
  try {
    const { corpus, corpusPath } = await fixture(root);
    validateCorpus(corpus);
    preflightCorpus(corpus);
    await verifyCorpusAssets(corpus, corpusPath);
    const { manifest, approval } = frozen(corpus);
    assert.equal(manifest.maxStateBytes, 24_000);
    assert.equal(manifest.questionTemplate.includes('visible evidence'), true);
    assert.equal(validateFrozenExperiment(corpus, manifest, approval).cases.length, 24);
    assert.match(renderLabelReview(corpus, manifest), /Case 1 shows Ready/);
    assert.throws(() => validateFrozenExperiment(corpus, { ...manifest, noulYes: 0.8 as 0.9 }, approval));
    assert.throws(() => validateFrozenExperiment(corpus, manifest, { ...approval, manifestSha256: '0'.repeat(64) }));

    const changed = structuredClone(corpus);
    changed.cases[0]!.claims[0]!.rationale = 'edited after approval';
    assert.throws(() => validateFrozenExperiment(changed, manifest, approval));
    const wrongOrder = structuredClone(corpus);
    wrongOrder.cases[12]!.claims.reverse();
    assert.throws(() => validateCorpus(wrongOrder));
    const truthCuedId = structuredClone(corpus);
    for (const item of truthCuedId.cases) {
      item.claims.find(claim => claim.expected)!.id = 'a';
      item.claims.find(claim => !claim.expected)!.id = 'b';
    }
    assert.throws(() => validateCorpus(truthCuedId));
    const duplicateShot = structuredClone(corpus);
    duplicateShot.cases[1]!.assets.sha256.screenshot = duplicateShot.cases[0]!.assets.sha256.screenshot;
    assert.throws(() => validateCorpus(duplicateShot));
    const duplicateScreen = structuredClone(corpus);
    duplicateScreen.cases[1]!.snapshot.screenHash = duplicateScreen.cases[0]!.snapshot.screenHash!;
    assert.throws(() => validateCorpus(duplicateScreen));
    const falsified = structuredClone(corpus);
    falsified.cases[0]!.snapshot.elements[0]!.label = 'Falsified normalized screen';
    await assert.rejects(verifyCorpusAssets(falsified, corpusPath));
    await writeFile(join(root, corpus.cases[0]!.assets.screenshotPath), 'tampered');
    await assert.rejects(verifyCorpusAssets(corpus, corpusPath));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an oversized frozen screen becomes one counted observation failure without a Jev request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-budget-'));
  try {
    const { corpus } = await fixture(root);
    const item = structuredClone(corpus.cases[0]!);
    item.snapshot.elements[0]!.label = 'x'.repeat(25_000);
    let calls = 0;
    const result = await evaluateCase(item, { async judge() { calls++; throw new Error('should not call'); } },
      new AbortController().signal);
    assert.equal(calls, 0);
    assert.equal(result.requested, false);
    assert.equal(result.failureKind, 'observation');
    assert.equal(result.error, 'STATE_BUDGET');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('prepare and review CLI stages write only draft and unapproved files without a key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-cli-'));
  try {
    const { corpus, corpusPath } = await fixture(root);
    const cli = fileURLToPath(new URL('../spikes/scripted/cli.ts', import.meta.url));
    const env = { ...process.env };
    delete env.TYPESAFE_API_KEY;
    const prepareOut = join(root, 'prepare');
    const prepared = spawnSync(process.execPath, ['--import', 'tsx', cli, 'prepare',
      '--corpus', corpusPath, '--out', prepareOut], { encoding: 'utf8', env });
    assert.equal(prepared.status, 0, prepared.stderr);
    const draft = JSON.parse(await readFile(join(prepareOut, 'manifest.draft.json'), 'utf8')) as AssertionManifest;
    assert.equal(draft.status, 'draft');
    const frozenPath = join(root, 'manifest.frozen.json');
    await writeFile(frozenPath, `${JSON.stringify({ ...draft, status: 'frozen' })}\n`);
    const reviewOut = join(root, 'review');
    const reviewed = spawnSync(process.execPath, ['--import', 'tsx', cli, 'review', '--corpus', corpusPath,
      '--manifest', frozenPath, '--out', reviewOut], { encoding: 'utf8', env });
    assert.equal(reviewed.status, 0, reviewed.stderr);
    const approval = JSON.parse(await readFile(join(reviewOut, 'approval.template.json'), 'utf8')) as { approved: boolean };
    assert.equal(approval.approved, false);
    assert.equal(corpus.cases.length, 24);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('one Noul-only judgment per screen yields paired metrics without sending labels or rationales', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-eval-'));
  try {
    const { corpus } = await fixture(root);
    const { manifest, approval } = frozen(corpus);
    let calls = 0;
    const journal: string[] = [];
    const judge: ScriptedJudge = { async judge(assertions, state) {
      const item = corpus.cases[calls++]!;
      assert.deepEqual(assertions, item.claims.map(({ id, claim }) => ({ id, claim })));
      assert.ok(!JSON.stringify(assertions).includes('rationale'));
      assert.ok(!state.includes('oracle') && !state.includes('Broken is absent'));
      const decisive = calls <= 20;
      return { probabilities: Object.fromEntries(item.claims.map(claim => [claim.id,
        decisive ? (claim.expected ? 0.97 : 0.02) : 0.5])),
        inputTokens: 10, latencyMs: 2, model: 'jev-1.13.0' };
    } };
    const run = await evaluateCorpus(corpus, manifest, approval, judge, new AbortController().signal,
      async result => { journal.push(result.caseId); });
    assert.equal(calls, 24);
    assert.equal(journal.length, 24);
    assert.equal(run.metrics.trueConfidentCorrect, 20);
    assert.equal(run.metrics.falseConfidentCorrect, 20);
    assert.equal(run.metrics.pairedDecisive, 20);
    assert.equal(run.metrics.uncertainClaims, 8);
    assert.equal(run.metrics.falsePasses, 0);
    assert.equal(run.metrics.wrongDecisiveFailures, 0);
    assert.equal(Object.keys(run.metrics.workflows).length, 8);
    assert.equal(run.metrics.passesExploratoryBar, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('wrong decisive answers and request failures stay in the fixed 24-screen denominator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-errors-'));
  try {
    const { corpus } = await fixture(root);
    const { manifest, approval } = frozen(corpus);
    let calls = 0;
    const judge: ScriptedJudge = { async judge() {
      calls++;
      if (calls === 1) throw new ScriptedJevError('TIMEOUT');
      const item = corpus.cases[calls - 1]!;
      return { probabilities: Object.fromEntries(item.claims.map(claim => [claim.id,
        calls === 2 ? (claim.expected ? 0.01 : 0.99) : claim.expected ? 0.99 : 0.01])),
        inputTokens: 10, latencyMs: 2, model: 'jev-1.13.0' };
    } };
    const run = await evaluateCorpus(corpus, manifest, approval, judge, new AbortController().signal);
    assert.equal(run.results.length, 24);
    assert.equal(run.metrics.requestedScreens, 24);
    assert.equal(run.metrics.requestFailures, 1);
    assert.equal(run.metrics.trueConfidentCorrect, 22);
    assert.equal(run.metrics.falseConfidentCorrect, 22);
    assert.equal(run.metrics.falsePasses, 1);
    assert.equal(run.metrics.wrongDecisiveFailures, 1);
    assert.equal(run.metrics.passesExploratoryBar, false);
    assert.equal((await readFile(join(root, 'corpus.json'), 'utf8')).includes('rationale'), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
