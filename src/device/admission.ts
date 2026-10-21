import type { AllocationCapacity, AllocationReservationInput, ReserveAllocationResult, AllocationRecord, AllocationOwner, AllocationReservation, AllocationCommit, AllocationReason, PreparationClaim, ActionBinding, ConsumeAllocationResult, ActionRecordView, ActionEvidence } from './admission-allocation.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod/v4';
import { AdmissionError, AdmissionSqlite, type StoreOptions } from './admission-sqlite.js';
import type { ImportedObservedAction, MigrationReceipt } from './admission-migration.js';
import type { EmulatorObservation } from './android/probe.js';
import { FENCE_REQUEST_KINDS } from '../scripted/vocabulary.js';

export function parseFenceRequestKind(raw: unknown): 'stop' {
  const result = z.enum(FENCE_REQUEST_KINDS).safeParse(raw);
  if (!result.success) throw new AdmissionError('INVALID_REQUEST', 'Expected a fence request kind');
  if (result.data === 'maintenance-lift') throw new AdmissionError('NOT_COVERABLE', 'Maintenance-lift is reserved and cannot cover quarantines');
  return result.data;
}

export type AttemptIdentity = { kind: 'observed' | 'legacy' | 'preparation'; id: string };
export const DEVICE_CATEGORIES = ['ios-simulator', 'android-emulator', 'android-phone', 'ios-phone'] as const;
export type DeviceCategory = typeof DEVICE_CATEGORIES[number];
const deviceIdentitySchema = z.strictObject({ category: z.enum(DEVICE_CATEGORIES), value: z.string().min(1).refine(value => !value.includes('\0')) });
export type DeviceIdentity = z.infer<typeof deviceIdentitySchema>;
export type OwnerProcess = { pid: number; incarnation: string };
export type OwnerIdentity = { category: DeviceCategory; device: string; attempt: AttemptIdentity; token: string; generation: number; process: OwnerProcess };
export type NativeComponent = { id: string; kind: string; declaration: unknown };
export type CommandRecord = { id: string; componentId: string | null; requestId: string | null; operation: string;
  state: 'outstanding' | 'settled' | 'uncertain'; recoveryClaimId: string | null };
const bindingText = z.string().min(1).max(500).refine(value => !!value.trim() && !value.includes('\0'));
const ownerProcessSchema = z.strictObject({ pid: z.number().int().positive(), incarnation: bindingText });
export const componentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id: bindingText, kind: z.literal('one-shot'), operation: bindingText }),
  z.strictObject({ id: bindingText, kind: z.literal('host-process'), process: ownerProcessSchema }),
]);
export type ComponentInput = z.infer<typeof componentSchema>;
export const commandRequestSchema = z.strictObject({ requestId: bindingText, componentId: bindingText, operation: bindingText, payload: z.json() });
export type CommandRequest = z.infer<typeof commandRequestSchema>;
export type IssueResult = { kind: 'issued' | 'retrieved'; command: CommandRecord };
const stopProofSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed-command'), commandId: bindingText }),
  z.strictObject({ kind: z.literal('host-process-exited'), process: ownerProcessSchema,
    evidenceRefs: z.array(z.string().min(1).max(4096).refine(value => isAbsolute(value) && !value.includes('\0'))).min(1) }),
]);
export const fenceRequestSchema = z.strictObject({ requestId: bindingText, kind: z.enum(FENCE_REQUEST_KINDS),
  components: z.array(z.strictObject({ componentId: bindingText, proof: stopProofSchema })), commands: z.array(bindingText) });
export type FenceRequest = z.infer<typeof fenceRequestSchema>;
export type FenceReceipt = { id: string; owner: OwnerIdentity; requestId: string; acceptedAt: number; proof: FenceRequest };
export type GenerationView = { owner: OwnerIdentity; dispatchClosedAt: number | null; inventoryUnknownReason: string | null;
  components: NativeComponent[]; commands: CommandRecord[]; observations: { commandId: string; payload: unknown }[];
  recoveries: { id: string; process: OwnerProcess; closedAt: number | null; closure: 'accepted' | 'refused' | 'abandoned' | null }[] };
