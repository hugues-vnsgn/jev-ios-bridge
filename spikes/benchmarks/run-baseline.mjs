#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const suite = process.argv[2];
const execute = process.argv[3] === '--execute';
if (!['weather', 'reminders', 'contacts'].includes(suite) || process.argv.length > (execute ? 4 : 3)) {
  throw new Error('Usage: node spikes/benchmarks/run-baseline.mjs <weather|reminders|contacts> [--execute]');
}

const source = '/tmp/jev-mobilebuildmcp-benchmark-v2.7.1';
const sourceCommit = 'd13ff0c707b0681769cf31da0eb42c4f94ceafff';
const command = ['npm', 'run', 'bench:claude-ui', '--', '--suite', suite, '--model', 'claude-opus-4-7'];
if (!execute) {
  process.stdout.write(JSON.stringify({ execute: false, source, sourceCommit, command,
    note: 'Add --execute only after the owner-reviewed feasibility and slice gate.' }, null, 2) + '\n');
  process.exit(0);
}
if (!existsSync(join(source, 'node_modules'))) throw new Error('Pinned upstream dependencies missing; run npm ci in the source clone');
const actualCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
if (actualCommit !== sourceCommit) throw new Error('Upstream source commit differs from pinned v2.7.1');

const startedAt = Date.now();
const baselineEnv = { ...process.env, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' };
delete baselineEnv.TYPESAFE_API_KEY;
const child = spawnSync(command[0], command.slice(1), {
  cwd: source,
  env: baselineEnv,
  stdio: 'inherit',
  timeout: 20 * 60_000,
});
if (child.error) throw child.error;
if (child.status !== 0) throw new Error(`Official ${suite} benchmark exited ${child.status}`);

const suiteOut = join(source, 'out.nosync', 'claude-benchmarks', suite);
const resultPaths = readdirSync(suiteOut, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(suiteOut, entry.name, 'result.json'))
  .filter(path => existsSync(path) && statSync(path).mtimeMs >= startedAt - 2_000)
  .sort();
const resultPath = resultPaths.at(-1);
if (!resultPath) throw new Error('Official benchmark did not produce result.json');
const measured = JSON.parse(execFileSync('node', [
  join(dirname(fileURLToPath(import.meta.url)), 'extract-claude-usage.mjs'), resultPath,
], { encoding: 'utf8' }));
const resultsDir = join(dirname(fileURLToPath(import.meta.url)), 'results');
mkdirSync(resultsDir, { recursive: true, mode: 0o700 });
const outputPath = join(resultsDir, `${suite}-baseline-${startedAt}.json`);
writeFileSync(outputPath, JSON.stringify({ ...measured, invokedAt: new Date(startedAt).toISOString(),
  sourceCommit, rawResultPath: resultPath }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
process.stdout.write(`Numeric summary: ${outputPath}\n`);
