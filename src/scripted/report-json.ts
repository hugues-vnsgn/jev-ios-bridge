import type { RunEvent, Verdict } from '../contracts/index.js';
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
}

const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

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
  };
}
