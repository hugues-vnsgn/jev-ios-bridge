#!/usr/bin/env node
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createJevJudge } from '../legacy/jev.js';
import {
  ExperimentError, digest, implementationDigest, makeDraftManifest, renderLabelReview, runHeldout, runTuning,
  validateFrozenExperiment, validateFrozenSelection, verifyCorpusAssets, type ExperimentManifest, type FeasibilityCorpus,
  type FrozenSelection, type OwnerApproval, type TuningRun,
} from './harness.js';

function parseArgs(): { command: string; flags: Record<string, string> } {
  const [, , command, ...rest] = process.argv;
  if (!command || !['prepare', 'review', 'tune', 'heldout'].includes(command)) throw new ExperimentError('COMMAND_REQUIRED');
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i], value = rest[i + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new ExperimentError('INVALID_ARGUMENTS');
    flags[name.slice(2)] = value;
  }
  return { command, flags };
}
function required(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value) throw new ExperimentError(`MISSING_${name.toUpperCase()}`);
  return value;
}
async function json<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }
async function save(dir: string, name: string, data: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
function tuningReport(run: Awaited<ReturnType<typeof runTuning>>): string {
  return [
    '# Jev feasibility tuning', '',
    run.selection ? `Selected ${run.selection.configuration} at Choice confidence ${run.selection.threshold}.` :
      'No configuration qualified: none had positive accepted coverage with zero wrong accepted actions.', '',
    '| Config | Threshold | Accepted / 10 | Wrong accepted | Top-1 correct / 10 | Input tokens | Qualifies |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...run.comparison.map(row => `| ${row.configuration} | ${row.threshold} | ${row.accepted} | ${row.incorrectAccepted} | ${row.top1Correct} | ${row.inputTokens} | ${row.qualifying ? 'yes' : 'no'} |`),
    '', 'Positional phrasing on the same tuning captures (excluded from threshold selection):', '',
    '| Config | Acceptable top-1 / paired variants |', '| --- | ---: |',
    ...['A', 'B', 'C', 'D'].map(id => {
      const rows = run.positionalResults.filter(row => row.configuration === id);
      return `| ${id} | ${rows.filter(row => row.top1Correct).length}/${rows.length} |`;
    }), '',
    'Held-out cases were not evaluated. See tuning.json for per-case answers and failures.', '',
  ].join('\n');
}
function heldoutReport(run: Awaited<ReturnType<typeof runHeldout>>): string {
  const m = run.metrics;
  return [
    '# Jev feasibility held-out result', '',
    `Frozen configuration: ${run.selection.configuration}; Choice threshold: ${run.selection.threshold}.`, '',
    `Top-1 acceptable: ${m.top1Correct}/20 (requires 18).`,
    `Accepted: ${m.accepted}/20 (requires 16); wrong accepted: ${m.incorrectAccepted} (requires 0).`,
    `Known failing assertions: ${m.knownFailingAssertions}; false passes: ${m.falsePassAssertions} (requires 0).`,
    `Completion labels matched at the frozen Noul bounds: ${m.completionLabelCorrect}/20; assertion labels matched: ${m.assertionLabelMatches}/${m.assertionLabelsTotal}.`,
    `Request failures: ${m.requestFailures}; observation failures: ${m.observationFailures}; response failures: ${m.responseFailures}. Coverage: ${(m.coverage * 100).toFixed(1)}%; accepted accuracy: ${(m.acceptedAccuracy * 100).toFixed(1)}%.`,
    `Input tokens: ${m.inputTokens}; accumulated Jev latency: ${m.latencyMs.toFixed(0)} ms.`, '',
    `Exploratory ticket 07 bar: ${m.passesExploratoryBar ? 'met' : 'not met'}. The owner makes the architecture go/no-go decision.`, '',
    '| Case | Choice | Confidence | Top-1 correct | Gate | False passes | Error |',
    '| --- | --- | ---: | --- | --- | ---: | --- |',
    ...run.results.map(row => `| ${row.caseId} | ${row.choice ?? '—'} | ${row.confidence?.toFixed(3) ?? '—'} | ${row.top1Correct ? 'yes' : 'no'} | ${row.gate.reason} | ${row.falsePassAssertions} | ${row.error ?? '—'} |`), '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs();
  const corpusPath = required(flags, 'corpus');
  const corpus = await json<FeasibilityCorpus>(corpusPath);
  await verifyCorpusAssets(corpus, corpusPath);
  const out = required(flags, 'out');
  if (command === 'prepare') {
    const draft = makeDraftManifest(corpus);
    await save(out, 'manifest.draft.json', draft);
    await save(out, 'label-review.md', renderLabelReview(corpus, draft));
    process.stdout.write('Draft manifest and label review written. No Jev request made.\n');
    return;
  }
  const manifest = await json<ExperimentManifest>(required(flags, 'manifest'));
  if (command === 'review') {
    if (manifest.status !== 'frozen' || manifest.corpusSha256 !== digest(corpus) || manifest.implementationSha256 !== implementationDigest()) throw new ExperimentError('MANIFEST_NOT_FROZEN');
    await save(out, 'label-review.md', renderLabelReview(corpus, manifest));
    await save(out, 'approval.template.json', {
      version: manifest.version, approved: false, reviewedBy: '', reviewedAt: '',
      corpusSha256: digest(corpus), manifestSha256: digest(manifest),
    });
    process.stdout.write('Review sheet and unapproved template written. No Jev request made.\n');
    return;
  }
  const approval = await json<OwnerApproval>(required(flags, 'approval'));
  validateFrozenExperiment(corpus, manifest, approval);
  if (flags.live !== 'true') throw new ExperimentError('LIVE_FLAG_REQUIRED');
  const selection = command === 'heldout' ? await json<FrozenSelection>(required(flags, 'selection')) : undefined;
  const tuning = command === 'heldout' ? await json<TuningRun>(required(flags, 'tuning')) : undefined;
  if (command === 'heldout') {
    if (!selection || !tuning) throw new ExperimentError('SELECTION_REQUIRED');
    validateFrozenSelection(corpus, manifest, approval, selection, tuning);
  }
  const expectedFiles = command === 'tune' ? ['tuning.json', 'tuning.md', 'selection.json'] : ['heldout.json', 'heldout.md'];
  for (const name of expectedFiles) {
    try { await access(join(out, name)); throw new ExperimentError('OUTPUT_ALREADY_EXISTS'); }
    catch (error) { if (error instanceof ExperimentError) throw error; }
  }
  await mkdir(out, { recursive: true });
  const partial = await open(join(out, `${command}.partial.jsonl`), 'wx', 0o600);
  const claimPath = join(dirname(corpusPath), `.feasibility-${command}-${digest(corpus)}.claim`);
  try {
    await writeFile(claimPath, `${JSON.stringify({ command, corpusSha256: digest(corpus), manifestSha256: digest(manifest), out, startedAt: new Date().toISOString() })}\n`, { flag: 'wx', mode: 0o600 });
  } catch {
    await partial.close();
    throw new ExperimentError('RUN_ALREADY_CLAIMED');
  }
  const judge = createJevJudge({ wording: manifest.wording });
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  const onCase = async (result: unknown) => { await partial.appendFile(`${JSON.stringify(result)}\n`); await partial.sync(); };
  try {
    if (command === 'tune') {
      const run = await runTuning(corpus, manifest, approval, judge, abort.signal, onCase);
      await save(out, 'tuning.json', run);
      await save(out, 'tuning.md', tuningReport(run));
      if (run.selection) await save(out, 'selection.json', run.selection);
      process.stdout.write('Tuning results written. Held-out cases were not queried.\n');
      return;
    }
    if (!selection || !tuning) throw new ExperimentError('SELECTION_REQUIRED');
    const run = await runHeldout(corpus, manifest, approval, selection, tuning, judge, abort.signal, onCase);
    await save(out, 'heldout.json', run);
    await save(out, 'heldout.md', heldoutReport(run));
    process.stdout.write('Held-out results written. Owner go/no-go review remains required.\n');
  } finally {
    await partial.close();
  }
}

main().catch(error => {
  process.stderr.write(`Feasibility harness: ${error instanceof ExperimentError ? error.code : 'UNEXPECTED_FAILURE'}\n`);
  process.exitCode = 1;
});
