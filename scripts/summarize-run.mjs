#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const phases = ['prepareMs', 'observeMs', 'decideMs', 'actMs'];
const counters = ['referenceRefreshes', 'referenceExpiries', 'nearTtlRefreshes'];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function duration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function metrics(value) {
  const source = object(value);
  if (!counters.every(key => count(source[key]) !== null)) return null;
  return Object.fromEntries(counters.map(key => [key, source[key]]));
}

function readEvents(text) {
  const lines = text.split('\n');
  const events = [];
  const warnings = [];
  let runId;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    let event;
    try { event = JSON.parse(line); }
    catch {
      if (index === lines.length - 1) {
        warnings.push('Trailing incomplete JSONL record ignored');
        break;
      }
      throw new Error('Corrupt JSONL record before end of file');
    }
    if (event?.version !== 1 || typeof event.runId !== 'string' ||
        !Number.isSafeInteger(event.sequence) || event.sequence !== events.length + 1 ||
        typeof event.type !== 'string' || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
      throw new Error('Invalid run event or sequence');
    }
    runId ??= event.runId;
    if (event.runId !== runId) throw new Error('Mixed run IDs in one journal');
    events.push(event);
  }
  if (events.length === 0) throw new Error('Run journal has no complete events');
  return { events, warnings };
}

function summarize(events, warnings) {
  const steps = new Map();
  const errors = [];
  let preparedMs = null;
  let lastMetrics = null;
  let jevInputTokens = 0;
  let jevLatencyMs = 0;
  let jevTokensComplete = true;
  let jevLatencyComplete = true;
  let judgmentCount = 0;
  let verdictEvent = null;

  function row(step) {
    if (!Number.isSafeInteger(step) || step < 1) return null;
    if (!steps.has(step)) steps.set(step, {
      step, observeMs: null, decideMs: null, actMs: null,
      referenceRefreshes: null, referenceExpiries: null, nearTtlRefreshes: null,
      refreshDelta: null, expiryDelta: null, nearTtlDelta: null, errors: [],
    });
    return steps.get(step);
  }

  function putMetrics(target, value) {
    const next = metrics(value);
    if (!next) return;
    target.referenceRefreshes = next.referenceRefreshes;
    target.referenceExpiries = next.referenceExpiries;
    target.nearTtlRefreshes = next.nearTtlRefreshes;
    target.refreshDelta = next.referenceRefreshes - (lastMetrics?.referenceRefreshes ?? 0);
    target.expiryDelta = next.referenceExpiries - (lastMetrics?.referenceExpiries ?? 0);
    target.nearTtlDelta = next.nearTtlRefreshes - (lastMetrics?.nearTtlRefreshes ?? 0);
    if ([target.refreshDelta, target.expiryDelta, target.nearTtlDelta].some(delta => delta < 0)) {
      warnings.push(`Device counters decreased at step ${target.step}`);
    }
    lastMetrics = next;
  }

  for (const event of events) {
    const data = event.data;
    if (event.type === 'prepared') preparedMs = duration(data.prepareMs);
    if (event.type === 'step') {
      const target = row(data.step);
      if (target) target.observeMs = duration(data.observeMs);
    }
    if (event.type === 'judgment') {
      const target = row(data.step);
      if (target) target.decideMs = duration(data.decideMs);
      const judgment = object(data.judgment);
      const tokens = count(judgment.inputTokens);
      const latency = duration(judgment.latencyMs);
      if (tokens !== null) jevInputTokens += tokens;
      else jevTokensComplete = false;
      if (latency !== null) jevLatencyMs += latency;
      else jevLatencyComplete = false;
      judgmentCount++;
    }
    if (event.type === 'action') {
      const target = row(data.step);
      if (target) {
        target.actMs = duration(data.actMs);
        putMetrics(target, data.deviceMetrics);
      }
    }
    if (event.type === 'error') {
      const detail = { step: count(data.step), phase: typeof data.phase === 'string' ? data.phase : null,
        phaseMs: duration(data.phaseMs) };
      errors.push(detail);
      const target = row(data.step);
      if (target) {
        target.errors.push(detail);
        if (detail.phase === 'act' && target.actMs === null) target.actMs = detail.phaseMs;
        putMetrics(target, data.deviceMetrics);
      }
    }
    if (event.type === 'verdict') verdictEvent = event;
  }

  const outcome = object(verdictEvent?.data);
  const recordedTimings = object(outcome.timings);
  const stepRows = [...steps.values()].sort((a, b) => a.step - b.step);
  const measuredTotals = Object.fromEntries(phases.map(key => {
    const observed = key === 'prepareMs' ? (preparedMs === null ? [] : [preparedMs]) :
      stepRows.map(item => item[key]).filter(value => value !== null);
    return [key, duration(recordedTimings[key]) ?? (observed.length ? observed.reduce((sum, value) => sum + value, 0) : null)];
  }));
  const finalMetrics = metrics(outcome.deviceMetrics) ?? lastMetrics;
  const runInputTokens = count(outcome.inputTokens);
  const recordedJevTokens = judgmentCount && jevTokensComplete ? jevInputTokens : null;
  const recordedJevLatency = judgmentCount && jevLatencyComplete ? jevLatencyMs : null;
  if (runInputTokens !== null && recordedJevTokens !== null && runInputTokens !== recordedJevTokens) {
    warnings.push('Verdict input-token total differs from recorded judgments');
  }
  return {
    runId: events[0].runId,
    verdict: typeof outcome.verdict === 'string' ? outcome.verdict : null,
    steps: stepRows,
    totals: {
      wallMs: duration(outcome.durationMs),
      ...measuredTotals,
      cleanupMs: duration(outcome.cleanupMs),
      runInputTokens,
      jevInputTokens: recordedJevTokens,
      jevLatencyMs: recordedJevLatency,
      judgmentCount,
      referenceRefreshes: finalMetrics?.referenceRefreshes ?? null,
      referenceExpiries: finalMetrics?.referenceExpiries ?? null,
      nearTtlRefreshes: finalMetrics?.nearTtlRefreshes ?? null,
    },
    errors,
    warnings,
  };
}

const file = process.argv[2];
if (!file || process.argv.length !== 3) {
  process.stderr.write('Usage: node scripts/summarize-run.mjs path/to/run.jsonl\n');
  process.exitCode = 2;
} else {
  try {
    const { events, warnings } = readEvents(await readFile(file, 'utf8'));
    process.stdout.write(`${JSON.stringify(summarize(events, warnings), null, 2)}\n`);
  } catch {
    process.stderr.write('Cannot summarize run journal: invalid or unreadable JSONL.\n');
    process.exitCode = 2;
  }
}
