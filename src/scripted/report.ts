import type { RunEvent, RunReport, Verdict } from '../contracts/index.js';

export interface ScriptedReport extends RunReport {
  checkpoints: Array<{
    stepId: string;
    status: 'passed' | 'failed' | 'inconclusive';
    assertions: Array<{ id: string; claim: string; probability: number }>;
    observationSummary?: string;
    assertionObservation?: string;
    evidenceEvent?: number;
    snapshotSequence?: number;
    screenshotPath?: string;
  }>;
}

const REPORT_BUDGET_BYTES = 24_000;

function bounded(value: string, maximumBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maximumBytes) return value;
  const notice = '\n[truncated; full text in run.jsonl]';
  const limit = maximumBytes - Buffer.byteLength(notice, 'utf8');
  let prefix = '';
  let used = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (used + size > limit) break;
    prefix += character;
    used += size;
  }
  return prefix + notice;
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
      ...(typeof observed?.data.assertionObservation === 'string' ? { assertionObservation: observed.data.assertionObservation } : {}),
      ...(observed ? { evidenceEvent: observed.sequence } : {}),
      ...(typeof observed?.data.snapshotSequence === 'number' ? { snapshotSequence: observed.data.snapshotSequence } : {}),
      ...(typeof observed?.data.screenshotPath === 'string' ? { screenshotPath: observed.data.screenshotPath } : {}),
    };
  });
  return {
    runId: events[0]!.runId,
    verdict,
    reason: typeof final?.reason === 'string' ? final.reason : 'No final verdict recorded',
    steps: typeof final?.steps === 'number' ? final.steps : Math.max(0, ...events
      .filter(event => event.type === 'step' && Number.isSafeInteger(event.data.step))
      .map(event => event.data.step as number)),
    inputTokens: typeof final?.inputTokens === 'number' ? final.inputTokens : 0,
    durationMs: typeof final?.durationMs === 'number' ? final.durationMs : 0,
    events,
    checkpoints,
  };
}

export function renderScriptedReport(report: ScriptedReport): string {
  const lastError = report.events.findLast(event => event.type === 'error');
  const lastStep = report.events.findLast(event => event.type === 'step');
  const header = [
    `Run ${report.runId}: ${report.verdict}`,
    report.reason,
    `Steps: ${report.steps}; Jev input tokens: ${report.inputTokens}; duration: ${report.durationMs} ms.`,
  ].join('\n');
  const checkpointBlock = (checkpoint: ScriptedReport['checkpoints'][number], decisive: boolean): string => [
      `Checkpoint ${checkpoint.stepId}: ${checkpoint.status}.`,
      ...checkpoint.assertions.map(assertion =>
        `Claim ${assertion.id}: ${bounded(assertion.claim, decisive ? 500 : 180)}; probability yes ${assertion.probability.toFixed(3)}.`),
      ...(checkpoint.evidenceEvent === undefined ? [] : [
        `Evidence: step ${checkpoint.stepId}, run.jsonl event ${checkpoint.evidenceEvent}` +
          (checkpoint.snapshotSequence === undefined ? '' : `, snapshot ${checkpoint.snapshotSequence}`) + '.',
      ]),
      ...(checkpoint.observationSummary ? [`Observed screen excerpt:\n${bounded(checkpoint.observationSummary, decisive ? 4_000 : 1_200)}`] : []),
      ...(checkpoint.assertionObservation ? [
        `Full redacted assertion observation: run.jsonl event ${checkpoint.evidenceEvent}, data.assertionObservation.`,
      ] : []),
      ...(checkpoint.screenshotPath ? [`Screenshot: ${checkpoint.screenshotPath}`] : []),
    ].join('\n');
  const errorBlock = lastError ? [
      `Execution problem: ${String(lastError.data.code ?? 'UNKNOWN')} during ${String(lastError.data.phase ?? 'run')}`,
      ...(typeof lastStep?.data.observationSummary === 'string'
        ? [`Last observed screen:\n${bounded(lastStep.data.observationSummary, 1_500)}`] : []),
      ...(typeof lastStep?.data.screenshotPath === 'string' ? [`Last screenshot: ${lastStep.data.screenshotPath}`] : []),
    ].join('\n') : undefined;
  const lastCheckpoint = report.checkpoints.at(-1);
  const earlier = report.checkpoints.slice(0, -1);
  const blocks = [
    ...(errorBlock ? [errorBlock] : []),
    ...(lastCheckpoint ? [checkpointBlock(lastCheckpoint, true)] : []),
    ...earlier.map(checkpoint => checkpointBlock(checkpoint, false)),
  ];
  let rendered = header;
  for (const [index, block] of blocks.entries()) {
    const remaining = blocks.length - index - 1;
    const notice = `\n[Report truncated; ${remaining + 1} evidence section(s) omitted. Full redacted evidence: run.jsonl.]`;
    if (Buffer.byteLength(`${rendered}\n${block}`, 'utf8') + Buffer.byteLength(notice, 'utf8') > REPORT_BUDGET_BYTES) {
      return rendered + notice;
    }
    rendered += `\n${block}`;
  }
  return rendered;
}
