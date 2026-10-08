import { writeSync } from 'node:fs';
import { Admission } from '../../src/device/admission.js';
import type { AllocationReservationInput, ActionBinding } from '../../src/device/admission-allocation.js';
import type { StagedArtifact } from '../../src/observed/artifact.js';

type Work = { root: string; mode: 'reserve' | 'consume' | 'cancel' | 'journey' | 'retire' | 'park'; input: AllocationReservationInput; binding?: ActionBinding;
  allocationId?: string; now?: number; fault?: { operation: string; point: 'beforeCommit' | 'afterCommit' }; };
process.once('message', async (work: Work) => {
  let effects = 0;
  try {
    const admission = Admission.forTesting({ root: work.root, backend: 'fake', initialize: false, ...(work.now === undefined ? {} : { now: () => work.now! }),
      fault: (point, operation) => {
        if (work.fault?.point === point && work.fault.operation === operation) {
          writeSync(1, JSON.stringify({ milestone: `${operation}:${point}` }) + '\n'); process.kill(process.pid, 'SIGKILL');
        }
      } });
    if (work.mode === 'reserve') {
      const result = admission.reserveAllocation(work.input);
      process.send?.({ kind: result.kind, reason: result.kind === 'refused' ? result.reason : undefined, effects });
    } else if (work.mode === 'consume') {
      const result = admission.consumeAllocation(work.binding!);
      if (result.kind === 'consumed') { await result.claim.bindDriver('fake').dispatch('capture', async () => { effects++; }); }
      process.send?.({ kind: result.kind, reason: result.kind === 'refused' ? result.reason : undefined, effects });
    } else if (work.mode === 'cancel' || work.mode === 'retire') {
      const result = work.mode === 'cancel' ? admission.cancelAllocation(work.allocationId!) : admission.retireAllocation(work.allocationId!);
      process.send?.({ kind: result.kind, reason: result.kind === 'refused' ? result.reason : undefined, effects });
    } else {
      const result = admission.reserveAllocation(work.input); if (result.kind !== 'reserved') throw new Error('Reservation refused');
      const reservation = result.reservation; const id = reservation.identity.allocationId;
      const artifact: StagedArtifact = { stagedPath: '/isolated/staged/Fixture.app', contentDigest: work.input.inspectedContentDigest, bytes: work.input.artifactBytes,
        maxBytes: work.input.budgets.maxArtifactBytes, metadata: { bundleId: work.input.appBundleId, executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'build', origin: 'fixture' } } };
      reservation.stage(artifact);
      await reservation.create(async () => { effects++; return { status: 'created', udid: 'ABCDEF00-0000-4000-8000-000000000001', provenance: { kind: 'simctl-create', allocationId: id,
        name: `jev-observed-${id}`, deviceTypeId: work.input.source.deviceTypeId, runtimeId: work.input.source.runtimeId } }; });
      const prepared = reservation.admit(); if (prepared.kind !== 'admitted') throw new Error('Admission refused');
      const session = prepared.claim.bindDriver('fake');
      for (const kind of ['boot','install','launch','readiness']) await session.dispatch(kind, async () => { effects++; });
      prepared.claim.park(['/isolated/readiness.json']);
      if (work.mode === 'park') { process.send?.({ kind: 'parked', allocationId: id, effects }); return; }
      const action = admission.consumeAllocation({ allocationId: id, actionId: work.input.actionId, actionDigest: 'a'.repeat(64), request: { actionId: work.input.actionId, allocationId: id, action: 'tap' }, appBundleId: work.input.appBundleId,
        evidence: { bridgeVersion: '1.3.1', directory: '/isolated/action', request: '/isolated/action/request.json' } });
      if (action.kind !== 'consumed') throw new Error('Consumption refused');
      action.claim.recordObservation(['/isolated/action/observation-1.json']);
      await action.claim.bindDriver('fake').dispatch('tap', async () => { effects++; });
      action.claim.recordActionReceipt({ actionAttempted: true, actionAcknowledged: true });
      action.claim.beginFinalization();
      action.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { outcome: 'outcome_observed', reason: null }, evidenceRefs: ['/isolated/action/observation-1.json'] });
      admission.recordActionExport(work.input.actionId, { status: 'complete', terminal: '/isolated/action/terminal.json' });
      process.send?.({ kind: 'completed', effects });
    }
  } catch (error) { process.send?.({ kind: 'error', code: (error as { code?: string }).code, message: String(error), effects }); }
  finally { process.disconnect(); }
});
process.send?.({ ready: true });
