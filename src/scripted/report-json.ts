import type { Platform, RunEvent, StartMode, Verdict } from '../contracts/index.js';
import { BRIDGE_VERSION } from '../version.js';
import { isReasonCode, type ReasonCode } from './vocabulary.js';

/** Version of the frozen report.json shape (ADR-0005). 1.x may add fields; readers ignore unknown ones. */
export const REPORT_VERSION = 1;

export interface ReportClaim { id: string; claim: string; probability: number }

export interface ReportCheckpoint {
  stepId: string;
  status: Verdict;
  claims: ReportClaim[];
  /** Screenshot file in the run's evidence folder, or null when none was captured. */
  screenshot: string | null;
  /** Sequence number of the run.jsonl `step` event holding the judged observation. */
  evidenceEvent: number | null;
}

export interface ReportJson {
  reportVersion: typeof REPORT_VERSION;
  runId: string;
  bridgeVersion: string;
  jevModel: string | null;
  projectionRule: string | null;
  bundleId: string | null;
  /** Arguments the app was launched with (app.launchArgs), empty when none. */
  launchArgs: string[];
  verdict: Verdict;
  reason: ReasonCode;
  error: { code: ReasonCode; phase: string | null; stepId: string | null; vendorCode?: string } | null;
  steps: number;
  plannedSteps: number | null;
  checkpointsPassed: number;
  checkpointCount: number | null;
  inputTokens: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  checkpoints: ReportCheckpoint[];
  evidence: { log: 'run.jsonl'; screenshots: string[] };
  /** Android runs only, mirroring `started`; a reader with no `platform` field treats the report as iOS's. */
  platform?: 'android';
  package?: string;
  activity?: string | null;
  intentExtras?: Record<string, string>;
  /** Android runs only: one shown value per replace-text step, built from `action` events. */
  typedFields?: Array<{ stepId: string; shownValue: string }>;
  /** Runs whose script has a `do` step only (driven mode, experimental). */
  driven?: ReportDriven;
}

/** Who decided an action: the script's own step, Jev, Claude answering a hand-back, or the bridge (the target
 *  search's scrolls). */
export type DecidedBy = 'script' | 'jev' | 'claude' | 'bridge';

export interface ReportDrivenAction {
  stepId: string;
  /** The action kind: tap, type, scroll, back, tapAt, swipe, replaceText, wait. A target search scroll is `scroll`. */
  action: string;
  ref?: string;
  valueKey?: string;
  direction?: string;
  x?: number;
  y?: number;
  decidedBy: DecidedBy;
  /** Jev's picks only: the option key it chose and its confidence. */
  key?: string;
  confidence?: number;
  /** The one retry of an action that left the screen unchanged. */
  retry?: true;
  /** The bridge's search scrolls only: whether the scroll changed the screen. */
  changed?: boolean;
}

export interface ReportHandback {
  stepId: string;
  reason: string;
  /** Claude's answer kind, or null when the pause got none (timeout, cancel, or still waiting). */
  answer: string | null;
  /** From the pause to Claude's answer; null with no answer. */
  waitMs: number | null;
  /** Sequence number of the run.jsonl `handback` event. */
  event: number;
}

/** One `do` step as it ran, and who completed it. */
export interface ReportDoStep {
  stepId: string;
  /** Jev's done check, Claude's `done` answer, or null when the step ended without being done. */
  completedBy: 'jev' | 'claude' | null;
  /** Jev's "step done" probability, when Jev completed the step. */
  done?: number;
}

export interface ReportDriven {
  /** The script's start mode; `restart` when it names none. */
  start: StartMode;
  /** The project preflight, or null when no `test_write` step ran it. Never its output. */
  preflight: { status: 'ok' | 'missing' | 'failed'; exitCode: number | null; failure?: string; durationMs: number } | null;
  /** Jev decision calls, and the input tokens they used (also counted in `inputTokens`). */
  decisions: number;
  decisionInputTokens: number;
  /** Every performed action, in order, with who decided it; the target search's scrolls are the bridge's. */
  actions: ReportDrivenAction[];
  /** Every `do` step that ran, in order (a step run again after a revision is listed again), and who completed it. */
  doSteps: ReportDoStep[];
  /** Every pause for Claude, in order. */
  handbacks: ReportHandback[];
}

const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Keeps only the entries of an unknown value whose value is itself a string; `{}` for anything else. */
function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** One shown value per replace-text step, built from the run's `action` events; `[]` when none typed. */
export function typedFieldsOf(events: RunEvent[]): Array<{ stepId: string; shownValue: string }> {
  return events.flatMap(event => event.type === 'action' && event.data.action === 'replaceText' &&
    typeof event.data.shownValue === 'string'
    ? [{ stepId: String(event.data.stepId ?? ''), shownValue: event.data.shownValue }] : []);
}

/** The run's own recorded platform (from `started`), the one place any reader decides Android vs iOS;
 *  a run with no `started` event, or no recorded `platform`, reads as iOS. */
export function recordedPlatform(events: RunEvent[]): Platform {
  return events.find(event => event.type === 'started')?.data.platform === 'android' ? 'android' : 'ios';
}

