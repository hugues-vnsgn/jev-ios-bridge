import { dirname, isAbsolute } from 'node:path';
import type { ActionRecordView, AllocationRecord } from '../device/admission-allocation.js';
import type { ImportedObservedAction } from '../device/admission-migration.js';
import { ObservedOperationError, observedReason, parseObservedAction, observedActionDigest, canonicalJson,
  observedAllocationIdSchema, type ObservedOutcome, type ObservedReason } from './schema.js';

export interface ObservedActionSnapshotV1 {
  version: 1; kind: 'observed-action'; actionId: string; allocationId: string;
  device: { platform: 'ios-simulator'; udid: string }; bridgeVersion: string;
  state: 'running' | 'finalizing' | 'terminal' | 'unresolved'; authority: 'none' | 'unconfirmed' | 'committed';
  disposition: 'started' | 'retrieved'; cancellationRequested: boolean;
  actionAttempted: boolean | null; actionAcknowledged: boolean | null; observations: number;
  outcome: ObservedOutcome | null; reason: ObservedReason | null;
  admission: 'active' | 'available' | 'quarantined' | 'unknown'; allocationState: AllocationRecord['state'];
  evidence: { directory: string; request: string; observations: string[]; terminal: string | null; exportStatus: 'pending' | 'complete' | 'failed' };
}
export type ObservedActionSnapshot = ObservedActionSnapshotV1;
export type ResolutionDiagnostics = { ownerUnavailable?: boolean; finalizationUnconfirmed?: boolean; disposition?: 'started' | 'retrieved' };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
function unavailable(): never { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Authoritative action state is unavailable', { acceptance: 'unknown' }); }
/** Outcomes come only from the consistent durable view. Diagnostics can only reduce nonterminal authority. */
export function renderObservedAction(view: ActionRecordView, diagnostic: ResolutionDiagnostics = {}): ObservedActionSnapshot {
  if (view.kind === 'imported') return renderImported(view.action, view.admission?.state ?? 'unknown');
  const { allocation, attempt, admission } = view;
  if (!attempt || !allocation.actionDigest || !allocation.actionEvidence) {
    throw new ObservedOperationError('ACTION_NOT_STARTED', 'The reserved action has not started', {
      actionId: allocation.actionId, allocationId: allocation.allocationId, acceptance: 'no' });
  }
  const evidence = allocation.actionEvidence;
  try {
    const request = parseObservedAction(allocation.actionRequest);
    if (request.actionId !== allocation.actionId || request.allocationId !== allocation.allocationId || request.app.bundleId !== allocation.appBundleId ||
      observedActionDigest(request) !== allocation.actionDigest || attempt.identity.kind !== 'observed' || attempt.identity.id !== allocation.actionId ||
      attempt.device !== allocation.device || attempt.digest !== allocation.actionDigest || canonicalJson(attempt.intent) !== canonicalJson(request) ||
      attempt.owner.token !== allocation.owner.token || attempt.owner.generation !== allocation.owner.generation) unavailable();
  } catch { unavailable(); }
  if (!allocation.device || !isAbsolute(evidence.directory) || !isAbsolute(evidence.request) ||
    !Array.isArray(evidence.observations) || evidence.observations.some(path => !isAbsolute(path)) ||
    (evidence.terminal !== null && !isAbsolute(evidence.terminal)) ||
    !Number.isSafeInteger(evidence.observationCount) || evidence.observationCount < 0 ||
    ![true, false, null].includes(evidence.actionAttempted) || ![true, false, null].includes(evidence.actionAcknowledged) ||
    (evidence.actionAcknowledged === true && evidence.actionAttempted !== true)) unavailable();
  let state: ObservedActionSnapshot['state'] = evidence.state === 'finalizing' ? 'finalizing' : 'running';
  let authority: ObservedActionSnapshot['authority'] = 'none';
  let outcome: ObservedOutcome | null = null; let reason: ObservedReason | null = null;
  if (attempt.state === 'terminal') {
    if (!attempt.terminal || evidence.state !== 'terminal') unavailable();
    const terminal = attempt.terminal; const payload = object(terminal.payload);
    if (terminal.outcome === 'observed') {
      if (payload.reason !== null || evidence.observationCount < 1) unavailable();
      if (payload.outcome === 'already_satisfied' && evidence.actionAttempted === false && evidence.actionAcknowledged === false) outcome = 'already_satisfied';
      else if (payload.outcome === 'outcome_observed' && evidence.actionAttempted === true && evidence.actionAcknowledged === true) outcome = 'outcome_observed';
      else unavailable();
    } else if (terminal.outcome === 'refused') {
      if (evidence.actionAttempted !== false || evidence.actionAcknowledged !== false) unavailable();
      outcome = 'refused'; reason = observedReason(payload.reason);
    } else if (terminal.outcome === 'inconclusive') { outcome = 'inconclusive'; reason = observedReason(payload.reason); }
    else unavailable();
    state = 'terminal'; authority = 'committed';
  } else if (diagnostic.finalizationUnconfirmed || diagnostic.ownerUnavailable) {
    state = 'unresolved'; authority = 'unconfirmed';
    reason = diagnostic.finalizationUnconfirmed ? 'FINALIZATION_UNCONFIRMED' : 'OWNER_UNAVAILABLE';
  }
  return { version: 1, kind: 'observed-action', actionId: allocation.actionId, allocationId: allocation.allocationId,
    device: { platform: 'ios-simulator', udid: allocation.device }, bridgeVersion: evidence.bridgeVersion,
    state, authority, disposition: diagnostic.disposition ?? 'retrieved', cancellationRequested: attempt.cancellationRequested || allocation.cancellationRequested,
    actionAttempted: evidence.actionAttempted, actionAcknowledged: evidence.actionAcknowledged, observations: evidence.observationCount,
    outcome, reason, admission: admission?.state ?? 'unknown', allocationState: allocation.state,
    evidence: { directory: evidence.directory, request: evidence.request, observations: [...evidence.observations],
      terminal: evidence.terminal, exportStatus: evidence.exportStatus } };
}
function renderImported(action: ImportedObservedAction, admission: ObservedActionSnapshot['admission']): ObservedActionSnapshot {
  if (action.readOnly !== true || !['outcome_observed', 'already_satisfied', 'refused', 'inconclusive'].includes(action.outcome) ||
    !observedAllocationIdSchema.safeParse(action.allocationId).success || !observedAllocationIdSchema.safeParse(action.device).success ||
    !Array.isArray(action.records)) unavailable();
  const intent = action.records.find(entry => entry.path.endsWith('.intent.json'));
  const result = action.records.find(entry => entry.path.endsWith('.result.json'));
  if (!intent || !isAbsolute(intent.path)) unavailable();
  const historical = object(object(result?.record).result);
  const uncertain = action.outcome === 'inconclusive';
  const attempted = typeof historical.actionAttempted === 'boolean' && !uncertain ? historical.actionAttempted : null;
  const acknowledged = typeof historical.actionAcknowledged === 'boolean' && !uncertain ? historical.actionAcknowledged : null;
  return { version: 1, kind: 'observed-action', actionId: action.actionId, allocationId: action.allocationId,
    device: { platform: 'ios-simulator', udid: action.device }, bridgeVersion: 'historical', state: 'terminal', authority: 'committed',
    disposition: 'retrieved', cancellationRequested: false, actionAttempted: attempted, actionAcknowledged: acknowledged,
    observations: Number.isSafeInteger(historical.observations) && (historical.observations as number) >= 0 ? historical.observations as number : 0,
    outcome: action.outcome, reason: uncertain ? 'OWNER_LOST' : action.outcome === 'refused' ? observedReason(historical.reason) : null,
    admission, allocationState: uncertain ? 'quarantined' : 'retained',
    evidence: { directory: dirname(intent.path), request: intent.path, observations: [], terminal: null, exportStatus: 'pending' } };
}
export function observedActionExitCode(snapshot: ObservedActionSnapshot): 0 | 2 | 3 {
  if (snapshot.authority !== 'committed') return 2;
  return snapshot.outcome === 'outcome_observed' || snapshot.outcome === 'already_satisfied' ? 0 : snapshot.outcome === 'refused' ? 3 : 2;
}
export function observedActionSummary(snapshot: ObservedActionSnapshot): string {
  return `${snapshot.actionId}: ${snapshot.outcome ?? snapshot.state} (${snapshot.authority}); evidence ${snapshot.evidence.directory}`;
}
