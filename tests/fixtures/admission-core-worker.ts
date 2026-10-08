import { Admission, type AdmissionClaim, type AdmissionRequest, type TerminalCandidate } from '../../src/device/admission.js';
const [root, faultOperation, faultPoint] = process.argv.slice(2);
if (!root || !process.send) throw new Error('Worker needs root and IPC');
const admission = Admission.forTesting({ root, backend: 'fake', initialize: false,
  fault(point, operation) { if (point === faultPoint && operation === faultOperation) process.kill(process.pid, 'SIGKILL'); },
});
let claim: AdmissionClaim | undefined;
process.on('message', (message: { operation: string; request?: AdmissionRequest; terminal?: TerminalCandidate }) => {
  try {
    if (message.operation === 'acquire' && message.request) {
      const result = admission.acquire(message.request);
      if (result.kind === 'acquired') claim = result.claim;
      process.send!({ kind: result.kind, ...(result.kind === 'acquired' ? { owner: result.claim.identity } : result) });
    } else if (message.operation === 'finalize' && message.terminal && claim) {
      process.send!(claim.finalize(message.terminal));
    } else if (message.operation === 'exit') { process.exit(0); }
  } catch (error) { process.send!({ error: error instanceof Error ? error.message : String(error) }); }
});
process.send({ ready: true });
