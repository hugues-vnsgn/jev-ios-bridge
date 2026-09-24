#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scenarioPath = process.argv[2] ? resolve(process.argv[2]) : null;
const execute = process.argv[3] === '--execute';
if (!scenarioPath || process.argv.length > (execute ? 4 : 3)) {
  throw new Error('Usage: node spikes/benchmarks/run-bridge.mjs <scenario.json> [--execute]');
}
const root = dirname(fileURLToPath(import.meta.url));
const consumer = join(root, 'consumer');
const mcpConfig = join(consumer, '.mcp.json');
const bridgeCli = '/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.worktrees/feat/v0.1-release/dist/cli.js';
const privateEnv = '/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.env';
const scenarioParser = resolve(root, '../../dist/scenario/index.js');
if (!existsSync(scenarioParser)) throw new Error('Build the bridge before validating a benchmark scenario');
const { parseScenario } = await import(pathToFileURL(scenarioParser).href);
const scenario = parseScenario(JSON.parse(readFileSync(scenarioPath, 'utf8')));
const limits = 'checkpoints' in scenario ? { maxSteps: 60, wallTimeMs: 900_000 } : undefined;
const sourceSkill = resolve(root, '../../skills/test-ios/SKILL.md');
const consumerSkill = join(consumer, '.claude/skills/test-ios/SKILL.md');
mkdirSync(dirname(consumerSkill), { recursive: true });
copyFileSync(sourceSkill, consumerSkill);
const args = [
  '-p', '--verbose', '--output-format', 'stream-json',
  '--model', 'claude-opus-4-7',
  '--mcp-config', mcpConfig, '--strict-mcp-config',
  '--no-session-persistence', '--no-chrome',
  '--tools', 'Skill',
  '--allowedTools', 'mcp__jev-ios-bridge__*',
];
const prompt = `/test-ios Verify this exact scenario using the registered bridge. Submit it once${limits ? ` with start_scenario limits ${JSON.stringify(limits)}` : ''}, call get_report with waitMs: 45000 until the run finishes, then report the verdict and evidence. Scenario JSON: ${JSON.stringify(scenario)}`;
if (!execute) {
  process.stdout.write(JSON.stringify({ execute: false, consumer, mcpConfig,
    bridgeCliPresent: existsSync(bridgeCli), privateEnvPathPresent: existsSync(privateEnv),
    scenarioPath, requestedModel: 'claude-opus-4-7', limits: limits ?? 'bridge defaults',
    note: 'Add --execute only after the owner-reviewed feasibility and slice gate.' }, null, 2) + '\n');
  process.exit(0);
}
if (!existsSync(mcpConfig) || !existsSync(bridgeCli) || !existsSync(privateEnv)) {
  throw new Error('Benchmark consumer config, built bridge, or private env path is missing');
}

const runDir = mkdtempSync(join(tmpdir(), 'jev-bridge-benchmark-'));
const stdoutPath = join(runDir, 'claude.jsonl');
const stdout = createWriteStream(stdoutPath, { flags: 'wx', mode: 0o600 });
const hostEnv = { ...process.env };
delete hostEnv.TYPESAFE_API_KEY;
const startedAt = new Date().toISOString();
const start = process.hrtime.bigint();
const child = spawn('claude', args, { cwd: consumer, env: hostEnv, stdio: ['pipe', 'pipe', 'pipe'] });
child.stdin.end(prompt);
child.stdout.pipe(stdout);
let stderrBytes = 0;
child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
const exitCode = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('close', resolveExit);
});
await finished(stdout);
const wallClockSeconds = Number(process.hrtime.bigint() - start) / 1e9;
const { execFileSync } = await import('node:child_process');
const measured = JSON.parse(execFileSync('node', [join(root, 'extract-claude-usage.mjs'), stdoutPath], { encoding: 'utf8' }));
const resultsDir = join(root, 'results');
mkdirSync(resultsDir, { recursive: true, mode: 0o700 });
const summaryPath = join(resultsDir, `${basename(scenarioPath, '.json')}-bridge-${Date.now()}.json`);
writeFileSync(summaryPath, JSON.stringify({ ...measured, startedAt, wallClockSeconds,
  exitCode, rawTranscriptPath: stdoutPath, stderrPresent: stderrBytes > 0, scenarioPath,
  limits: limits ?? 'bridge defaults', timingScope: 'Claude host and prepared-app bridge UI run; excludes app build and install',
  comparisonStatus: 'Pending manual review of task equivalence and saved UI outcome' }, null, 2) + '\n',
{ flag: 'wx', mode: 0o600 });
process.stdout.write(`Numeric summary: ${summaryPath}\n`);
