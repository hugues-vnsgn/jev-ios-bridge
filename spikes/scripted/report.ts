import type { RunEvent, RunReport, Verdict } from '../../src/contracts/index.js';

export interface ScriptedReport extends RunReport {
  checkpoints: Array<{
    stepId: string;
    status: 'passed' | 'failed' | 'inconclusive';
    assertions: Array<{ id: string; claim: string; probability: number }>;
    observationSummary?: string;
    screenshotPath?: string;
  }>;
}

function bounded(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum)}\n[truncated]`;
}

/** The recorded verdict is authoritative; this only presents it. */
export function buildScriptedReport(events: RunEvent[]): ScriptedReport {
  if (!events.length) throw new Error('Scripted run log is empty');
  const final = events.findLast(event => event.type === 'verdict')?.data;
  const recorded = final?.verdict;
  const verdict: Verdict = recorded === 'passed' || recorded === 'failed' ? recorded : 'inconclusive';
  const checkpoints: ScriptedReport['checkpoints'] = events.filter(event => event.type === 'checkpoint').map(event => {
    const observed = events.findLast(candidate => candidate.type === 'step' && candidate.sequence < event.sequence &&
      candidate.data.stepId === event.data.stepId);
    return {
      stepId: String(event.data.stepId ?? ''),
      status: event.data.status === 'passed' ? 'passed' : event.data.status === 'failed' ? 'failed' : 'inconclusive',
      assertions: Array.isArray(event.data.assertions) ? event.data.assertions as ScriptedReport['checkpoints'][number]['assertions'] : [],
      ...(typeof observed?.data.observationSummary === 'string' ? { observationSummary: observed.data.observationSummary } : {}),
      ...(typeof observed?.data.screenshotPath === 'string' ? { screenshotPath: observed.data.screenshotPath } : {}),
    };
  });
  return {
    runId: events[0]!.runId,
    verdict,
    reason: typeof final?.reason === 'string' ? final.reason : 'No final verdict recorded',
    steps: typeof final?.steps === 'number' ? final.steps : events.filter(event => event.type === 'step').length,
    inputTokens: typeof final?.inputTokens === 'number' ? final.inputTokens : 0,
    durationMs: typeof final?.durationMs === 'number' ? final.durationMs : 0,
    events,
    checkpoints,
  };
}

export function renderScriptedReport(report: ScriptedReport): string {
  const lastError = report.events.findLast(event => event.type === 'error');
  const lastStep = report.events.findLast(event => event.type === 'step');
  return [
    `Run ${report.runId}: ${report.verdict}`,
    report.reason,
    `Steps: ${report.steps}; Jev input tokens: ${report.inputTokens}; duration: ${report.durationMs} ms.`,
    ...report.checkpoints.flatMap(checkpoint => [
      `Checkpoint ${checkpoint.stepId}: ${checkpoint.status}.`,
      ...checkpoint.assertions.map(assertion =>
        `Claim ${assertion.id}: ${bounded(assertion.claim, 1_000)}; probability yes ${assertion.probability.toFixed(3)}.`),
      ...(checkpoint.observationSummary ? [`Observed screen:\n${bounded(checkpoint.observationSummary, 2_000)}`] : []),
      ...(checkpoint.screenshotPath ? [`Screenshot: ${checkpoint.screenshotPath}`] : []),
    ]),
    ...(lastError ? [
      `Execution problem: ${String(lastError.data.code ?? 'UNKNOWN')} during ${String(lastError.data.phase ?? 'run')}`,
      ...(typeof lastStep?.data.observationSummary === 'string'
        ? [`Last observed screen:\n${bounded(lastStep.data.observationSummary, 2_000)}`] : []),
      ...(typeof lastStep?.data.screenshotPath === 'string' ? [`Last screenshot: ${lastStep.data.screenshotPath}`] : []),
    ] : []),
  ].join('\n');
}
