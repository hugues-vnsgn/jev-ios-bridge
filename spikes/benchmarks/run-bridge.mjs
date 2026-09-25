#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const usage = 'Usage: node spikes/benchmarks/run-bridge.mjs <script.json> [--bridge-cli /absolute/dist/cli.js] [--execute]';
const scenarioPath = process.argv[2] && !process.argv[2].startsWith('--') ? resolve(process.argv[2]) : null;
let execute = false;
let cliArgument;
for (let index = 3; index < process.argv.length; index++) {
  const argument = process.argv[index];
  if (argument === '--execute' && !execute) execute = true;
  else if (argument === '--bridge-cli' && !cliArgument && process.argv[index + 1]) {
    cliArgument = process.argv[++index];
  } else throw new Error(usage);
}
if (!scenarioPath || (execute && !(cliArgument || process.env.JEV_BENCH_BRIDGE_CLI))) throw new Error(usage);
const root = dirname(fileURLToPath(import.meta.url));
const bridgeCli = resolve(cliArgument ?? process.env.JEV_BENCH_BRIDGE_CLI ?? resolve(root, '../../dist/cli.js'));
const privateEnv = '/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.env';
const scenarioParser = join(dirname(bridgeCli), 'scripted/schema.js');
const sourceSkill = resolve(dirname(bridgeCli), '../skills/test-ios/SKILL.md');
if (![scenarioPath, bridgeCli, scenarioParser, sourceSkill, privateEnv].every(existsSync)) {
  throw new Error('Script, selected built bridge, packaged skill, or private env path is missing');
}
const { parseScriptedScenario } = await import(pathToFileURL(scenarioParser).href);
const scenario = parseScriptedScenario(JSON.parse(readFileSync(scenarioPath, 'utf8')));
const limits = { maxSteps: 100, wallTimeMs: 900_000 };
const runDir = mkdtempSync(join(tmpdir(), 'jev-bridge-benchmark-'));
const consumer = join(runDir, 'consumer');
const mcpConfig = join(consumer, '.mcp.json');
const runsDir = join(runDir, 'runs');
mkdirSync(consumer, { mode: 0o700 });
mkdirSync(runsDir, { mode: 0o700 });
const consumerSkill = join(consumer, '.claude/skills/test-ios/SKILL.md');
mkdirSync(dirname(consumerSkill), { recursive: true, mode: 0o700 });
copyFileSync(sourceSkill, consumerSkill);
writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { 'jev-ios-bridge': {
  type: 'stdio', command: process.execPath, args: [`--env-file=${privateEnv}`, bridgeCli, 'mcp'],
  env: { JEV_DEVICE_UDID: '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7',
    JEV_RUNS_DIR: runsDir, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' },
} } }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const args = [
  '-p', '--verbose', '--output-format', 'stream-json',
  '--model', 'claude-opus-4-7',
  '--mcp-config', mcpConfig, '--strict-mcp-config',
  '--no-session-persistence', '--no-chrome',
  '--tools', 'Skill',
  '--allowedTools', 'mcp__jev-ios-bridge__*',
];
const prompt = `/test-ios Verify this exact script using the registered bridge. Submit it once with start_scenario limits ${JSON.stringify(limits)}, call get_report with waitMs: 45000 until the run finishes, then report the verdict and evidence. Script JSON: ${JSON.stringify(scenario)}`;
if (!execute) {
  process.stdout.write(JSON.stringify({ execute: false, consumer, mcpConfig,
    bridgeCli, scenarioParser, sourceSkill, privateEnvPathPresent: true, runsDir,
    scenarioPath, requestedModel: 'claude-opus-4-7', limits,
    note: 'Dry run only; --execute requires an explicit installed or built CLI path.' }, null, 2) + '\n');
  process.exit(0);
}
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
const runIds = readdirSync(runsDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(entry.name))
  .map(entry => entry.name);
let bridgeRun = null;
if (runIds.length === 1) {
  const runId = runIds[0];
  const runLogPath = join(runsDir, runId, 'run.jsonl');
  const { readRunEvents } = await import(pathToFileURL(join(dirname(bridgeCli), 'log/index.js')).href);
  const events = await readRunEvents(runsDir, runId);
  const final = events.findLast(event => event.type === 'verdict')?.data ?? {};
  const numbers = (value, keys) => Object.fromEntries(keys.map(key => [key,
    typeof value?.[key] === 'number' && Number.isFinite(value[key]) ? value[key] : null]));
  bridgeRun = { runId, runLogPath,
    verdict: ['passed', 'failed', 'inconclusive'].includes(final.verdict) ? final.verdict : null,
    reason: typeof final.reason === 'string' && /^[A-Z0-9_]+$/.test(final.reason) ? final.reason : null,
    ...numbers(final, ['steps', 'inputTokens', 'durationMs', 'checkpointsPassed', 'checkpointCount']),
    recordedEvents: events.length,
    actionEvents: events.filter(event => event.type === 'action').length,
    observationEvents: events.filter(event => event.type === 'step').length,
    jevJudgmentEvents: events.filter(event => event.type === 'judgment').length,
    phaseTimingsMs: numbers(final.phaseTimingsMs,
      ['prepareMs', 'observeMs', 'decideMs', 'actMs', 'waitMs', 'cleanupMs']),
    deviceMetrics: numbers(final.deviceMetrics,
      ['referenceRefreshes', 'referenceExpiries', 'nearTtlRefreshes']),
  };
}
const resultsDir = join(root, 'results');
mkdirSync(resultsDir, { recursive: true, mode: 0o700 });
const summaryPath = join(resultsDir, `${basename(scenarioPath, '.json')}-bridge-${Date.now()}.json`);
writeFileSync(summaryPath, JSON.stringify({ ...measured, startedAt, wallClockSeconds,
  wallClockSource: 'External monotonic process time around the Claude host invocation',
  claudeReportedDurationSeconds: measured.wallClockSeconds,
  claudeReportedDurationSource: measured.wallClockSource,
  exitCode, rawTranscriptPath: stdoutPath, stderrPresent: stderrBytes > 0, scenarioPath,
  bridgeCli, sourceSkill, limits, bridgeRunCount: runIds.length, bridgeRun,
  timingScope: 'Claude host and prepared-app bridge UI run; excludes app build and install',
  comparisonStatus: runIds.length === 1 ? 'Pending manual review of task equivalence and saved UI outcome'
    : 'No comparable single bridge run recorded' }, null, 2) + '\n',
{ flag: 'wx', mode: 0o600 });
process.stdout.write(`Numeric summary: ${summaryPath}\n`);
