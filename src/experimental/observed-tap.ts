import { setTimeout as delay } from 'node:timers/promises';
import type { ActionScenarioContext, Snapshot } from '../contracts/index.js';
import type { ScreenGuard, Selector } from '../scripted/contracts.js';
import { resolveActionTarget } from '../scripted/select.js';

export interface ObservedTapResult {
  status: 'outcome_observed' | 'already_satisfied' | 'refused' | 'inconclusive';
  reason?: string;
  actionAttempted: boolean;
  actionAcknowledged: boolean;
  observations: number;
}
export interface ObservedTapOptions {
  deviceId: string;
  actionId: string;
  selector: Selector;
  before: ScreenGuard;
  after: ScreenGuard;
  scenario: ActionScenarioContext;
  timeoutMs: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  prepare?: (signal: AbortSignal) => Promise<void>;
  finish?: (signal: AbortSignal) => Promise<void>;
  onObservation?: (snapshot: Snapshot, index: number) => Promise<void>;
  /** Provisional evidence only: completion can still fail; journal terminal is authoritative. */
  onResult?: (result: ObservedTapResult) => Promise<void>;
  driver: {
    observe(signal: AbortSignal): Promise<Snapshot>;
    tapOnce(ref: string, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<unknown>;
  };
  journal: { begin(input: {deviceId: string; actionId: string; intent: unknown}): Promise<{
    complete(result: unknown): Promise<void>; uncertain(reason: string): Promise<void>;
  }> };
}
function matches(snapshot: Snapshot, selector: Selector) {
  const entries = Object.entries(selector);
  if (!entries.length || entries.some(([key,value]) => !['identifier','role','label','value'].includes(key) || typeof value !== 'string')) throw new Error('INVALID_SELECTOR');
  return snapshot.elements.filter(element => entries.every(([key,value]) => element[key as keyof Selector] === value)
    && element.state?.visible === true && element.frame && element.frame.width > 0 && element.frame.height > 0);
}
function guard(snapshot: Snapshot, condition: ScreenGuard): boolean {
  if (!condition.present.length && !condition.absent?.length) throw new Error('EMPTY_CONDITION');
  let satisfied = true;
  for (const selector of condition.present) {
    const count = matches(snapshot, selector).length;
    if (count > 1) throw new Error('AMBIGUOUS_CONDITION');
    if (count !== 1) satisfied = false;
  }
  for (const selector of condition.absent ?? []) if (matches(snapshot, selector).length) satisfied = false;
  return satisfied;
}
/** Experimental visible evidence only. Resolution never certifies native input consumption or release. */
export async function runObservedTap(options: ObservedTapOptions): Promise<ObservedTapResult> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300000
    || !Number.isSafeInteger(options.pollIntervalMs ?? 100) || (options.pollIntervalMs ?? 100) < 1) throw new RangeError('Invalid observation deadline');
  const deadline = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const result: ObservedTapResult = {status:'refused',actionAttempted:false,actionAcknowledged:false,observations:0};
  const attempt = await options.journal.begin({deviceId:options.deviceId,actionId:options.actionId,
    intent:{selector:options.selector,before:options.before,after:options.after,scenario:options.scenario,
      timeoutMs:options.timeoutMs,pollIntervalMs:options.pollIntervalMs ?? 100}});
  let preparing = false;
  let observing = false;
  const bounded = async <T>(operation: () => Promise<T>, budget = signal): Promise<T> => {
    budget.throwIfAborted();
    return new Promise<T>((resolve,reject) => {
      const abort = () => reject(new Error('DEADLINE_OR_CANCELLED'));
      budget.addEventListener('abort',abort,{once:true});
      Promise.resolve().then(() => {budget.throwIfAborted();return operation();}).then(resolve,reject)
        .finally(() => budget.removeEventListener('abort',abort));
    });
  };
  const capture = async () => {
    observing = true;
    const snapshot = await bounded(() => options.driver.observe(signal));
    observing = false;
    result.observations++;
    if (snapshot.deviceId !== options.deviceId || snapshot.truncated || !Number.isFinite(snapshot.expiresAt) || Date.now() >= snapshot.expiresAt) throw new Error('INVALID_OBSERVATION');
    if (options.onObservation) {
      observing = true;
      await bounded(() => options.onObservation!(snapshot,result.observations));
      observing = false;
    }
    return snapshot;
  };
  try {
    if (options.prepare) {preparing = true; await bounded(() => options.prepare!(signal));preparing = false;}
    const before = await capture();
    if (guard(before,options.after)) result.status = 'already_satisfied';
    else {
      if (!guard(before,options.before)) throw new Error('PRECONDITION_NOT_MET');
      if (matches(before,options.selector).length !== 1) throw new Error('TARGET_NOT_UNIQUE');
      const target = resolveActionTarget(before,options.selector,'tap');
      await bounded(async () => {result.actionAttempted = true;await options.driver.tapOnce(target.ref,before,options.scenario,signal);});
      result.actionAcknowledged = true;
      while (!guard(await capture(),options.after)) await bounded(() => delay(options.pollIntervalMs ?? 100,undefined,{signal}));
      result.status = 'outcome_observed';
    }
  } catch (error) {
    result.status = preparing || observing || result.actionAttempted ? 'inconclusive' : 'refused';
    result.reason = signal.aborted ? 'DEADLINE_OR_CANCELLED' : error instanceof Error ? error.message : 'OBSERVATION_FAILED';
  }
  if (result.status !== 'inconclusive' && options.finish) {
    try { await bounded(() => options.finish!(signal)); }
    catch { result.status = 'inconclusive'; result.reason = 'FINISH_UNCONFIRMED'; }
  }
  if (options.onResult) {
    // Local evidence finalization remains possible after the device deadline or cancellation.
    try { await bounded(() => options.onResult!({ ...result }), AbortSignal.timeout(5_000)); }
    catch { result.status = 'inconclusive'; result.reason = 'RESULT_EVIDENCE_UNCONFIRMED'; }
  }
  if (result.status === 'inconclusive') await attempt.uncertain(result.reason ?? 'UNCONFIRMED');
  else await attempt.complete(result);
  return result;
}