/** The Android-only fields, built from `started` and the `action` events; `{}` on iOS runs. */
function androidReportFields(started: RunEvent | undefined, events: RunEvent[]):
  Pick<ReportJson, 'platform' | 'package' | 'activity' | 'intentExtras' | 'typedFields'> {
  if (recordedPlatform(events) !== 'android' || !started) return {};
  const typedFields = typedFieldsOf(events);
  return {
    platform: 'android',
    package: text(started.data.package) ?? '',
    activity: started.data.activity === null ? null : text(started.data.activity),
    intentExtras: stringRecord(started.data.intentExtras),
    ...(typedFields.length ? { typedFields } : {}),
  };
}

/** Whether the run's script has a `do` step: only such a run gets driven fields, so a v1 report stays as it was. */
export function isDrivenRun(events: RunEvent[]): boolean {
  const planned = events.find(event => event.type === 'started')?.data.plannedSteps;
  return Array.isArray(planned) && planned.some(step => (step as { kind?: unknown } | null)?.kind === 'do');
}

const DECIDERS: ReadonlySet<string> = new Set(['jev', 'claude']);

/** The step kinds by id: the planned steps, then each revision's, the later winning. */
function stepKindsOf(events: RunEvent[]): Map<string, unknown> {
  const kinds = new Map<string, unknown>();
  const add = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const step of list as Array<{ id?: unknown; kind?: unknown } | null>) {
      if (typeof step?.id === 'string') kinds.set(step.id, step.kind);
    }
  };
  for (const event of events) {
    if (event.type === 'started') add(event.data.plannedSteps);
    if (event.type === 'handback_answer' && event.data.kind === 'revise') add(event.data.steps);
  }
  return kinds;
}

/** The `do` steps that ran, by run step number, from their `step` events; each completed by the `decision` event
 *  whose done check said yes, or by Claude's `done` answer. A `do` step that started but failed before its first
 *  observation has no `step` event: the run's `error` names it, and the verdict's step count is its number. */
function doStepsOf(events: RunEvent[]): ReportDoStep[] {
  const steps = new Map<number, ReportDoStep>();
  const kinds = stepKindsOf(events);
  const failedStep = count(events.findLast(event => event.type === 'verdict')?.data.steps);
  for (const event of events) {
    if (event.type === 'error' && failedStep !== null && !steps.has(failedStep) &&
        typeof event.data.stepId === 'string' && kinds.get(event.data.stepId) === 'do') {
      steps.set(failedStep, { stepId: event.data.stepId, completedBy: null });
    }
    const number = event.data.step;
    if (typeof number !== 'number') continue;
    if (event.type === 'step' && event.data.kind === 'do' && !steps.has(number)) {
      steps.set(number, { stepId: String(event.data.stepId ?? ''), completedBy: null });
    }
    const step = steps.get(number);
    if (!step || step.completedBy !== null) continue;
    if (event.type === 'decision' && event.data.stepDone === true) {
      step.completedBy = 'jev';
      if (typeof event.data.done === 'number') step.done = event.data.done;
    }
    if (event.type === 'handback_answer' && event.data.kind === 'done') step.completedBy = 'claude';
  }
  return [...steps.values()];
}

/** The driven block, built from `started`, `preflight`, `step`, `decision`, `action`, `search`, `handback` and
 *  `handback_answer`. */
export function drivenReportOf(events: RunEvent[]): ReportDriven | undefined {
  if (!isDrivenRun(events)) return undefined;
  const started = events.find(event => event.type === 'started')?.data;
  const preflight = events.find(event => event.type === 'preflight')?.data;
  const status = preflight?.status;
  const decisions = events.filter(event => event.type === 'decision');
  const actions = events.flatMap((event): ReportDrivenAction[] => {
    const data = event.data;
    if (event.type === 'search') {
      return [{ stepId: String(data.stepId ?? ''), action: 'scroll',
        ...(typeof data.direction === 'string' ? { direction: data.direction } : {}), decidedBy: 'bridge',
        ...(typeof data.changed === 'boolean' ? { changed: data.changed } : {}) }];
    }
    if (event.type !== 'action') return [];
    const decidedBy = typeof data.decidedBy === 'string' && DECIDERS.has(data.decidedBy) ? data.decidedBy as DecidedBy : 'script';
    return [{ stepId: String(data.stepId ?? ''), action: String(data.action ?? ''),
      ...(typeof data.resolvedRef === 'string' ? { ref: data.resolvedRef } : {}),
      ...(typeof data.valueKey === 'string' ? { valueKey: data.valueKey } : {}),
      ...(typeof data.direction === 'string' ? { direction: data.direction } : {}),
      ...(typeof data.x === 'number' && typeof data.y === 'number' ? { x: data.x, y: data.y } : {}),
      decidedBy,
      ...(decidedBy === 'jev' && typeof data.key === 'string' ? { key: data.key } : {}),
      ...(decidedBy === 'jev' && typeof data.confidence === 'number' ? { confidence: data.confidence } : {}),
      ...(data.retry === true ? { retry: true as const } : {}) }];
  });
  const handbacks = events.flatMap((event): ReportHandback[] => {
    if (event.type !== 'handback') return [];
    const pauseId = event.data.pauseId;
    const answer = typeof pauseId !== 'string' ? undefined : events.find(candidate => candidate.type === 'handback_answer' &&
      candidate.sequence > event.sequence && candidate.data.pauseId === pauseId);
    return [{ stepId: String(event.data.stepId ?? ''), reason: String(event.data.reason ?? ''),
      answer: typeof answer?.data.kind === 'string' ? answer.data.kind : null,
      waitMs: answer ? Math.max(0, Date.parse(answer.at) - Date.parse(event.at)) || 0 : null,
      event: event.sequence }];
  });
  return {
    start: started?.start === 'attach' ? 'attach' : 'restart',
    preflight: status === 'ok' || status === 'missing' || status === 'failed' ? {
      status, exitCode: count(preflight!.exitCode),
      ...(typeof preflight!.failure === 'string' ? { failure: preflight!.failure } : {}),
      durationMs: count(preflight!.durationMs) ?? 0 } : null,
    decisions: decisions.length,
    decisionInputTokens: decisions.reduce((sum, event) => sum + (count(event.data.inputTokens) ?? 0), 0),
    actions,
    doSteps: doStepsOf(events),
    handbacks,
  };
}

