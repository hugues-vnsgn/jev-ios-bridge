import { writeSync, writeFileSync, existsSync } from 'node:fs';
import { Admission, AdmissionError, type OwnerIdentity } from '../../src/device/admission.js';
import type { StagedArtifact } from '../../src/observed/artifact.js';

import { workSchema, resultSchema, type WorkerResult, type WorkerOutcome } from './allocation-worker-protocol.js';

function barrier({ entered, release }: { entered: string; release: string }) {
  writeFileSync(entered, 'entered');
  const deadline = Date.now() + 15000;
  while (!existsSync(release)) {
    if (Date.now() > deadline) throw new Error('Barrier release missing');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
}
process.once('message', async (raw: unknown) => {
  const work = workSchema.parse(raw);
  let effects = 0;
  let phase: WorkerResult['phase'] = 'constructor';
  let effectOwner: OwnerIdentity | undefined;
  const authorizations: OwnerIdentity[] = [];
  const effectOwners: OwnerIdentity[] = [];
  const callbackEntries: { owner: OwnerIdentity; authorizationSeenAtEntry: boolean }[] = [];
  function send(result: WorkerOutcome) {
    process.send?.(resultSchema.parse({ ...result, actor: process.pid, mode: work.mode, phase, effects, authorizations, effectOwners, callbackEntries }));
  }
  try {
    const admission = Admission.forTesting({ root: work.root, backend: 'fake', initialize: false, ...(work.now === undefined ? {} : { now: () => work.now! }),
      fault: (point, operation) => {
        if (operation === 'authorize') phase = 'authorize';
        if (operation === 'settle') phase = 'settle';
        if (point === 'afterCommit' && operation === 'authorize' && effectOwner) authorizations.push(structuredClone(effectOwner));
        if (work.control?.point === point && work.control.operation === operation) {
          if (work.control.kind === 'hold') barrier(work.control);
          else throw new AdmissionError('STATE_UNAVAILABLE', 'Controlled public fault');
        }
        if (work.fault?.point === point && work.fault.operation === operation) {
          writeSync(1, JSON.stringify({ milestone: `${operation}:${point}` }) + '\n'); process.kill(process.pid, 'SIGKILL');
        }
      } });
    if (work.gate) barrier(work.gate);
    if (work.mode === 'reserve') {
      phase = 'reserve';
      const result = admission.reserveAllocation(work.input);
      send(result.kind === 'refused' ? { kind: 'refused', reason: result.reason } : { kind: result.kind, allocationId: result.kind === 'reserved' ? result.reservation.identity.allocationId : result.allocation.allocationId });
    } else if (work.mode === 'consume') {
      phase = 'consume';
      const result = admission.consumeAllocation(work.binding);
      if (result.kind === 'consumed') {
        effectOwner = result.claim.identity; phase = 'attach';
        const driver = result.claim.bindDriver('fake'); phase = 'authorize';
        await driver.dispatch('capture', async () => {
          phase = 'dispatch';
          const entry = { owner: structuredClone(result.claim.identity), authorizationSeenAtEntry: false };
          callbackEntries.push(entry);
          entry.authorizationSeenAtEntry = authorizations.some(owner => JSON.stringify(owner) === JSON.stringify(entry.owner));
          if (!entry.authorizationSeenAtEntry) throw new Error('Effect without committed authorization');
          effectOwners.push(structuredClone(result.claim.identity)); effects++;
        });
      }
      send(result.kind === 'refused' ? { kind: 'refused', reason: result.reason } : { kind: result.kind, allocationId: result.allocation.allocationId });
    } else if (work.mode === 'cancel' || work.mode === 'retire') {
      phase = work.mode;
      const result = work.mode === 'cancel' ? admission.cancelAllocation(work.allocationId!) : admission.retireAllocation(work.allocationId!);
      send(result.kind === 'refused' ? { kind: 'refused', reason: result.reason } : { kind: result.kind, allocationId: result.allocation.allocationId });
    } else {
      phase = 'journey';
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
      if (work.mode === 'park') { send({ kind: 'parked', allocationId: id }); return; }
      const action = admission.consumeAllocation({ allocationId: id, actionId: work.input.actionId, actionDigest: 'a'.repeat(64), request: { actionId: work.input.actionId, allocationId: id, action: 'tap' }, appBundleId: work.input.appBundleId,
        evidence: { bridgeVersion: '1.3.1', directory: '/isolated/action', request: '/isolated/action/request.json' } });
      if (action.kind !== 'consumed') throw new Error('Consumption refused');
      action.claim.recordObservation(['/isolated/action/observation-1.json']);
      await action.claim.bindDriver('fake').dispatch('tap', async () => { effects++; });
      action.claim.recordActionReceipt({ actionAttempted: true, actionAcknowledged: true });
      action.claim.beginFinalization();
      action.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { outcome: 'outcome_observed', reason: null }, evidenceRefs: ['/isolated/action/observation-1.json'] });
      admission.recordActionExport(work.input.actionId, { status: 'complete', terminal: '/isolated/action/terminal.json' });
      send({ kind: 'completed' });
    }
  } catch (error) {
    send(error instanceof AdmissionError && error.code === 'STATE_UNAVAILABLE'
      ? { kind: 'state-unavailable', code: 'STATE_UNAVAILABLE' } : { kind: 'unexpected-error', message: String(error) });
  }
  finally { process.disconnect(); }
});
process.send?.({ ready: true });
