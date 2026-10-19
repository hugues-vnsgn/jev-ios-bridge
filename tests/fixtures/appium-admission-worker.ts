import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Admission, admissionRoot, type AdmissionClaim, type AdmittedSession } from '../../src/device/admission.js';

// Real admission implementation, isolated fake-only store. Never production
// activation or a real backend. Each process receives the same explicit root.
const admission = Admission.forTesting({ root: realpathSync(process.argv[2]!), backend: 'fake', initialize: false });
const client = fileURLToPath(new URL('../../.scratch/appium-mcp-migration/candidate-stack/experiments/protocol-client.mjs', import.meta.url));
let claim: AdmissionClaim | undefined, session: AdmittedSession | undefined, closed = false;
process.on('message', async (message: any) => {
  try {
    if (message.operation === 'acquire') {
      const result = admission.acquire(message.request);
      if (result.kind === 'acquired') { claim = result.claim; session = claim.bindDriver('fake'); process.send!({ kind: 'acquired', owner: claim.identity }); }
      else process.send!(result);
    } else if (message.operation === 'execute') {
      if (!claim || !session) { process.send!({ status: 'refused', reason: 'NO_ADMISSION' }); return; }
      if (closed) { process.send!({ status: 'refused', reason: 'DISPATCH_CLOSED' }); return; }
      // A coarse tracer authorization proves exclusion, not per-native-command
      // accounting. This fixture deliberately never makes the device available.
      const protocol = await session.dispatch('phase1-tracer', async () => {
        const result = spawnSync(process.execPath, [client, process.argv[3]!], { encoding: 'utf8', timeout: 20_000 });
        if (result.status !== 0) throw new Error('PROTOCOL_PROCESS_FAILED');
        return JSON.parse(result.stdout);
      });
      closed = true;
      const finalized = claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: protocol, evidenceRefs: [] });
      process.send!({ authority: finalized.authority, protocol });
    }
  } catch (error) { process.send!({ status: 'refused', reason: (error as { code?: string }).code ?? 'PROCESS_FAILED' }); }
});
process.send!({ ready: true, productionRoot: admissionRoot() });
