import { setTimeout as delay } from 'node:timers/promises';
import type { Checkpoint, CheckpointScenario, DeviceDriver, HistoryEntry, JevJudge, Judgment, Observation, RunLog, RunReport, RunScenario, Scenario, Snapshot, Verdict } from '../contracts/index.js';
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
  scenario: RunScenario;
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

function activeScenario(run: RunScenario, checkpoint: Checkpoint): Scenario {
  return {
    app: run.app,
    values: checkpoint.values ?? {},
    ...(run.preconditions ? { preconditions: run.preconditions } : {}),
    ...(run.device ? { device: run.device } : {}),
    goal: checkpoint.goal,
    assertions: checkpoint.assertions,
  };
}

function hasCheckpoints(run: RunScenario): run is CheckpointScenario {
  return Array.isArray(run.checkpoints);
}

/** Provisional policy. Ticket 11 must replace defaults using feasibility measurements. */
export async function runScenario(options: RunOptions): Promise<RunReport> {
  const scenario = parseScenario(options.scenario);
  const explicitCheckpoints = hasCheckpoints(scenario);
  const checkpoints: Checkpoint[] = explicitCheckpoints ? scenario.checkpoints :
    [{ id: 'scenario', goal: scenario.goal, assertions: scenario.assertions, values: scenario.values }];
  const limits = options.limits ?? {};
  const maxSteps = boundedNumber(limits.maxSteps, 20, 1, 1_000, 'maxSteps');
  const wallTimeMs = boundedNumber(limits.wallTimeMs, 300_000, 1, 3_600_000, 'wallTimeMs');
  const minConfidence = boundedNumber(limits.minChoiceConfidence, 0.7, 0, 1, 'minChoiceConfidence');
  const yes = boundedNumber(limits.yesProbability, 0.9, 0, 1, 'yesProbability');
  const no = boundedNumber(limits.noProbability, 0.1, 0, 1, 'noProbability');
  const waitMs = boundedNumber(limits.waitMs, 1_000, 0, 60_000, 'waitMs');
  const cleanupTimeMs = boundedNumber(limits.cleanupTimeMs, 10_000, 1, 60_000, 'cleanupTimeMs');
  if (no >= yes) throw new RangeError('noProbability must be below yesProbability');
  const startedAt = performance.now();
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
  let checkpointIndex = 0;
  let checkpointsPassed = 0;
  const timings = { prepareMs: 0, observeMs: 0, decideMs: 0, actMs: 0 };
  type MeasuredPhase = 'prepare' | 'observe' | 'decide' | 'act';
  let phase: MeasuredPhase | undefined;
  let phaseMs: number | undefined;
  const deviceMetrics = () => options.driver.metrics?.();
  const metricEventData = () => {
    const metrics = deviceMetrics();
    return metrics ? { deviceMetrics: metrics } : {};
  };
  const measure = async <T>(name: MeasuredPhase, operation: () => Promise<T>): Promise<{ value: T; ms: number }> => {
    const started = performance.now();
    const key = `${name}Ms` as keyof typeof timings;
    phase = name;
    phaseMs = undefined;
    try {
      const value = await awaitWithAbort(operation, signal);
      const ms = Math.max(0, performance.now() - started);
      timings[key] += ms;
      phase = undefined;
      return { value, ms };
    } catch (error) {
      phaseMs = Math.max(0, performance.now() - started);
      timings[key] += phaseMs;
      throw error;
    }
  };

  try {
    await options.log.append('started', { bundleId: scenario.app.bundleId,
      ...(explicitCheckpoints
        ? { checkpoints: checkpoints.map(({ id, goal, assertions }) => ({ id, goal, assertions })) }
        : { goal: checkpoints[0]!.goal, assertions: checkpoints[0]!.assertions }) });
    const prepared = await measure('prepare', () => options.driver.prepare(scenario, signal));
    await options.log.append('prepared', { prepareMs: prepared.ms });
    for (let step = 1; step <= maxSteps; step++) {
      if (signal.aborted) throw signal.reason;
      const checkpoint = checkpoints[checkpointIndex]!;
      const active = activeScenario(scenario, checkpoint);
      const checkpointData = explicitCheckpoints ? { checkpointId: checkpoint.id, checkpointIndex: checkpointIndex + 1 } : {};
      const observed = await measure('observe', () => options.driver.observe(signal));
      const snapshot = observed.value;
      const screen = screenFingerprint(snapshot);
      repeatedScreen = screen === previousScreen ? repeatedScreen + 1 : 0;
      previousScreen = screen;
      if (repeatedScreen >= 3) {
        reason = 'Screen repeated without progress';
        break;
      }
      const observation = observe(active, snapshot, history, { ...options.observationOptions, step });
      steps = step;
      await options.log.append('step', {
        step,
        ...checkpointData,
        observeMs: observed.ms,
        observationSummary: observation.text.slice(0, 4_000),
        ...(snapshot.screenshotPath ? { screenshotPath: snapshot.screenshotPath } : {}),
        ...(snapshot.logTails ? { logTails: snapshot.logTails } : {}),
      });
      if (snapshot.truncated) {
        reason = 'Snapshot omitted actionable elements';
        break;
      }
      const decided = await measure('decide', async () => {
        const result = await options.judge.judge(active, observation, signal);
        validateJudgment(result, active);
        return result;
      });
      const judgment = decided.value;
      inputTokens += judgment.inputTokens;
      await options.log.append('judgment', { step, ...checkpointData, judgment, decideMs: decided.ms });
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
        const answers = active.assertions.map(assertion => judgment.assertions[assertion.id]!);
        const checkpointVerdict = answers.every(value => value >= yes) ? 'passed' :
          answers.some(value => value > no && value < yes) ? 'inconclusive' : 'failed';
        await options.log.append('action', { step, ...checkpointData, action, description: option.description, actMs: 0, ...metricEventData() });
        if (checkpointVerdict !== 'passed') {
          verdict = checkpointVerdict;
          reason = checkpointVerdict === 'failed' ? 'Goal reached but an assertion is false' : 'Goal reached but an assertion is uncertain';
          break;
        }
        if (explicitCheckpoints) {
          await options.log.append('checkpoint', {
            checkpointId: checkpoint.id,
            checkpointIndex: checkpointIndex + 1,
            step,
            snapshotSequence: snapshot.sequence,
            deviceId: snapshot.deviceId,
            status: 'passed',
            goalReachedProbability: judgment.goalReached,
            assertions: active.assertions.map(assertion => ({
              id: `${checkpoint.id}:${assertion.id}`,
              claim: assertion.claim,
              probability: judgment.assertions[assertion.id],
            })),
          });
        }
        checkpointsPassed++;
        if (checkpointIndex === checkpoints.length - 1) {
          verdict = 'passed';
          reason = explicitCheckpoints ? 'Every checkpoint goal and assertion holds' : 'Goal reached and every assertion holds';
          break;
        }
        checkpointIndex++;
        previousScreen = '';
        repeatedScreen = 0;
        history.push({ step, description: `Checkpoint ${checkpoint.id} passed: ${checkpoint.goal}` });
        if (step === maxSteps) reason = `Step limit ${maxSteps} reached`;
        continue;
      }
      if (done !== 'no') { reason = 'Continuing action contradicted the completion judgment'; break; }
      if (action.kind === 'stop-blocked') {
        reason = 'Jev observed a blocker; no production failure rule is settled';
        await options.log.append('action', { step, ...checkpointData, action, description: option.description, actMs: 0, ...metricEventData() });
        break;
      }
      let acted;
      try {
        acted = await measure('act', () => action.kind === 'wait'
          ? delay(waitMs, undefined, { signal })
          : options.driver.act(action, snapshot, active, signal));
      } catch (error) {
        if (error instanceof StaleSnapshotError) {
          await options.log.append('error', { message: error.message, step, ...checkpointData, phase: 'act', phaseMs, ...metricEventData() });
          phase = undefined;
          phaseMs = undefined;
          history.push({ step, description: 'Screen changed before action; reobserve and rejudge' });
          continue;
        }
        throw error;
      }
      await options.log.append('action', { step, ...checkpointData, action, description: option.description, actMs: acted.ms, ...metricEventData() });
      history.push({ step, description: option.description });
      if (step === maxSteps) reason = `Step limit ${maxSteps} reached`;
    }
  } catch (error) {
    reason = error instanceof RunAbortError ? error.message : `Run error: ${message(error)}`;
    await options.log.append('error', { message: reason,
      ...(phase ? { phase, phaseMs } : {}), ...metricEventData() });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    const cleanupStarted = performance.now();
    let cleanupMs: number | undefined;
    try {
      const cleanup = new AbortController();
      const cleanupTimer = setTimeout(() => cleanup.abort(new Error('Device cleanup timed out')), cleanupTimeMs);
      try { await awaitWithAbort(() => options.driver.close(cleanup.signal), cleanup.signal); }
      finally { clearTimeout(cleanupTimer); }
    } catch (error) {
      cleanupMs = Math.max(0, performance.now() - cleanupStarted);
      verdict = 'inconclusive';
      reason = `Device cleanup failed: ${message(error)}`;
      await options.log.append('error', { message: reason, phase: 'cleanup', phaseMs: cleanupMs, ...metricEventData() });
    }
    cleanupMs ??= Math.max(0, performance.now() - cleanupStarted);
    await options.log.append('verdict', { verdict, reason, steps, inputTokens,
      durationMs: Math.max(0, performance.now() - startedAt), timings, cleanupMs,
      ...(explicitCheckpoints ? { checkpointsPassed, checkpointCount: checkpoints.length } : {}), ...metricEventData() });
  }
  return buildReport(await options.log.read());
}
