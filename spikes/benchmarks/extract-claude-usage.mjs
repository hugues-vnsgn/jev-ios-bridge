#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const resultPath = process.argv[2];
if (!resultPath || process.argv.length !== 3) {
  throw new Error('Usage: node spikes/benchmarks/extract-claude-usage.mjs <upstream-result.json | claude-stream.jsonl>');
}

const raw = readFileSync(resultPath, 'utf8');
let benchmarkResult;
let streamRecords;
if (resultPath.endsWith('.jsonl')) {
  streamRecords = raw.split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid Claude JSONL at line ${index + 1}`); }
  });
} else {
  benchmarkResult = JSON.parse(raw);
}
const summary = benchmarkResult?.audit?.resultSummary ?? streamRecords?.findLast(record => record.type === 'result');
if (summary?.type !== 'result' || !summary.modelUsage || typeof summary.modelUsage !== 'object') {
  throw new Error('Claude terminal result or modelUsage is missing; token comparison is unavailable');
}

const toolNames = streamRecords?.flatMap(record => {
  if (record.type !== 'assistant' || !Array.isArray(record.message?.content)) return [];
  return record.message.content.filter(block => block?.type === 'tool_use').map(block => block.name);
});

function count(value, field, model) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${field} for ${model}`);
  }
  return value;
}

const byModel = Object.entries(summary.modelUsage).map(([model, usage]) => {
  if (!usage || typeof usage !== 'object') throw new Error(`Invalid modelUsage entry: ${model}`);
  return {
    model,
    uncachedInputTokens: count(usage.inputTokens, 'inputTokens', model),
    cacheCreationInputTokens: count(usage.cacheCreationInputTokens ?? 0, 'cacheCreationInputTokens', model),
    cacheReadInputTokens: count(usage.cacheReadInputTokens ?? 0, 'cacheReadInputTokens', model),
    outputTokens: count(usage.outputTokens, 'outputTokens', model),
    estimatedCostUsd: typeof usage.costUSD === 'number' && Number.isFinite(usage.costUSD) ? usage.costUSD : null,
  };
});
if (!byModel.length) throw new Error('modelUsage is empty');

const sum = field => byModel.reduce((total, row) => total + row[field], 0);
const tokens = {
  uncachedInput: sum('uncachedInputTokens'),
  cacheCreationInput: sum('cacheCreationInputTokens'),
  cacheReadInput: sum('cacheReadInputTokens'),
  output: sum('outputTokens'),
};
tokens.allInputProcessed = tokens.uncachedInput + tokens.cacheCreationInput + tokens.cacheReadInput;

const measured = {
  suite: benchmarkResult?.name ?? null,
  benchmarkCompleted: benchmarkResult?.completed ?? null,
  terminalSuccess: summary.is_error === false,
  claudeExitCode: benchmarkResult?.run?.claudeExitCode ?? null,
  parserExitCode: benchmarkResult?.run?.parserExitCode ?? null,
  parseErrors: benchmarkResult?.audit?.parseErrors?.length ?? null,
  requestedModel: benchmarkResult?.run?.claude?.requestedModel ?? null,
  observedModel: benchmarkResult?.run?.claude?.observedModel ?? Object.keys(summary.modelUsage).join(', '),
  wallClockSeconds: benchmarkResult?.run?.wallClockSeconds ?? (typeof summary.duration_ms === 'number' ? summary.duration_ms / 1000 : null),
  wallClockSource: benchmarkResult ? 'upstream harness process timer' : 'Claude result duration_ms; capture external process time for comparison',
  totalHostToolCalls: benchmarkResult?.audit?.totalToolCalls ?? toolNames?.length ?? null,
  mcpToolCalls: benchmarkResult?.audit?.mcpToolCalls ?? toolNames?.filter(name => name?.startsWith('mcp__')).length ?? null,
  uiAutomationCalls: benchmarkResult?.audit?.uiAutomationCalls ?? null,
  tokens,
  byModel,
  estimatedCostUsd: typeof summary.total_cost_usd === 'number' && Number.isFinite(summary.total_cost_usd)
    ? summary.total_cost_usd : null,
  costMeaning: 'Claude Code client estimate at API prices, not a subscription invoice',
  source: resultPath,
};
process.stdout.write(JSON.stringify(measured, null, 2) + '\n');
