import { setTimeout as delay } from 'node:timers/promises';
import type { DeviceDriver, HistoryEntry, JevJudge, Judgment, Observation, RunLog, RunReport, Scenario, Snapshot, Verdict } from '../contracts/index.js';
import { buildObservation, type ObservationBuildOptions } from '../observation/index.js';
import { buildReport } from '../report/index.js';
import { parseScenario } from '../scenario/index.js';
import { StaleSnapshotError } from '../device/index.js';

export interface RunLimits {
  maxSteps?: number;
  wallTimeMs?: number;
  minChoiceConfidence?: number;
  yesProbability?: number;
  noProbability?: number;
  waitMs?: number;
  cleanupTimeMs?: number;
}

export interface RunOptions {
  runId: string;
  scenario: Scenario;
  driver: DeviceDriver;
  judge: JevJudge;
  log: RunLog;
  signal?: AbortSignal;
  limits?: RunLimits;
  observationOptions?: ObservationBuildOptions;
  observationBuilder?: (scenario: Scenario, snapshot: Snapshot, history: HistoryEntry[], options: ObservationBuildOptions) => Observation;
}

class RunAbortError extends Error {
  constructor(readonly reason: 'cancelled' | 'deadline') {
    super(reason === 'deadline' ? 'Run wall-time limit reached' : 'Run cancelled');
    this.name = 'RunAbortError';
  }
}

function boundedNumber(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  const n = value ?? fallback;
  if (!Number.isFinite(n) || n < min || n > max) throw new RangeError(`${name} must be between ${min} and ${max}`);
  return n;
}

