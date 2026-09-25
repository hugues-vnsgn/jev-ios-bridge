#!/usr/bin/env node
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AssertionApproval, AssertionManifest, ScriptedCorpus } from './contracts.js';
import { createAssertionJudge } from './jev.js';
import { digest, evaluateCorpus, implementationDigest, makeDraftManifest, renderLabelReview,
  preflightCorpus, ScriptedExperimentError, validateFrozenExperiment, validateFrozenManifest, verifyCorpusAssets,
  type AssertionCaseResult, type AssertionMetrics } from './harness.js';

function parseArgs(): { command: 'prepare' | 'review' | 'evaluate'; flags: Record<string, string> } {
  const [, , command, ...rest] = process.argv;
  if (command !== 'prepare' && command !== 'review' && command !== 'evaluate') {
    throw new ScriptedExperimentError('COMMAND_REQUIRED');
  }
  if (rest.length % 2 !== 0) throw new ScriptedExperimentError('INVALID_ARGUMENTS');
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i]!, value = rest[i + 1]!;
    if (!name.startsWith('--') || !value || value.startsWith('--') || Object.hasOwn(flags, name.slice(2))) {
      throw new ScriptedExperimentError('INVALID_ARGUMENTS');
    }
    flags[name.slice(2)] = value;
  }
  const allowed = command === 'prepare' ? ['corpus', 'out'] : command === 'review'
    ? ['corpus', 'manifest', 'out'] : ['corpus', 'manifest', 'approval', 'out', 'live'];
  if (Object.keys(flags).some(name => !allowed.includes(name))) throw new ScriptedExperimentError('INVALID_ARGUMENTS');
  return { command, flags };
}

function required(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value) throw new ScriptedExperimentError(`MISSING_${name.toUpperCase()}`);
  return value;
}

async function json<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }
async function save(dir: string, name: string, data: unknown): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, name), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 });
}

function resultsMarkdown(results: AssertionCaseResult[], metrics: AssertionMetrics): string {
  return [
    '# Scripted assertion feasibility result', '',
    `Confident correct true claims: ${metrics.trueConfidentCorrect}/24 (requires 20).`,
    `Confident correct false claims: ${metrics.falseConfidentCorrect}/24 (requires 20).`,
    `False passes: ${metrics.falsePasses} (requires 0). Wrong decisive failures: ${metrics.wrongDecisiveFailures} (requires 0).`,
    `Paired-screen decisive coverage: ${metrics.pairedDecisive}/24. Uncertain claim answers: ${metrics.uncertainClaims}/48.`,
    `Requested screens: ${metrics.requestedScreens}/24. Observation failures: ${metrics.observationFailures}; request failures: ${metrics.requestFailures}; response failures: ${metrics.responseFailures}; unknown failures: ${metrics.unknownFailures}.`,
    `Input tokens: ${metrics.inputTokens}; accumulated Jev latency: ${metrics.latencyMs.toFixed(0)} ms.`,
    `Exploratory ticket 21 bar: ${metrics.passesExploratoryBar ? 'met' : 'not met'}. Owner architecture review remains required.`, '',
    '| Workflow | Screens | True correct | False correct | Paired decisive | False passes | Wrong decisive failures | Failures |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(metrics.workflows).sort(([a], [b]) => a.localeCompare(b)).map(([name, row]) =>
      `| ${name} | ${row.screens} | ${row.trueConfidentCorrect} | ${row.falseConfidentCorrect} | ${row.pairedDecisive} | ${row.falsePasses} | ${row.wrongDecisiveFailures} | ${row.failures} |`),
    '', '| Case | True probability | False probability | Paired decisive | Error |',
    '| --- | ---: | ---: | --- | --- |',
    ...results.map(row => `| ${row.caseId} | ${row.trueProbability?.toFixed(3) ?? '—'} | ${row.falseProbability?.toFixed(3) ?? '—'} | ${row.pairedDecisive ? 'yes' : 'no'} | ${row.error ?? '—'} |`), '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs();
  const corpusPath = resolve(required(flags, 'corpus'));
  const corpus = await json<ScriptedCorpus>(corpusPath);
  await verifyCorpusAssets(corpus, corpusPath);
  const out = resolve(required(flags, 'out'));
  if (command === 'prepare') {
    preflightCorpus(corpus);
    const manifest = makeDraftManifest(corpus);
    await save(out, 'manifest.draft.json', manifest);
    await save(out, 'label-review.md', renderLabelReview(corpus, manifest));
    process.stdout.write('Draft manifest and label review written. No Jev request made.\n');
    return;
  }
  const manifest = await json<AssertionManifest>(required(flags, 'manifest'));
  if (command === 'review') {
    preflightCorpus(corpus);
    validateFrozenManifest(corpus, manifest);
    await save(out, 'label-review.md', renderLabelReview(corpus, manifest));
    await save(out, 'approval.template.json', {
      version: 1, approved: false, reviewedBy: '', reviewedAt: '',
      corpusSha256: digest(corpus), manifestSha256: digest(manifest),
    });
    process.stdout.write('Review sheet and unapproved template written. No Jev request made.\n');
    return;
  }
  const approval = await json<AssertionApproval>(required(flags, 'approval'));
  validateFrozenExperiment(corpus, manifest, approval);
  if (flags.live !== 'true') throw new ScriptedExperimentError('LIVE_FLAG_REQUIRED');
  const judge = createAssertionJudge();
  for (const name of ['results.json', 'results.md', 'evaluate.partial.jsonl']) {
    try { await access(join(out, name)); throw new ScriptedExperimentError('OUTPUT_ALREADY_EXISTS'); }
    catch (error) { if (error instanceof ScriptedExperimentError) throw error; }
  }
  await mkdir(out, { recursive: true, mode: 0o700 });
  const claimPath = join(dirname(corpusPath), `.scripted-evaluate-${digest(corpus)}.claim`);
  try {
    await writeFile(claimPath, `${JSON.stringify({ corpusSha256: digest(corpus), manifestSha256: digest(manifest),
      implementationSha256: implementationDigest(), out, startedAt: new Date().toISOString() })}\n`,
    { flag: 'wx', mode: 0o600 });
  } catch { throw new ScriptedExperimentError('RUN_ALREADY_CLAIMED'); }
  const partial = await open(join(out, 'evaluate.partial.jsonl'), 'wx', 0o600);
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  try {
    const run = await evaluateCorpus(corpus, manifest, approval, judge, abort.signal, async result => {
      await partial.appendFile(`${JSON.stringify(result)}\n`);
      await partial.sync();
    });
    await save(out, 'results.json', run);
    await save(out, 'results.md', resultsMarkdown(run.results, run.metrics));
    process.stdout.write('Assertion results written. Owner go/no-go review remains required.\n');
  } finally { await partial.close(); }
}

main().catch(error => {
  process.stderr.write(`Scripted feasibility: ${error instanceof ScriptedExperimentError ? error.code : 'UNEXPECTED_FAILURE'}\n`);
  process.exitCode = 1;
});
