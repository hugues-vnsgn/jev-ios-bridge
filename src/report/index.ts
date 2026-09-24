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
  const start = report.events.find(event => event.type === 'started')?.data;
  const lastScreen = report.events.findLast(event => event.type === 'step')?.data;
  const checkpoints = Array.isArray(start?.checkpoints) ? start.checkpoints : [];
  const checkpointProofs = report.events.filter(event => event.type === 'checkpoint' && event.data.status === 'passed');
  const activeCheckpoint = checkpoints[checkpointProofs.length];
  const compactEvidence = (event: RunEvent) => {
    const judgment = event.data.judgment;
    if (event.type === 'judgment' && judgment && typeof judgment === 'object') {
      const j = judgment as Record<string, unknown>;
      return JSON.stringify({ checkpointId: event.data.checkpointId, choice: j.choice, confidence: j.confidence,
        goalReached: j.goalReached, assertions: j.assertions });
    }
    return JSON.stringify(event.data);
  };
  return [
    `Run ${report.runId}: ${report.verdict}`,
    report.reason,
    `Steps: ${report.steps}; Jev input tokens: ${report.inputTokens}; duration: ${report.durationMs} ms.`,
    ...(typeof start?.goal === 'string' ? [`Goal: ${start.goal.slice(0, 2000)}`] : []),
    ...(Array.isArray(start?.assertions) ? [`Assertions: ${JSON.stringify(start.assertions).slice(0, 4000)}`] : []),
    ...(checkpoints.length ? [
      `Recorded checkpoint passes: ${checkpointProofs.length}/${checkpoints.length}.`,
      ...checkpointProofs.map(event => [
        `Checkpoint ${event.data.checkpointId}: ${event.data.status} at step ${event.data.step}.`,
        `Completion probability: ${event.data.goalReachedProbability}; assertion proof: ${JSON.stringify(event.data.assertions ?? []).slice(0, 4000)}`,
      ].join('\n')),
      ...(activeCheckpoint ? [`Current checkpoint: ${activeCheckpoint.id}: ${activeCheckpoint.goal}`, `Checkpoint assertions: ${JSON.stringify(activeCheckpoint.assertions).slice(0, 4000)}`] : []),
    ] : []),
    '', 'Recent evidence:',
    ...evidence.map(event => `${event.sequence}. ${event.type}: ${compactEvidence(event).slice(0, 1800)}`),
    ...(typeof lastScreen?.observationSummary === 'string' ? ['', 'Final recorded observation:', lastScreen.observationSummary.slice(0, 4000)] : []),
    ...(lastScreen?.logTails ? ['', `App log excerpts: ${JSON.stringify(lastScreen.logTails).slice(0, 4000)}`] : []),
  ].join('\n');
}
