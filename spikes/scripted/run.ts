import { setTimeout as delay } from 'node:timers/promises';
import type { Action, DeviceDriver, Element, RunLog, Scenario, Snapshot, Verdict } from '../../src/contracts/index.js';
import { DeviceCliError, StaleSnapshotError } from '../../src/device/index.js';
import type { AssertionJudgment, ScriptedJudge, ScriptedScenario, ScriptedStep } from './contracts.js';
import { SCRIPTED_JEV_MODEL } from './jev.js';
import { renderAssertionState, ScriptedObservationError } from './observe.js';
import { buildScriptedReport, type ScriptedReport } from './report.js';
import { parseScriptedScenario } from './schema.js';
import { assertScreenGuard, resolveActionTarget, ScriptSelectionError,
  type SelectionOptions } from './select.js';

export interface ScriptedRunLimits {
  maxSteps?: number;
  wallTimeMs?: number;
  pollIntervalMs?: number;
  cleanupTimeMs?: number;
}

export interface ScriptedRunOptions {
  runId: string;
  scenario: ScriptedScenario;
  driver: DeviceDriver;
  judge: ScriptedJudge;
  log: RunLog;
  signal?: AbortSignal;
  limits?: ScriptedRunLimits;
  /** Set only by a driver integration whose pinned tap semantics were verified. */
  tapAliasRule?: SelectionOptions['tapAliasRule'];
}

class ScriptRunError extends Error {
  constructor(readonly code: 'CANCELLED' | 'WALL_LIMIT' | 'STEP_LIMIT' | 'WAIT_TIMEOUT' | 'SCREEN_CHANGED' |
    'INVALID_JUDGMENT' | 'EXECUTION_ERROR' | 'CLEANUP_FAILED') {
    super(code);
    this.name = 'ScriptRunError';
  }
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) throw new RangeError('Invalid script run limit');
  return selected;
}

function driverScenario(script: ScriptedScenario): Scenario {
  return { app: script.app, values: script.values,
    ...(script.device ? { device: script.device } : {}),
    ...(script.preconditions ? { preconditions: script.preconditions } : {}),
    goal: 'Execute the supplied action script', assertions: [{ id: 'script', claim: 'The action script completes' }] };
}

function snapshotChanged(before: Snapshot, after: Snapshot): boolean {
  if (before.screenHash && after.screenHash) return before.screenHash !== after.screenHash;
  const identity = (snapshot: Snapshot) => JSON.stringify(snapshot.elements.map(({ ref: _ref, ...element }) => element));
  return identity(before) !== identity(after);
}

function summary(snapshot: Snapshot): string {
  return snapshot.elements.filter(element => element.state?.visible === true && element.frame &&
    element.frame.width > 0 && element.frame.height > 0)
    .map(element => [element.role, element.label, element.value].filter(Boolean).join(' '))
    .filter(Boolean).slice(0, 48).join('\n').slice(0, 4_000);
}

function requiredAction(step: Extract<ScriptedStep, { kind: 'action' }>): 'tap' | 'typeText' | 'swipeWithin' {
  return step.action.kind === 'replaceText' ? 'typeText' : step.action.kind === 'swipe' ? 'swipeWithin' : 'tap';
}

function deviceAction(step: Extract<ScriptedStep, { kind: 'action' }>, target: Element): Action {
  if (step.action.kind === 'replaceText') return { kind: 'type', targetRef: target.ref, valueKey: step.action.valueKey };
  if (step.action.kind === 'swipe') return { kind: 'swipe', targetRef: target.ref, direction: step.action.direction };
  return { kind: 'tap', targetRef: target.ref };
}

function abortableOperation<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    let pending: Promise<T>;
    try { pending = operation(); }
    catch (error) { signal.removeEventListener('abort', onAbort); reject(error); return; }
    pending.then(value => { signal.removeEventListener('abort', onAbort); resolve(value); },
      error => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}

