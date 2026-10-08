import { setTimeout as delay } from 'node:timers/promises';
import type { Snapshot, Element } from '../contracts/index.js';
import type { ScreenGuard, Selector } from '../scripted/contracts.js';
import { Admission } from '../device/admission.js';
import type { ObservedClaim } from '../device/admission-allocation.js';
import { DeviceCliError, StaleSnapshotError, type ObservedActionDriver } from '../device/index.js';
import { observedReason, observedActionDigest, canonicalJson, ObservedOperationError, type ObservedActionRequest, type ObservedOutcome, type ObservedReason } from '../observed/schema.js';

export interface ObservedTapResult {
  status: ObservedOutcome; reason: ObservedReason | null;
  actionAttempted: boolean | null; actionAcknowledged: boolean | null; observations: number;
}
export interface ObservedTapOptions {
  request: ObservedActionRequest; claim: ObservedClaim; admission: Admission; driver: ObservedActionDriver;
  signal: AbortSignal; onObservation(snapshot: Snapshot, index: number): Promise<void>;
}
export async function boundedObserved<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
function matches(snapshot: Snapshot, selector: Selector): Element[] {
  return snapshot.elements.filter(element => Object.entries(selector).every(([name, value]) => element[name as keyof Selector] === value)
    && element.state?.visible === true && element.frame && element.frame.width > 0 && element.frame.height > 0);
}
function guard(snapshot: Snapshot, condition: ScreenGuard): boolean {
  let satisfied = true;
  for (const selector of condition.present) {
    const count = matches(snapshot, selector).length;
    if (count > 1) throw new Error('AMBIGUOUS_CONDITION');
    if (count !== 1) satisfied = false;
  }
  for (const selector of condition.absent ?? []) if (matches(snapshot, selector).length) satisfied = false;
  return satisfied;
}
function flags(options: ObservedTapOptions) {
  const view = options.admission.readAction(options.request.actionId);
  if (view?.kind !== 'allocation' || !view.allocation.actionEvidence) throw new Error('STATE_UNAVAILABLE');
  return view.allocation.actionEvidence;
}
/** Internal admitted executor. Historical/public adapters use ObservedActionService for all authority. */
export async function runObservedTap(options: ObservedTapOptions): Promise<ObservedTapResult> {
  if (!options.claim || !options.request || !options.admission) throw new ObservedOperationError('MIGRATION_REQUIRED', 'Observed input requires a bound prepared allocation');
  const view = options.admission.readAction(options.request.actionId);
  if (view?.kind !== 'allocation' || !view.attempt || view.attempt.state !== 'active' ||
    view.allocation.allocationId !== options.request.allocationId || view.allocation.device !== options.claim.identity.device ||
    view.allocation.actionDigest !== observedActionDigest(options.request) || canonicalJson(view.allocation.actionRequest) !== canonicalJson(options.request) ||
    view.attempt.owner.token !== options.claim.identity.token || view.attempt.owner.generation !== options.claim.identity.generation ||
    options.claim.identity.attempt.kind !== 'observed' || options.claim.identity.attempt.id !== options.request.actionId) {
    throw new ObservedOperationError('MIGRATION_REQUIRED', 'Observed input requires its immutable allocation binding');
  }
  let status: ObservedOutcome = 'refused'; let reason: ObservedReason | null = null;
  let observing = false; let writing = false;
  const capture = async () => {
    observing = true;
    const snapshot = await boundedObserved(() => options.driver.observe(options.signal), options.signal);
    observing = false;
    if (snapshot.deviceId !== options.claim.identity.device || snapshot.truncated || !Number.isFinite(snapshot.expiresAt)
      || Date.now() >= snapshot.expiresAt || !Number.isFinite(snapshot.capturedAt)) throw new Error('INVALID_OBSERVATION');
    writing = true;
    await boundedObserved(() => options.onObservation(snapshot, flags(options).observationCount + 1), options.signal);
    writing = false; return snapshot;
  };
  try {
    const before = await capture();
    if (guard(before, options.request.after)) status = 'already_satisfied';
    else {
      if (!guard(before, options.request.before)) throw new Error('PRECONDITION_NOT_MET');
      const targets = matches(before, options.request.action.selector);
      if (targets.length !== 1) throw new Error('TARGET_NOT_UNIQUE');
      const target = targets[0]!;
      if (target.state?.enabled !== true) throw new Error('TARGET_UNAVAILABLE');
      if (!target.actions.includes('tap') || !target.actions.includes('touch')) throw new Error('UNSUPPORTED_ACTION');
      await boundedObserved(() => options.driver.tapOnce(target.ref, before, { app: options.request.app,
        device: { udid: options.claim.identity.device }, values: {} }, options.signal), options.signal);
      options.signal.throwIfAborted();
      options.claim.recordActionReceipt({ actionAttempted: true, actionAcknowledged: true });
      while (!guard(await capture(), options.request.after)) {
        const view = options.admission.readAction(options.request.actionId);
        if (view?.kind === 'allocation' && view.attempt?.cancellationRequested) throw new Error('CANCELLED');
        await delay(100, undefined, { signal: options.signal });
      }
      status = 'outcome_observed';
    }
  } catch (error) {
    const evidence = flags(options);
    status = observing || writing || evidence.actionAttempted !== false ? 'inconclusive' : 'refused';
    if (options.signal.aborted) reason = options.signal.reason instanceof Error && options.signal.reason.message === 'CANCELLED' ? 'CANCELLED' : 'DEADLINE_EXCEEDED';
    else if (writing) reason = 'RESULT_EVIDENCE_UNCONFIRMED';
    else if (observing) reason = 'OBSERVATION_UNCONFIRMED';
    else if (evidence.actionAttempted === null || evidence.actionAcknowledged === null) reason = 'UI_ACTION_UNCONFIRMED';
    else if (error instanceof StaleSnapshotError) reason = 'TARGET_UNAVAILABLE';
    else reason = observedReason(error instanceof DeviceCliError ? error.code : error instanceof Error ? error.message : null);
  }
  const evidence = flags(options);
  return { status, reason, actionAttempted: evidence.actionAttempted, actionAcknowledged: evidence.actionAcknowledged, observations: evidence.observationCount };
}
