#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outputPath = new URL('./host-availability.json', import.meta.url);
if (existsSync(outputPath)) throw new Error('One Claude availability probe is already recorded');
const isolatedCwd = mkdtempSync(join(tmpdir(), 'jev-claude-host-probe-'));
const args = [
  '-p', 'Reply READY',
  '--model', 'claude-opus-4-7',
  '--output-format', 'json',
  '--tools', '',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--no-session-persistence',
  '--no-chrome',
  '--max-turns', '1',
  '--system-prompt', 'Reply with the requested literal word only.',
];
const startedAt = new Date().toISOString();
const probeEnv = { ...process.env };
delete probeEnv.TYPESAFE_API_KEY;
const processResult = spawnSync('claude', args, {
  cwd: isolatedCwd,
  env: probeEnv,
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 8 * 1024 * 1024,
});

let response;
try { response = JSON.parse(processResult.stdout); }
catch { response = null; }
const models = response?.modelUsage && typeof response.modelUsage === 'object'
  ? Object.fromEntries(Object.entries(response.modelUsage).map(([model, usage]) => [model, {
      inputTokens: usage.inputTokens ?? null,
      cacheCreationInputTokens: usage.cacheCreationInputTokens ?? null,
      cacheReadInputTokens: usage.cacheReadInputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      costUsdEstimate: usage.costUSD ?? null,
    }]))
  : null;
const evidence = {
  startedAt,
  requestedModel: 'claude-opus-4-7',
  exitCode: processResult.status,
  signal: processResult.signal,
  timedOut: processResult.error?.code === 'ETIMEDOUT',
  parsedResult: response?.type === 'result',
  resultIsError: response?.is_error ?? null,
  replyWasReady: response?.result?.trim() === 'READY',
  observedModels: models,
  usage: response?.usage ?? null,
  totalCostUsdEstimate: response?.total_cost_usd ?? null,
  stderrPresent: Boolean(processResult.stderr),
  rawOutputSaved: false,
  isolation: 'temporary empty cwd; no tools; no MCP; slash commands disabled; no session persistence',
};
writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({
  exitCode: evidence.exitCode,
  parsedResult: evidence.parsedResult,
  resultIsError: evidence.resultIsError,
  replyWasReady: evidence.replyWasReady,
  observedModelNames: models ? Object.keys(models) : [],
}) + '\n');