function checkedJudgment(judgment: AssertionJudgment, assertions: Extract<ScriptedStep, { kind: 'checkpoint' }>['assertions']): void {
  if (!Number.isSafeInteger(judgment.inputTokens) || judgment.inputTokens < 0 ||
      !Number.isFinite(judgment.latencyMs) || judgment.latencyMs < 0 ||
      judgment.model !== SCRIPTED_JEV_MODEL ||
      Object.keys(judgment.probabilities).length !== assertions.length) throw new ScriptRunError('INVALID_JUDGMENT');
  for (const assertion of assertions) {
    const answer = judgment.probabilities[assertion.id];
    if (typeof answer !== 'number' || !Number.isFinite(answer) || answer < 0 || answer > 1) {
      throw new ScriptRunError('INVALID_JUDGMENT');
    }
  }
}

function safeCode(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) return signal.reason instanceof ScriptRunError ? signal.reason.code : 'CANCELLED';
  if (error instanceof ScriptRunError || error instanceof ScriptSelectionError || error instanceof ScriptedObservationError) return error.code;
  if (error instanceof DeviceCliError) return /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'DEVICE_ERROR';
  return 'EXECUTION_ERROR';
}

async function waitUntil(step: Extract<ScriptedStep, { kind: 'wait' }>, initial: Snapshot,
  pollIntervalMs: number, pause: (milliseconds: number) => Promise<void>,
  capture: () => Promise<{ snapshot: Snapshot; observeDurationMs: number }>,
  onObserved: (snapshot: Snapshot, poll: number, observeDurationMs: number) => Promise<void>,
  selectionOptions: SelectionOptions): Promise<void> {
  const started = performance.now();
  let current = initial;
  let poll = 0;
  while (true) {
    try { assertScreenGuard(current, step.until, selectionOptions); return; }
    catch (error) {
      if (!(error instanceof ScriptSelectionError) || !['GUARD_MISSING', 'GUARD_FORBIDDEN'].includes(error.code)) throw error;
    }
    assertScreenGuard(current, step.guard, selectionOptions);
    const left = step.timeoutMs - (performance.now() - started);
    if (left <= 0) throw new ScriptRunError('WAIT_TIMEOUT');
    await pause(Math.min(pollIntervalMs, left));
    const captured = await capture();
    current = captured.snapshot;
    poll++;
    await onObserved(current, poll, captured.observeDurationMs);
  }
}