export type RecoveryIdentity = { id: string; owner: OwnerIdentity; token: string; process: OwnerProcess };
export type TerminalCandidate = { outcome: 'observed' | 'completed' | 'refused' | 'inconclusive'; disposition: 'available' | 'quarantined'; payload: unknown; evidenceRefs: string[] };
export type AttemptView = { identity: AttemptIdentity; category: DeviceCategory; device: string; digest: string; intent: unknown; owner: OwnerIdentity; state: 'active' | 'parked' | 'terminal'; cancellationRequested: boolean; terminal: TerminalCandidate | null };
export type DeviceView = { category: DeviceCategory; device: string; state: 'active' | 'available' | 'quarantined'; generation: number; owner: OwnerIdentity | null; reason: string | null };
export const emulatorProvenanceSchema = z.strictObject({ avdName: bindingText, avdId: bindingText,
  directory: z.strictObject({ device: bindingText, inode: bindingText }),
  version: z.strictObject({ value: bindingText, source: z.enum(['running-sdk-binary','process-discovery']) }),
  process: z.strictObject({ pid: z.number().int().positive(), startedAt: bindingText }) });
export type AdmissionRequest = { category?: DeviceCategory | undefined; device: string; attempt: AttemptIdentity; digest: string; intent: unknown; signal?: AbortSignal;
  provenance?: EmulatorObservation['provenance'] };
export type AdmissionResult = { kind: 'acquired'; claim: AdmissionClaim } | { kind: 'retrieved'; attempt: AttemptView } | { kind: 'refused'; reason: 'DEVICE_BUSY' | 'DEVICE_QUARANTINED' | 'ACTION_ID_CONFLICT' | 'CANCELLED' | 'HOST_CREATION_UNRESOLVED'; blockingAllocationId?: string };
export type Finalization = { authority: 'committed'; attempt: AttemptView } | { authority: 'unconfirmed'; reason: 'FINALIZATION_UNCONFIRMED' };
export type AdmissionFault = 'beforeCommit' | 'afterCommit';
export type AdmissionDependencies = { now?: () => number; process?: OwnerProcess; ownerLiveness?: (owner: OwnerProcess) => 'alive' | 'dead' | 'unknown';
  componentLiveness?: (component: OwnerProcess) => 'exited' | 'alive' | 'reused' | 'unknown';
  fault?: (point: AdmissionFault, operation: string) => void };
