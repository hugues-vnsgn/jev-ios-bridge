import type { RunEvent, RunReport, Verdict } from '../contracts/index.js';

export function buildReport(events: RunEvent[]): RunReport {
  if (!events.length) throw new Error('Run log is empty');
  const first = events[0]!;
  const lastVerdict = events.findLast(event => event.type === 'verdict');
  const outcome = lastVerdict?.data;
  const value = outcome?.verdict;
  const verdict: Verdict = value === 'passed' || value === 'failed' ? value : 'inconclusive';
  return {
    runId: first.runId,
    verdict,
    reason: typeof outcome?.reason === 'string' ? outcome.reason : 'Run has no recorded verdict; it may be active or interrupted.',
    steps: typeof outcome?.steps === 'number' ? outcome.steps : events.filter(event => event.type === 'step').length,
    inputTokens: typeof outcome?.inputTokens === 'number' ? outcome.inputTokens : 0,
    durationMs: typeof outcome?.durationMs === 'number' ? outcome.durationMs : 0,
    events,
  };
}

export function renderReport(report: RunReport): string {
  const evidence = report.events.filter(event => ['judgment', 'action', 'error'].includes(event.type)).slice(-8);
  return [
    `Run ${report.runId}: ${report.verdict}`,
    report.reason,
    `Steps: ${report.steps}; Jev input tokens: ${report.inputTokens}; duration: ${report.durationMs} ms.`,
    '', 'Recent evidence:',
    ...evidence.map(event => `${event.sequence}. ${event.type}: ${JSON.stringify(event.data).slice(0, 1800)}`),
  ].join('\n');
}
