import { randomUUID } from 'node:crypto';
import type { Admission, AdmissionClaim, AdmittedSession } from '../../src/device/admission.js';
import type { ProbeInvocation, ProbeRecorder } from '../../src/device/android/probe.js';

const operation = (file: string, args: string[]) => JSON.stringify({ kind: 'identity-probe', file, args });

/**
 * A `ProbeRecorder` over an admitted claim: one probe read is one dispatch, and a probe read group is one
 * `dispatchReads`. With `recovery`, the claim's dispatch closes inconclusive and the reads go through a recovery
 * claim instead. `view()` reads the owner's generation back.
 */
export function admittedProbeRecorder(admission: Admission, claim: AdmissionClaim, options: { recovery?: boolean } = {}) {
  let dispatcher: Pick<AdmittedSession, 'dispatch' | 'dispatchReads'> = claim.bindDriver('fake');
  if (options.recovery) {
    claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
    const recovery = admission.claimRecovery(claim.identity, randomUUID());
    if (recovery.kind === 'refused') throw new Error('Recovery claim refused');
    dispatcher = recovery.claim;
  }
  const probe: ProbeRecorder = Object.assign((file: string, args: string[], effect: ProbeInvocation['execute']) => dispatcher.dispatch(operation(file, args), effect), {
    group: (reads: ProbeInvocation[]) => dispatcher.dispatchReads(reads.map(({ file, args, execute }) => ({ operation: operation(file, args), read: execute }))),
  });
  return { probe, view: () => admission.readGeneration(claim.identity) };
}