/** Experimental bridge-owned execution of a fully authored action script. */
export async function runScriptedScenario(options: ScriptedRunOptions): Promise<ScriptedReport> {
  const script = parseScriptedScenario(options.scenario);
  const limits = options.limits ?? {};
  const maxSteps = bounded(limits.maxSteps, 100, 1, 100);
  const wallTimeMs = bounded(limits.wallTimeMs, 300_000, 1, 3_600_000);
  const pollIntervalMs = bounded(limits.pollIntervalMs, 250, 1, 5_000);
  const cleanupTimeMs = bounded(limits.cleanupTimeMs, 10_000, 1, 60_000);
  const context = driverScenario(script);
  const selectionOptions: SelectionOptions = options.tapAliasRule
    ? { tapAliasRule: options.tapAliasRule } : {};
  const started = performance.now();
  const controller = new AbortController();
  const signal = controller.signal;
  const cancel = () => controller.abort(new ScriptRunError('CANCELLED'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new ScriptRunError('WALL_LIMIT')), wallTimeMs);
  let verdict: Verdict = 'inconclusive';
  let reason = 'SCRIPT_INCOMPLETE';
  let steps = 0;
  let inputTokens = 0;
  let checkpointsPassed = 0;
  let phase = 'prepare';
  let activeStepId: string | undefined;
  let activeStepStarted: number | undefined;
  const phaseTimingsMs = { prepareMs: 0, observeMs: 0, decideMs: 0,
    actMs: 0, waitMs: 0, cleanupMs: 0 };
  type TimedPhase = keyof typeof phaseTimingsMs;
  const timed = async <T>(key: TimedPhase, operation: () => Promise<T>,
    onMeasured?: (durationMs: number) => void): Promise<T> => {
    const began = performance.now();
    try { return await operation(); }
    finally {
      const durationMs = Math.max(0, performance.now() - began);
      phaseTimingsMs[key] += durationMs;
      onMeasured?.(durationMs);
    }
  };
  const capture = async (): Promise<{ snapshot: Snapshot; observeDurationMs: number }> => {
    let observeDurationMs = 0;
    const snapshot = await timed('observeMs', () => abortableOperation(() => options.driver.observe(signal), signal),
      durationMs => { observeDurationMs = durationMs; });
    return { snapshot, observeDurationMs };
  };

  try {
    await options.log.append('started', { mode: 'scripted', bundleId: script.app.bundleId,
      plannedSteps: script.steps.map(step => ({ id: step.id, kind: step.kind })) });
    let prepareDurationMs = 0;
    await timed('prepareMs', () => abortableOperation(() => options.driver.prepare(context, signal), signal),
      durationMs => { prepareDurationMs = durationMs; });
    await options.log.append('prepared', { prepareDurationMs });
    for (const step of script.steps) {
      activeStepId = undefined;
      activeStepStarted = undefined;
      phase = 'budget';
      if (signal.aborted) throw signal.reason;
      if (steps >= maxSteps) throw new ScriptRunError('STEP_LIMIT');
      activeStepId = step.id;
      activeStepStarted = performance.now();
      steps++;
      phase = 'observe';
      const { snapshot, observeDurationMs } = await capture();
      await options.log.append('step', { step: steps, stepId: step.id, kind: step.kind,
        snapshotSequence: snapshot.sequence, observationSummary: summary(snapshot), observeDurationMs,
        ...(snapshot.screenshotPath ? { screenshotPath: snapshot.screenshotPath } : {}),
        ...(snapshot.logTails ? { logTails: snapshot.logTails } : {}) });
      assertScreenGuard(snapshot, step.guard, selectionOptions);

      if (step.kind === 'action') {
        phase = 'act';
        const target = resolveActionTarget(snapshot, step.action.selector, requiredAction(step), selectionOptions);
        let selected = snapshot;
        let ref = target;
        let actDurationMs = 0;
        const act = async () => timed('actMs',
          () => abortableOperation(() => options.driver.act(deviceAction(step, ref), selected, context, signal), signal),
          durationMs => { actDurationMs += durationMs; });
        try { await act(); }
        catch (error) {
          if (!(error instanceof StaleSnapshotError)) throw error;
          phase = 'reobserve';
          const refreshed = await capture();
          const fresh = refreshed.snapshot;
          await options.log.append('step', { step: steps, stepId: step.id, kind: step.kind, attempt: 2,
            snapshotSequence: fresh.sequence, observationSummary: summary(fresh),
            observeDurationMs: refreshed.observeDurationMs,
            ...(fresh.screenshotPath ? { screenshotPath: fresh.screenshotPath } : {}),
            ...(fresh.logTails ? { logTails: fresh.logTails } : {}) });
          if (snapshotChanged(snapshot, fresh)) throw new ScriptRunError('SCREEN_CHANGED');
          assertScreenGuard(fresh, step.guard, selectionOptions);
          ref = resolveActionTarget(fresh, step.action.selector, requiredAction(step), selectionOptions);
          selected = fresh;
          phase = 'act';
          await act();
        }
        await options.log.append('action', { step: steps, stepId: step.id, action: step.action.kind,
          selector: step.action.selector, resolvedRef: ref.ref, actDurationMs,
          stepDurationMs: Math.max(0, performance.now() - activeStepStarted) });
        continue;
      }

      if (step.kind === 'wait') {
        phase = 'wait';
        const waitBefore = phaseTimingsMs.waitMs;
        await waitUntil(step, snapshot, pollIntervalMs,
          milliseconds => timed('waitMs', () => abortableOperation(
            () => delay(milliseconds, undefined, { signal }), signal)), capture,
          async (observed, poll, observedDurationMs) => {
          await options.log.append('step', { step: steps, stepId: step.id, kind: step.kind, poll,
            snapshotSequence: observed.sequence, observationSummary: summary(observed),
            observeDurationMs: observedDurationMs,
            ...(observed.screenshotPath ? { screenshotPath: observed.screenshotPath } : {}),
            ...(observed.logTails ? { logTails: observed.logTails } : {}) });
        }, selectionOptions);
        await options.log.append('action', { step: steps, stepId: step.id, action: 'wait', timeoutMs: step.timeoutMs,
          waitDurationMs: phaseTimingsMs.waitMs - waitBefore,
          stepDurationMs: Math.max(0, performance.now() - activeStepStarted) });
        continue;
      }

      phase = 'decide';
      let decideDurationMs = 0;
      const judgment = await timed('decideMs', async () => {
        const state = renderAssertionState(snapshot);
        const result = await abortableOperation(() => options.judge.judge(step.assertions, state, signal), signal);
        checkedJudgment(result, step.assertions);
        return result;
      }, durationMs => { decideDurationMs = durationMs; });
      inputTokens += judgment.inputTokens;
      await options.log.append('judgment', { step: steps, stepId: step.id, model: judgment.model,
        probabilities: judgment.probabilities, inputTokens: judgment.inputTokens, latencyMs: judgment.latencyMs,
        decideDurationMs });
      const answers = step.assertions.map(assertion => judgment.probabilities[assertion.id]!);
      const status = answers.some(value => value > 0.1 && value < 0.9) ? 'inconclusive' :
        answers.some(value => value <= 0.1) ? 'failed' : 'passed';
      await options.log.append('checkpoint', { step: steps, stepId: step.id, status,
        stepDurationMs: Math.max(0, performance.now() - activeStepStarted),
        assertions: step.assertions.map(assertion => ({ id: assertion.id, claim: assertion.claim,
          probability: judgment.probabilities[assertion.id] })) });
      if (status !== 'passed') {
        verdict = status;
        reason = status === 'failed' ? 'ASSERTION_FALSE' : 'ASSERTION_UNCERTAIN';
        break;
      }
      checkpointsPassed++;
    }
    if (checkpointsPassed === script.steps.filter(step => step.kind === 'checkpoint').length &&
        steps === script.steps.length && verdict === 'inconclusive' && reason === 'SCRIPT_INCOMPLETE') {
      verdict = 'passed';
      reason = 'ALL_CHECKPOINTS_PASSED';
    }
  } catch (error) {
    verdict = 'inconclusive';
    reason = safeCode(error, signal);
    await options.log.append('error', { stepId: activeStepId, phase, code: reason,
      ...(activeStepStarted === undefined ? {} : {
        stepDurationMs: Math.max(0, performance.now() - activeStepStarted),
      }) });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    try {
      const cleanupSignal = AbortSignal.timeout(cleanupTimeMs);
      await timed('cleanupMs', () => abortableOperation(() => options.driver.close(cleanupSignal), cleanupSignal));
    } catch {
      verdict = 'inconclusive';
      reason = 'CLEANUP_FAILED';
      await options.log.append('error', { phase: 'cleanup', code: reason });
    }
    await options.log.append('verdict', { verdict, reason, steps, inputTokens,
      durationMs: Math.max(0, performance.now() - started), checkpointsPassed,
      checkpointCount: script.steps.filter(step => step.kind === 'checkpoint').length, phaseTimingsMs,
      ...(options.driver.metrics ? { deviceMetrics: options.driver.metrics() } : {}) });
  }
  return buildScriptedReport(await options.log.read());
}