/** Build the frozen report from recorded events. The recorded verdict is authoritative. */
export function buildReportJson(events: RunEvent[]): ReportJson {
  if (!events.length) throw new Error('Scripted run log is empty');
  const started = events.find(event => event.type === 'started');
  const verdictEvent = events.findLast(event => event.type === 'verdict');
  const final = verdictEvent?.data;
  const recorded = final?.verdict;
  const verdict: Verdict = recorded === 'passed' || recorded === 'failed' ? recorded : 'inconclusive';
  const reason: ReasonCode = !verdictEvent ? 'INTERRUPTED' : isReasonCode(final?.reason) ? final.reason : 'INTERNAL_ERROR';
  const lastError = events.findLast(event => event.type === 'error');
  const checkpoints: ReportCheckpoint[] = events.filter(event => event.type === 'checkpoint').map(event => {
    const observed = events.findLast(candidate => candidate.type === 'step' && candidate.sequence < event.sequence &&
      candidate.data.stepId === event.data.stepId);
    const claims = Array.isArray(event.data.assertions) ? event.data.assertions.flatMap(item => {
      const claim = item as Record<string, unknown>;
      return typeof claim.id === 'string' && typeof claim.claim === 'string' && typeof claim.probability === 'number'
        ? [{ id: claim.id, claim: claim.claim, probability: claim.probability }] : [];
    }) : [];
    const status = event.data.status;
    return {
      stepId: String(event.data.stepId ?? ''),
      status: status === 'passed' || status === 'failed' ? status : 'inconclusive',
      claims,
      screenshot: text(observed?.data.screenshotPath),
      evidenceEvent: observed?.sequence ?? null,
    };
  });
  const judged = events.find(event => event.type === 'judgment' && typeof event.data.model === 'string');
  const planned = started?.data.plannedSteps;
  const steps = count(final?.steps) ?? Math.max(0, ...events
    .filter(event => event.type === 'step' && Number.isSafeInteger(event.data.step))
    .map(event => event.data.step as number));
  const driven = drivenReportOf(events);
  return {
    reportVersion: REPORT_VERSION,
    runId: events[0]!.runId,
    bridgeVersion: text(started?.data.bridgeVersion) ?? BRIDGE_VERSION,
    jevModel: text(started?.data.jevModel) ?? text(judged?.data.model),
    projectionRule: text(started?.data.projectionRule),
    bundleId: text(started?.data.bundleId),
    launchArgs: Array.isArray(started?.data.launchArgs)
      ? started.data.launchArgs.filter((argument): argument is string => typeof argument === 'string') : [],
    verdict,
    reason,
    error: lastError ? {
      code: isReasonCode(lastError.data.code) ? lastError.data.code : 'EXECUTION_ERROR',
      phase: text(lastError.data.phase),
      stepId: text(lastError.data.stepId),
      ...(typeof lastError.data.vendorCode === 'string' ? { vendorCode: lastError.data.vendorCode } : {}),
    } : null,
    steps,
    plannedSteps: Array.isArray(planned) ? planned.length : null,
    checkpointsPassed: count(final?.checkpointsPassed) ?? checkpoints.filter(checkpoint => checkpoint.status === 'passed').length,
    checkpointCount: count(final?.checkpointCount),
    inputTokens: count(final?.inputTokens) ?? 0,
    durationMs: count(final?.durationMs) ?? 0,
    startedAt: events[0]!.at,
    finishedAt: verdictEvent?.at ?? null,
    checkpoints,
    evidence: {
      log: 'run.jsonl',
      screenshots: events.flatMap(event => event.type === 'step' && typeof event.data.screenshotPath === 'string'
        ? [event.data.screenshotPath] : []),
    },
    ...androidReportFields(started, events),
    ...(driven ? { driven } : {}),
  };
}
