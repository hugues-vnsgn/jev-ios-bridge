import { existsSync, writeFileSync, writeSync } from 'node:fs';
import { Admission, AdmissionError, type AdmissionClaim, type OwnerIdentity } from '../../src/device/admission.js';
import { commandSchema, controlSchema, replySchema, faultSchema, type CoreReply } from './admission-core-protocol.js';
const [root, faultOperation, faultPoint, rawControl] = process.argv.slice(2);
if (!root || !process.send) throw new Error('Worker needs root and IPC');
const control = rawControl ? controlSchema.parse(JSON.parse(rawControl)) : undefined;
let phase: Extract<CoreReply['result'], { kind: 'unexpected-error' }>['phase'] = 'constructor';
let claim: AdmissionClaim | undefined;
let effects = 0;
const authorizations: OwnerIdentity[] = [];
const entries: { owner: OwnerIdentity; authorizationSeenAtEntry: boolean }[] = [];
let lastRequest = 0;
const admission = Admission.forTesting({ root, backend: 'fake', initialize: false,
 fault(point, operation) {
  if (point === faultPoint && operation === faultOperation) {
   writeSync(4, JSON.stringify(faultSchema.parse({ type: 'fault', requestId: lastRequest, actor: process.pid, operation, point })) + '\n');
   process.kill(process.pid, 'SIGKILL');
  }
  if (operation === 'authorize') phase = 'authorize';
  if (operation === 'settle') phase = 'settle';
  if (point === 'afterCommit' && operation === 'authorize' && claim) authorizations.push(structuredClone(claim.identity));
  if (control?.point === point && control.operation === operation) {
   if (control.kind === 'unavailable') throw new AdmissionError('STATE_UNAVAILABLE', 'Controlled acquire reply loss');
   writeFileSync(control.entered, 'entered'); const deadline = Date.now() + 8000;
   while (!existsSync(control.release)) { if (Date.now() > deadline) throw new Error('Missing release'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5); }
  }
 },
});
process.on('message', async (raw: unknown) => {
 const message = commandSchema.parse(raw);
 if (message.requestId <= lastRequest) throw new Error('Duplicate or unordered request'); lastRequest = message.requestId;
 phase = message.operation;
 let result: CoreReply['result'];
 try {
  if (message.operation === 'acquire') {
   const value = admission.acquire(message.request);
   if (value.kind === 'acquired') { claim = value.claim; result = { kind: 'acquired', owner: value.claim.identity }; }
   else result = value;
  } else if (message.operation === 'finalize' && claim) result = { kind: 'finalized', finalization: claim.finalize(message.terminal) };
  else if (message.operation === 'dispatch' && claim) {
   phase = 'attach'; const session = claim.bindDriver('fake'); phase = 'authorize';
   await session.dispatch('tap', async () => {
    phase = 'dispatch'; const owner = structuredClone(claim!.identity);
    const entry = { owner, authorizationSeenAtEntry: false }; entries.push(entry);
    entry.authorizationSeenAtEntry = authorizations.some(a => JSON.stringify(a) === JSON.stringify(owner));
    if (!entry.authorizationSeenAtEntry) throw new Error('Unauthorized callback entry'); effects++;
   }); result = { kind: 'dispatched' };
  } else if (message.operation === 'exit') { process.disconnect(); return; }
  else throw new Error('Operation requires a confirmed claim');
 } catch (error) {
  const details = { phase, code: error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null,
   errorClass: error instanceof Error ? error.constructor.name : typeof error,
   message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack ?? null : null };
  result = error instanceof AdmissionError && error.code === 'STATE_UNAVAILABLE'
   ? { ...details, kind: 'state-unavailable', code: 'STATE_UNAVAILABLE', errorClass: 'AdmissionError' }
   : { ...details, kind: 'unexpected-error' };
 }
 process.send?.(replySchema.parse({ type: 'reply', requestId: message.requestId, actor: process.pid, operation: message.operation, result, effects, authorizations, entries }));
});
process.send({ type: 'ready', actor: process.pid });