function probability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateJudgment(judgment: Judgment, scenario: Scenario): void {
  if (!judgment.choice || !probability(judgment.confidence) || !probability(judgment.goalReached)) {
    throw new Error('Jev returned an invalid action or probability');
  }
  if (!Number.isSafeInteger(judgment.inputTokens) || judgment.inputTokens < 0) throw new Error('Jev returned invalid token usage');
  for (const assertion of scenario.assertions) {
    if (!probability(judgment.assertions[assertion.id]!)) throw new Error(`Jev omitted or invalidated assertion ${assertion.id}`);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function awaitWithAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    let pending: Promise<T>;
    try { pending = operation(); }
    catch (error) { signal.removeEventListener('abort', onAbort); reject(error); return; }
    pending.then(
      value => { signal.removeEventListener('abort', onAbort); resolve(value); },
      error => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

function screenFingerprint(snapshot: Snapshot): string {
  return JSON.stringify(snapshot.elements
    .filter(element => !/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`))
    .map(({ ref: _ref, frame: _frame, ...element }) => element));
}

/** Provisional policy. Ticket 11 must replace defaults using feasibility measurements. */
export async function runScenario(options: RunOptions): Promise<RunReport> {
  const scenario = parseScenario(options.scenario);
  const limits = options.limits ?? {};
  const maxSteps = boundedNumber(limits.maxSteps, 20, 1, 1_000, 'maxSteps');
  const wallTimeMs = boundedNumber(limits.wallTimeMs, 300_000, 1, 3_600_000, 'wallTimeMs');
  const minConfidence = boundedNumber(limits.minChoiceConfidence, 0.7, 0, 1, 'minChoiceConfidence');
  const yes = boundedNumber(limits.yesProbability, 0.9, 0, 1, 'yesProbability');
  const no = boundedNumber(limits.noProbability, 0.1, 0, 1, 'noProbability');
  const waitMs = boundedNumber(limits.waitMs, 1_000, 0, 60_000, 'waitMs');
  const cleanupTimeMs = boundedNumber(limits.cleanupTimeMs, 10_000, 1, 60_000, 'cleanupTimeMs');
  if (no >= yes) throw new RangeError('noProbability must be below yesProbability');
  const startedAt = Date.now();
  const controller = new AbortController();
  const cancel = () => controller.abort(new RunAbortError('cancelled'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new RunAbortError('deadline')), wallTimeMs);
  const signal = controller.signal;
  const observe = options.observationBuilder ?? buildObservation;
  const history: HistoryEntry[] = [];
  let steps = 0;
  let inputTokens = 0;
  let verdict: Verdict = 'inconclusive';
  let reason = 'Run ended without a definitive verdict';
  let previousScreen = '';
  let repeatedScreen = 0;

  try {
    await options.log.append('started', { goal: scenario.goal, bundleId: scenario.app.bundleId });
    await awaitWithAbort(() => options.driver.prepare(scenario, signal), signal);
    await options.log.append('prepared', {});
    for (let step = 1; step <= maxSteps; step++) {
      if (signal.aborted) throw signal.reason;
      const snapshot = await awaitWithAbort(() => options.driver.observe(signal), signal);
      const screen = screenFingerprint(snapshot);
      repeatedScreen = screen === previousScreen ? repeatedScreen + 1 : 0;
      previousScreen = screen;
      if (repeatedScreen >= 3) {
        reason = 'Screen repeated without progress';
        break;
      }
      const observation = observe(scenario, snapshot, history, { ...options.observationOptions, step });
      steps = step;
      await options.log.append('step', {
        step,
        observationSummary: observation.text.slice(0, 4_000),
        ...(snapshot.screenshotPath ? { screenshotPath: snapshot.screenshotPath } : {}),
      });
      if (snapshot.truncated) {
        reason = 'Snapshot omitted actionable elements';
        break;
      }
      const judgment = await awaitWithAbort(() => options.judge.judge(scenario, observation, signal), signal);
      validateJudgment(judgment, scenario);
      inputTokens += judgment.inputTokens;
      await options.log.append('judgment', { step, judgment });
      const option = observation.options.find(candidate => candidate.id === judgment.choice);
      if (!option || option.action.kind === 'none') {
        reason = 'Jev abstained or selected an unknown action';
        break;
      }
      if (judgment.confidence < minConfidence) {
        reason = `Choice confidence ${judgment.confidence} is below ${minConfidence}`;
        break;
      }
      const done = judgment.goalReached >= yes ? 'yes' : judgment.goalReached <= no ? 'no' : 'uncertain';
      if (done === 'uncertain') {
        reason = 'Jev could not establish whether the goal was reached';
        break;
      }
      const action = option.action;
      if (action.kind === 'stop-goal') {
        if (done !== 'yes') { reason = 'Stop goal contradicted the completion judgment'; break; }
        const answers = scenario.assertions.map(assertion => judgment.assertions[assertion.id]!);
        verdict = answers.every(value => value >= yes) ? 'passed' : answers.some(value => value > no && value < yes) ? 'inconclusive' : 'failed';
        reason = verdict === 'passed' ? 'Goal reached and every assertion holds'
          : verdict === 'failed' ? 'Goal reached but an assertion is false' : 'Goal reached but an assertion is uncertain';
        await options.log.append('action', { step, action, description: option.description });
        break;
      }
      if (done !== 'no') { reason = 'Continuing action contradicted the completion judgment'; break; }
      if (action.kind === 'stop-blocked') {
        reason = 'Jev observed a blocker; no production failure rule is settled';
        await options.log.append('action', { step, action, description: option.description });
        break;
      }
      if (action.kind === 'wait') {
        await awaitWithAbort(() => delay(waitMs, undefined, { signal }), signal);
      } else {
        try {
          await awaitWithAbort(() => options.driver.act(action, snapshot, scenario, signal), signal);
        } catch (error) {
          if (error instanceof StaleSnapshotError) {
            await options.log.append('error', { message: error.message, step });
            history.push({ step, description: 'Screen changed before action; reobserve and rejudge' });
            continue;
          }
          throw error;
        }
      }
      await options.log.append('action', { step, action, description: option.description });
      history.push({ step, description: option.description });
      if (step === maxSteps) reason = `Step limit ${maxSteps} reached`;
    }
  } catch (error) {
    reason = error instanceof RunAbortError ? error.message : `Run error: ${message(error)}`;
    await options.log.append('error', { message: reason });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    try {
      const cleanup = new AbortController();
      const cleanupTimer = setTimeout(() => cleanup.abort(new Error('Device cleanup timed out')), cleanupTimeMs);
      try { await awaitWithAbort(() => options.driver.close(cleanup.signal), cleanup.signal); }
      finally { clearTimeout(cleanupTimer); }
    } catch (error) {
      verdict = 'inconclusive';
      reason = `Device cleanup failed: ${message(error)}`;
      await options.log.append('error', { message: reason });
    }
    await options.log.append('verdict', { verdict, reason, steps, inputTokens, durationMs: Date.now() - startedAt });
  }
  return buildReport(await options.log.read());
}