function processStart(pid: number): string | undefined {
  try { return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
    encoding: 'utf8', timeout: 1000, stdio: ['ignore','pipe','ignore'], env: { PATH:'/usr/bin:/bin',LC_ALL:'C',LANG:'C',TZ:'UTC' },
  }).trim() || undefined; }
  catch { return undefined; }
}
const incarnation = processStart(process.pid) ?? `unknown-${randomUUID()}`;
export { AdmissionError } from './admission-sqlite.js';
export function admissionRoot(): string { return join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge/admission'); }
export function canonicalDevice(input: string): string;
export function canonicalDevice(input: DeviceIdentity): DeviceIdentity;
export function canonicalDevice(input: string | DeviceIdentity): string | DeviceIdentity {
  if (typeof input !== 'string') {
    const parsed = deviceIdentitySchema.safeParse(input);
    if (!parsed.success) throw new AdmissionError('INVALID_REQUEST', 'Expected a device category and value');
    if (parsed.data.category === 'ios-phone') throw new AdmissionError('CATEGORY_NOT_ENABLED', 'Physical iPhone admission is not enabled');
    if (parsed.data.category === 'android-emulator' && (!isAbsolute(parsed.data.value) || resolve(parsed.data.value) !== parsed.data.value)) {
      throw new AdmissionError('INVALID_REQUEST', 'Expected a resolved absolute AVD path');
    }
    return parsed.data.category === 'ios-simulator' ? { ...parsed.data, value: canonicalDevice(parsed.data.value) } : parsed.data;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) throw new AdmissionError('INVALID_REQUEST', 'Expected a simulator UUID');
  return input.toUpperCase();
}
export function canonicalAllocationId(input: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) throw new AdmissionError('INVALID_REQUEST', 'Expected an allocation UUID');
  return input.toUpperCase();
}
export function validateAttempt(identity: AttemptIdentity): void {
  if (!['observed', 'legacy', 'preparation'].includes(identity.kind) || !identity.id.trim() || identity.id.length > 500) throw new AdmissionError('INVALID_REQUEST', 'Invalid attempt identity');
}
/** Authority is private to this module; test stores must never reach a real backend. */
export class Admission {
  readonly mode: 'production' | 'test';
  private readonly store: AdmissionSqlite;
  private constructor(options: StoreOptions, private readonly dependencies: AdmissionDependencies) {
    this.mode = options.mode;
    this.store = new AdmissionSqlite(options);
  }
  static open(): Admission {
    return new Admission({ root: admissionRoot(), mode: 'production' }, {});
  }
  static forTesting(options: { root: string; backend: 'fake'; initialize?: boolean } & AdmissionDependencies): Admission {
    if (options.backend !== 'fake') throw new AdmissionError('INVALID_REQUEST', 'Test admission requires a fake backend');
    if (options.initialize !== false) AdmissionSqlite.initializeTestStore(options.root);
    return new Admission({ ...options, mode: 'test' }, options);
  }
  assertBackend(backend: 'real' | 'fake'): void {
    if (backend === 'real' && this.mode !== 'production') throw new AdmissionError('STATE_UNAVAILABLE', 'A real backend cannot use a test store');
  }
  activation(): MigrationReceipt { return this.store.activation(); }
  readImportedAction(actionId: string): ImportedObservedAction | undefined {
    if (!actionId.length || actionId.length > 1024) throw new AdmissionError('INVALID_REQUEST', 'Invalid historical action identity');
    return this.store.readImportedAction(actionId);
  }
  readImportedAllocation(allocationId: string): ImportedObservedAction | undefined { return this.store.readImportedAllocation(canonicalAllocationId(allocationId)); }
  acquire(request: AdmissionRequest): AdmissionResult {
    validateAttempt(request.attempt);
    const identity = canonicalDevice({ category: request.category ?? 'ios-simulator', value: request.device });
    const device = identity.value;
    if (request.provenance !== undefined && (identity.category !== 'android-emulator' || !emulatorProvenanceSchema.safeParse(request.provenance).success)) throw new AdmissionError('INVALID_REQUEST','Expected resolved emulator provenance');
    if (!request.digest.trim()) throw new AdmissionError('INVALID_REQUEST', 'Missing request digest');
    if (request.signal?.aborted) return { kind: 'refused', reason: 'CANCELLED' };
    let acquired = this.store.acquire({ ...request, category: identity.category, device }, this.dependencies.process ?? { pid: process.pid, incarnation });
    if (acquired.kind==='refused' && (acquired.reason==='DEVICE_BUSY'||acquired.reason==='DEVICE_QUARANTINED')) {
      const previous=this.store.inspect(device,identity.category)?.owner;
      if (previous && (this.dependencies.ownerLiveness?.(previous.process)??processLiveness(previous.process))==='dead') {
        this.store.quarantineAbandoned(previous,'OWNER_LOST');
        acquired=this.store.acquire({...request,category:identity.category,device},this.dependencies.process??{pid:process.pid,incarnation});
      }
    }
    if (acquired.kind !== 'acquired') return acquired;
    const claim = new OwnedClaim(this.store, acquired.owner);
    if (request.signal) {
      const cancel = () => { try { claim.cancel(); } catch { /* Closed locally even if durable storage is unavailable. */ } };
      request.signal.addEventListener('abort', cancel, { once: true });
      claim.onClose(() => request.signal!.removeEventListener('abort', cancel));
      if (request.signal.aborted) cancel();
    }
    return { kind: 'acquired', claim };
  }
  reserveAllocation(input: AllocationReservationInput): ReserveAllocationResult {
    const result = this.store.reserveAllocation(input, this.dependencies.process ?? { pid: process.pid, incarnation });
    if (result.kind !== 'reserved') return result;
    return { kind: 'reserved', reservation: new OwnedReservation(this.store, result.allocation) };
  }
  readAllocation(id: string): AllocationRecord | undefined { return this.store.readAllocation(canonicalAllocationId(id)); }
  readAllocationCommands(id: string): CommandRecord[] { return this.store.readAllocationCommands(canonicalAllocationId(id)); }
  readAllocationForAction(actionId: string): AllocationRecord | undefined { return this.store.readAllocationForAction(actionId); }
  consumeAllocation(binding: ActionBinding): ConsumeAllocationResult {
    const result = this.store.consumeAllocation({ ...binding, allocationId: canonicalAllocationId(binding.allocationId) }, this.dependencies.process ?? { pid: process.pid, incarnation });
    if (result.kind !== 'consumed') return result;
    return { kind: 'consumed', claim: new OwnedClaim(this.store, result.owner), allocation: result.allocation };
  }
  readAllocationCapacity(): AllocationCapacity { return this.store.readAllocationCapacity(); }
  listActiveAllocations(): AllocationRecord[] { return this.store.listActiveAllocations(); }
  readAction(actionId: string): ActionRecordView | undefined { return this.store.readAction(actionId); }
  recordActionExport(actionId: string, result: { status: 'complete'; terminal: string } | { status: 'failed' }): AllocationRecord { return this.store.recordActionExport(actionId, result); }
  cancelAllocation(id: string) { return this.store.changeAllocation(canonicalAllocationId(id), 'cancel'); }
  retireAllocation(id: string) { return this.store.changeAllocation(canonicalAllocationId(id), 'retire'); }
  quarantineAbandonedAllocation(expected: AllocationOwner): boolean {
    const liveness = this.dependencies.ownerLiveness?.(expected.process) ?? processLiveness(expected.process);
    return liveness === 'dead' ? this.store.quarantineAbandonedAllocation(expected) : false;
  }
  inspect(device: string | DeviceIdentity): DeviceView | undefined {
    const identity=canonicalDevice(typeof device==='string'?{category:'ios-simulator',value:device}:device);
    return this.store.inspect(identity.value,identity.category);
  }
  readAttempt(identity: AttemptIdentity): AttemptView | undefined { validateAttempt(identity); return this.store.readAttempt(identity); }
  readGeneration(expected: OwnerIdentity): GenerationView { return this.store.readGeneration(expected); }
  readDeviceAttributes(identity: DeviceIdentity): unknown {
    const canonical=canonicalDevice(identity);
    return this.store.readDeviceAttributes(canonical);
  }
  submitFence(expected: OwnerIdentity, request: FenceRequest, recovery?: RecoveryIdentity): FenceReceipt {
    const parsed = fenceRequestSchema.safeParse(request);
    const exited = new Set<string>();
    if (parsed.success) for (const component of parsed.data.components) {
      if (component.proof.kind === 'host-process-exited' &&
        (this.dependencies.componentLiveness?.(component.proof.process) ?? componentLiveness(component.proof.process)) === 'exited') exited.add(component.componentId);
    }
    return this.store.submitFence(expected, request, exited, recovery);
  }
  claimRecovery(expected: OwnerIdentity, requestId: string): { kind:'claimed'|'retrieved'; claim: RecoveryClaim } | { kind:'refused' } {
    const open=this.store.readGeneration(expected).recoveries.find(recovery=>recovery.closedAt===null);
    const abandoned=open&&(this.dependencies.ownerLiveness?.(open.process)??processLiveness(open.process))==='dead'?open:undefined;
    const result=this.store.claimRecovery(expected,requestId,this.dependencies.process??{pid:process.pid,incarnation},abandoned);
    if (result.kind==='refused') return result;
    return {kind:result.kind,claim:new RecoveryClaim(this.store,result.identity,(request)=>this.submitFence(expected,request,result.identity))};
  }
  async acquireWithRecovery(request: AdmissionRequest, sweep: (claim: RecoveryClaim)=>Promise<FenceRequest>): Promise<AdmissionResult> {
    const acquired=this.acquire(request);
    if (acquired.kind!=='refused'||acquired.reason!=='DEVICE_QUARANTINED') return acquired;
    const identity=canonicalDevice({category:request.category??'ios-simulator',value:request.device});
    const target=this.store.recoveryTarget(identity);
    if (!target||request.signal?.aborted) return acquired;
    const recovery=this.claimRecovery(target,randomUUID());
    if (recovery.kind!=='claimed') return acquired;
    try {
      const proof=await sweep(recovery.claim);
      if(request.signal?.aborted) {recovery.claim.close();return {kind:'refused',reason:'CANCELLED'};}
      recovery.claim.submitFence(proof);
    } catch {
      try {recovery.claim.close();} catch {}
      return acquired;
    }
    return this.acquire(request);
  }
  cancel(identity: AttemptIdentity): AttemptView | undefined { validateAttempt(identity); return this.store.cancel(identity); }
  quarantineAbandoned(expected: OwnerIdentity, reason: string): boolean {
    const liveness = this.dependencies.ownerLiveness?.(expected.process) ?? processLiveness(expected.process);
    if (liveness !== 'dead') return false;
    return this.store.quarantineAbandoned(expected, reason);
  }
}
export class RecoveryClaim {
  private closed=false;
  constructor(private readonly store: AdmissionSqlite, readonly identity: RecoveryIdentity,
    private readonly fence: (request:FenceRequest)=>FenceReceipt) {}
  registerComponent(component:ComponentInput):NativeComponent {return this.store.registerComponent(this.identity.owner,component,this.identity);}
  issue(request:CommandRequest):IssueResult {return this.store.authorizeRecovery(this.identity,request.operation,request);}
  async dispatch<T>(operation: string|CommandRequest, effect: ()=>Promise<T>): Promise<T> {
    if (this.closed) throw new AdmissionError('DISPATCH_CLOSED','Recovery dispatch is closed');
    let command:string;
    try {
      const issued=typeof operation==='string'?this.store.authorizeRecovery(this.identity,operation):this.issue(operation);
      if(issued.kind!=='issued')throw new AdmissionError('DISPATCH_CLOSED','A retrieved command cannot be sent again');
      command=issued.command.id;
    }
    catch(error){this.closed=true;throw error;}
    let result:T;
    try {result=await effect();}
    catch(error) {this.closed=true;this.store.settle(this.identity.owner,command,false);throw error;}
    try {this.store.settle(this.identity.owner,command,true);}
    catch(error){this.closed=true;throw error;}
    return result;
  }
  submitFence(request:FenceRequest):FenceReceipt {
    const result=this.fence(request);this.closed=true;return result;
  }
  close():void {this.store.closeRecovery(this.identity);this.closed=true;}
}
function processLiveness(owner: OwnerProcess): 'alive' | 'dead' | 'unknown' {
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) return 'unknown';
  try {
    process.kill(owner.pid, 0);
    const start = processStart(owner.pid);
    if (!start || owner.incarnation.startsWith('unknown-')) return 'unknown';
    return start === owner.incarnation ? 'alive' : 'dead';
  }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'; }
}
function componentLiveness(component:OwnerProcess):'exited'|'alive'|'reused'|'unknown' {
  try {
    process.kill(component.pid,0);
    const liveness=processLiveness(component);
    return liveness==='dead'?'reused':liveness;
  } catch(error) {return (error as NodeJS.ErrnoException).code==='ESRCH'?'exited':'unknown';}
}

