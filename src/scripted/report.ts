import type { RunEvent, RunReport, Verdict } from '../contracts/index.js';
import {
  drivenReportOf, recordedPlatform, typedFieldsOf, type ReportDoStep, type ReportDriven, type ReportDrivenAction,
} from './report-json.js';

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

const DECIDER_NAMES = { script: 'the script', jev: 'Jev', claude: 'Claude', bridge: 'the bridge (target search)' } as const;

function preflightText(preflight: ReportDriven['preflight']): string {
  if (!preflight) return 'preflight not run';
  if (preflight.status === 'ok') return 'preflight ok';
  if (preflight.status === 'missing') return 'preflight missing (no .jev/preflight.json)';
  const cause = preflight.failure === 'cleanup' ? 'its processes could not be stopped'
    : preflight.exitCode !== null ? `exit code ${preflight.exitCode}` : preflight.failure ?? 'unknown cause';
  return `preflight failed (${cause})`;
}

function actionText(action: ReportDrivenAction): string {
  const target = [
    action.ref, action.direction, action.x !== undefined ? `at ${action.x}, ${action.y}` : undefined,
    action.valueKey !== undefined ? `(value ${action.valueKey})` : undefined,
  ].filter(Boolean).join(' ');
  const jev = action.key !== undefined
    ? ` (${action.key}${action.confidence === undefined ? '' : `, confidence ${action.confidence.toFixed(3)}`})` : '';
  const effect = action.changed === undefined ? '' : action.changed ? ' (the screen changed)' : ' (no change)';
  return `${action.stepId}: ${action.action}${target ? ` ${target}` : ''}${action.retry ? ' (retry)' : ''}${effect}, ` +
    `decided by ${DECIDER_NAMES[action.decidedBy]}${jev}.`;
}

function doStepText(step: ReportDoStep, ended: boolean): string {
  if (step.completedBy === 'jev') {
    return `${step.stepId}: done, by Jev's done check${step.done === undefined ? '' : ` (${step.done.toFixed(3)})`}.`;
  }
  return step.completedBy === 'claude' ? `${step.stepId}: done, declared by Claude.`
    : `${step.stepId}: not done${ended ? '' : ' yet'}.`;
}

/** Driven runs only: start mode, preflight, Jev's decisions, who decided each action, who completed each `do` step,
 *  and each hand-back. */
function drivenBlock(driven: ReportDriven, ended: boolean): string {
  return [
    `Driven steps: start ${driven.start}; ${preflightText(driven.preflight)}; ` +
      `${driven.decisions} Jev decisions, ${driven.decisionInputTokens} input tokens.`,
    ...(driven.actions.length ? ['Actions:', ...driven.actions.map(actionText)] : []),
    ...(driven.doSteps.length ? ['Do steps:', ...driven.doSteps.map(step => doStepText(step, ended))] : []),
    ...(driven.handbacks.length ? ['Hand-backs:', ...driven.handbacks.map(handback => `${handback.stepId}: ${handback.reason}; ` +
      (handback.answer !== null ? `Claude answered ${handback.answer} after ${handback.waitMs} ms.`
        : ended ? 'no answer.' : 'waiting for Claude\'s answer.'))] : []),
  ].join('\n');
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
  const started = report.events.find(event => event.type === 'started')?.data;
  const prepared = report.events.find(event => event.type === 'prepared')?.data;
  // The run's own recorded platform decides, not merely whether a driver happened to set an Android field.
  const android = recordedPlatform(report.events) === 'android';
  const model = typeof started?.jevModel === 'string' ? started.jevModel
    : report.events.find(event => event.type === 'judgment' && typeof event.data.model === 'string')?.data.model;
  const header = [
    `Run ${report.runId}: ${report.verdict}`,
    report.reason,
    `Steps: ${report.steps}; Jev input tokens: ${report.inputTokens}; duration: ${report.durationMs} ms.`,
    ...(typeof model === 'string' ? [`Jev model: ${model}` +
      (typeof started?.bridgeVersion === 'string' ? `; bridge ${started.bridgeVersion}.` : '.')] : []),
    // Android only: prepare's device identity, serial, agent SHA-256 and any crash-takeover sweep.
    ...(android && typeof prepared?.deviceIdentity === 'string' ? [`Device: ${prepared.deviceIdentity}, serial ${String(prepared.serial ?? '')}, ` +
      `agent ${String(prepared.agentSha256 ?? '')}.` + (prepared.sweptLeftovers === true
        ? ' Swept a crashed run\'s leftover agent and forward.' : '')] : []),
  ].join('\n');
  // Android only: each replace-text step's shown value, from the run's `action` events.
  const typedFields = android ? typedFieldsOf(report.events) : [];
  const typedFieldsBlock = typedFields.length ? ['Typed fields:',
    ...typedFields.map(field => `${field.stepId}: ${bounded(field.shownValue, 500)}`)].join('\n') : undefined;
  // Android only: every step whose observed screen never settled within the settle rule's cap, whatever its
  // kind: a checkpoint judged on it is judged as usual, but this still names the step "screen still changing".
  const unsettledStepIds = android ? [...new Set(report.events.flatMap(event => event.type === 'step' && event.data.settled === false
    ? [String(event.data.stepId ?? '')] : []))] : [];
  const unsettledBlock = unsettledStepIds.length
    ? `Screen still changing when observed, for step(s): ${unsettledStepIds.join(', ')}.` : undefined;
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
  const ended = report.events.some(event => event.type === 'verdict');
  const driven = drivenReportOf(report.events);
  const open = driven?.handbacks.at(-1);
  const waitingBlock = !ended && open && open.answer === null
    ? `Waiting for Claude (needs_claude): step ${open.stepId}, ${open.reason}. Answer with resolve_step.` : undefined;
  const lastCheckpoint = report.checkpoints.at(-1);
  const earlier = report.checkpoints.slice(0, -1);
  const blocks = [
    ...(waitingBlock ? [waitingBlock] : []),
    ...(errorBlock ? [errorBlock] : []),
    ...(typedFieldsBlock ? [typedFieldsBlock] : []),
    ...(unsettledBlock ? [unsettledBlock] : []),
    ...(driven ? [drivenBlock(driven, ended)] : []),
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