/** Constructed only after durable acquisition. Tokens supplied by requests cannot attach a driver. */
export interface AdmissionClaim {
  readonly identity: OwnerIdentity;
  bindDriver(backend?: 'real' | 'fake'): AdmittedSession;
  cancel(): AttemptView | undefined;
  finalize(candidate: TerminalCandidate): Finalization;
  closeDispatch(candidate: TerminalCandidate): Finalization;
  registerComponent(component: ComponentInput): NativeComponent;
  issue(request: CommandRequest): IssueResult;
  markInventoryUnknown(reason: string): void;
}
class OwnedClaim implements AdmissionClaim {
  private closed = false;
  private cancellationRequested = false;
  private attached = false;
  private closers: (() => void)[] = [];
  readonly identity: OwnerIdentity;
  constructor(private readonly store: AdmissionSqlite, identity: OwnerIdentity, private readonly parentClosed: () => boolean = () => false) {
    this.identity = Object.freeze({ ...identity, attempt: Object.freeze({ ...identity.attempt }), process: Object.freeze({ ...identity.process }) });
  }
  onClose(callback: () => void): void { this.closers.push(callback); }
  registerComponent(component: ComponentInput): NativeComponent { return this.store.registerComponent(this.identity, component); }
  issue(request: CommandRequest): IssueResult { return this.store.issue(this.identity, request); }
  markInventoryUnknown(reason: string): void { this.store.markInventoryUnknown(this.identity, reason); }
  private close(): void { this.closed = true; for (const callback of this.closers.splice(0)) callback(); }
  bindDriver(backend: 'real' | 'fake' = 'real'): AdmittedSession {
    if (this.closed || this.parentClosed() || this.attached) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed or already attached');
    this.store.attach(this.identity, backend);
    this.attached = true;
    return new OwnedSession(this.store, this.identity, () => this.closed || this.parentClosed());
  }
  park(readinessEvidence: string[], evidenceRefs: string[] = []): AllocationCommit {
    if (this.closed || this.cancellationRequested || this.parentClosed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    this.close();
    try { return { authority: 'committed', allocation: this.store.parkAllocation(this.identity, readinessEvidence, evidenceRefs) }; }
    catch (error) { if (!(error instanceof AdmissionError) || error.code === 'STATE_UNAVAILABLE') return { authority: 'unconfirmed', reason: 'STATE_UNAVAILABLE' }; throw error; }
  }
  recordObservation(refs: string[]): AllocationRecord {
    if (this.closed || this.parentClosed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    try { return this.store.recordObservation(this.identity, refs); }
    catch (error) { this.close(); throw error; }
  }
  recordActionReceipt(flags: Pick<ActionEvidence, 'actionAttempted' | 'actionAcknowledged'>): AllocationRecord {
    if (this.closed || this.parentClosed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    try { return this.store.recordActionReceipt(this.identity, flags); }
    catch (error) { this.close(); throw error; }
  }
  beginFinalization(): AllocationRecord { this.close(); return this.store.beginActionFinalization(this.identity); }
  cancel(): AttemptView | undefined {
    // Cancellation remains authoritative for this handle even if its write fails.
    this.cancellationRequested = true;
    this.close();
    return this.store.cancel(this.identity.attempt, this.identity);
  }
  closeDispatch(candidate: TerminalCandidate): Finalization { return this.finish(candidate, false); }
  finalize(candidate: TerminalCandidate): Finalization { return this.finish(candidate, true); }
  private finish(candidate: TerminalCandidate, release: boolean): Finalization {
    this.close();
    try { return { authority: 'committed', attempt: this.store.finalize(this.identity, candidate, this.cancellationRequested, release) }; }
    catch (error) {
      if (error instanceof AdmissionError && error.code !== 'STATE_UNAVAILABLE') throw error;
      // Even a verified lost COMMIT reply is retrieval, never candidate publication.
      try { this.store.readAttempt(this.identity.attempt); } catch { /* Closed until authoritative resolution is possible. */ }
      return { authority: 'unconfirmed', reason: 'FINALIZATION_UNCONFIRMED' };
    }
  }
}
export interface AdmittedSession {
  dispatch<T>(kind: string, effect: () => Promise<T>): Promise<T>;
}
class OwnedSession implements AdmittedSession {
  private revoked = false;
  private pending: Promise<unknown> | undefined;
  constructor(private readonly store: AdmissionSqlite, private readonly owner: OwnerIdentity, private readonly closed: () => boolean) {}
  dispatch<T>(kind: string, effect: () => Promise<T>): Promise<T> {
    if (this.revoked || this.closed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    if (this.pending) {
      this.store.assertDispatchOpen(this.owner);
      return this.pending.then(()=>this.dispatch(kind,effect));
    }
    let command: string;
    try { command = this.store.authorize(this.owner, kind); }
    catch (error) { this.revoked = true; throw error; }
    // No await between durable authorization and calling the backend. Cancellation
    // in another process can follow this authorization; it cannot retract it.
    let underlying: Promise<T>;
    try { underlying = effect(); }
    catch (error) { this.revoked = true; this.store.settle(this.owner, command, false); throw error; }
    const completion = Promise.resolve(underlying).then(value => {
      try { this.store.settle(this.owner, command, true); return value; }
      catch (error) { this.revoked = true; throw error; }
    }, error => { this.revoked = true; this.store.settle(this.owner, command, false); throw error; });
    this.pending=completion;
    const clear=()=>{if(this.pending===completion)this.pending=undefined;};
    void completion.then(clear,clear);
    return completion;
  }
}

class OwnedReservation implements AllocationReservation {
  readonly identity: AllocationOwner;
  readonly snapshot: AllocationRecord;
  private closed = false;
  constructor(private readonly store: AdmissionSqlite, snapshot: AllocationRecord) {
    this.snapshot = structuredClone(snapshot); this.identity = Object.freeze({ ...snapshot.owner, process: Object.freeze({ ...snapshot.owner.process }) });
  }
  stage(artifact: import('../observed/artifact.js').StagedArtifact): AllocationRecord {
    if (this.closed) throw new AdmissionError('DISPATCH_CLOSED', 'Reservation is closed');
    return this.store.stageAllocation(this.identity, artifact);
  }
  async create(effect: () => Promise<import('../observed/create-source.js').CreationResult>): Promise<import('../observed/create-source.js').CreationResult> {
    if (this.closed) throw new AdmissionError('DISPATCH_CLOSED', 'Reservation is closed');
    try {
      this.store.startCreation(this.identity);
      let receipt: import('../observed/create-source.js').CreationResult;
      try { receipt = await effect(); } catch { receipt = { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }; }
      return this.store.recordCreation(this.identity, receipt);
    } catch (error) {
      if (!(error instanceof AdmissionError) || error.code === 'STATE_UNAVAILABLE') this.closed = true;
      throw error;
    }
  }
  admit(): { kind: 'admitted'; claim: PreparationClaim } | import('./admission-allocation.js').AllocationRefusal {
    if (this.closed) throw new AdmissionError('DISPATCH_CLOSED', 'Reservation is closed');
    const result = this.store.admitAllocation(this.identity);
    if (result.kind !== 'admitted') return result;
    return { kind: 'admitted', claim: new OwnedClaim(this.store, result.owner, () => this.closed) };
  }
  fail(reason: AllocationReason, evidenceRefs: string[] = []): AllocationCommit {
    this.closed = true;
    try { return { authority: 'committed', allocation: this.store.failAllocation(this.identity, reason, evidenceRefs) }; }
    catch (error) { if (!(error instanceof AdmissionError) || error.code === 'STATE_UNAVAILABLE') return { authority: 'unconfirmed', reason: 'STATE_UNAVAILABLE' }; throw error; }
  }
}
