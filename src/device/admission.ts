import type { AllocationCapacity, AllocationReservationInput, ReserveAllocationResult, AllocationRecord, AllocationOwner, AllocationReservation, AllocationCommit, AllocationReason, PreparationClaim, ActionBinding, ConsumeAllocationResult, ActionRecordView, ActionEvidence } from './admission-allocation.js';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod/v4';
import { AdmissionError, AdmissionSqlite, type StoreOptions } from './admission-sqlite.js';
import type { ImportedObservedAction, MigrationReceipt } from './admission-migration.js';
import type { EmulatorObservation } from './android/probe.js';
import { fenceAppium, inspectForeignAutomation, type AutomationScope, type FenceOptions } from '../appium/fence/index.js';
import { appiumComponentSchema, appiumProofSchema, fenceCommandSchema, fenceExecutorsSchema } from '../appium/fence/schema.js';
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
export const componentSchema = z.union([appiumComponentSchema, fenceCommandSchema, z.discriminatedUnion('kind', [
  z.strictObject({ id: bindingText, kind: z.literal('one-shot'), operation: bindingText }),
  z.strictObject({ id: bindingText, kind: z.literal('host-process'), process: ownerProcessSchema }),
  z.strictObject({ id: bindingText, kind: z.literal('adb-command'), serial: bindingText, args: z.array(z.string()).min(1) }),
  z.strictObject({ id: bindingText, kind: z.literal('android-stream'), serial: bindingText, args: z.array(z.string()).min(1) }),
  z.strictObject({ id: bindingText, kind: z.literal('android-agent'), serial: bindingText, classpath: bindingText, className: bindingText }),
  z.strictObject({ id: bindingText, kind: z.literal('android-forward'), serial: bindingText, local: bindingText, remote: bindingText }),
])]);
export const componentObservationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('host-start'), process: ownerProcessSchema }),
  z.strictObject({ kind: z.literal('agent-start'), pid: z.number().int().positive(), startTime: bindingText }),
  fenceExecutorsSchema,
]);
export type ComponentObservation = z.infer<typeof componentObservationSchema>;
export type ComponentInput = z.infer<typeof componentSchema>;
export const commandRequestSchema = z.strictObject({ requestId: bindingText, componentId: bindingText, operation: bindingText, payload: z.json(), recordResult: z.boolean().optional(), components: z.array(componentSchema).optional() });
export type CommandRequest = z.infer<typeof commandRequestSchema>;
export type IssueResult = { kind: 'issued' | 'retrieved'; command: CommandRecord };
const stopProofSchema = z.union([appiumProofSchema, z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed-command'), commandId: bindingText }),
  z.strictObject({ kind: z.literal('superseded-read'), commandId: bindingText }),
  z.strictObject({ kind: z.literal('adb-stopped'), process: ownerProcessSchema, commandId: bindingText }),
  z.strictObject({ kind: z.literal('android-component-stopped'), commandId: bindingText }),
  z.strictObject({ kind: z.literal('android-stream-exited'), process: ownerProcessSchema }),
  z.strictObject({ kind: z.literal('host-process-exited'), process: ownerProcessSchema,
    evidenceRefs: z.array(z.string().min(1).max(4096).refine(value => isAbsolute(value) && !value.includes('\0'))).min(1) }),
])]);
export const fenceRequestSchema = z.strictObject({ requestId: bindingText, kind: z.enum(FENCE_REQUEST_KINDS),
  components: z.array(z.strictObject({ componentId: bindingText, proof: stopProofSchema })), commands: z.array(bindingText) });
export type FenceRequest = z.infer<typeof fenceRequestSchema>;
export type FenceReceipt = { id: string; owner: OwnerIdentity; requestId: string; acceptedAt: number; proof: FenceRequest };
export const recoveryViewSchema = z.discriminatedUnion('closure', [
  z.strictObject({ id: bindingText, process: ownerProcessSchema, closedAt: z.null(), closure: z.null() }),
  z.strictObject({ id: bindingText, process: ownerProcessSchema, closedAt: z.number().int().nonnegative(), closure: z.enum(['accepted', 'refused', 'abandoned']) }),
]);
export type GenerationView = { owner: OwnerIdentity; dispatchClosedAt: number | null; inventoryUnknownReason: string | null;
  components: NativeComponent[]; commands: CommandRecord[]; componentObservations: { componentId: string; payload: unknown }[]; observations: { commandId: string; payload: unknown }[];
  recoveries: z.infer<typeof recoveryViewSchema>[] };
export type RecoveryIdentity = { id: string; owner: OwnerIdentity; token: string; process: OwnerProcess };
export type TerminalCandidate = { outcome: 'observed' | 'completed' | 'refused' | 'inconclusive'; disposition: 'available' | 'quarantined'; payload: unknown; evidenceRefs: string[] };
export type AttemptView = { identity: AttemptIdentity; category: DeviceCategory; device: string; digest: string; intent: unknown; owner: OwnerIdentity; state: 'active' | 'parked' | 'terminal'; cancellationRequested: boolean; terminal: TerminalCandidate | null };
export type DeviceView = { category: DeviceCategory; device: string; state: 'active' | 'available' | 'quarantined'; generation: number; owner: OwnerIdentity | null; reason: string | null };
export const emulatorProvenanceSchema = z.strictObject({ avdName: bindingText, avdId: bindingText,
  directory: z.strictObject({ device: bindingText, inode: bindingText }),
  version: z.strictObject({ value: bindingText, source: z.enum(['running-sdk-binary','process-discovery']) }),
  process: z.strictObject({ pid: z.number().int().positive(), startedAt: bindingText }) });
export type AdmissionRequest = { category?: DeviceCategory | undefined; device: string; attempt: AttemptIdentity; digest: string; intent: unknown; signal?: AbortSignal;
  provenance?: EmulatorObservation['provenance']; transport?: { serial: string; state: 'device' | 'offline' | 'unauthorized' } };
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
let incarnation: string | undefined;
const activeRecoveries = new Set<string>();
function currentProcess(): OwnerProcess {
  incarnation ??= processStart(process.pid) ?? `unknown-${randomUUID()}`;
  return { pid: process.pid, incarnation };
}
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
  static forTesting(options: { root: string; backend: 'fake'; initialize?: boolean; durability?: 'full' | 'fast' } & AdmissionDependencies): Admission {
    if (options.backend !== 'fake') throw new AdmissionError('INVALID_REQUEST', 'Test admission requires a fake backend');
    if (options.initialize !== false) AdmissionSqlite.initializeTestStore(options.root, options.durability);
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
    if (request.transport !== undefined && (!identity.category.startsWith('android-') || !z.strictObject({ serial: bindingText, state: z.enum(['device','offline','unauthorized']) }).safeParse(request.transport).success)) throw new AdmissionError('INVALID_REQUEST', 'Expected Android transport');
    if (request.provenance !== undefined && (identity.category !== 'android-emulator' || !emulatorProvenanceSchema.safeParse(request.provenance).success)) throw new AdmissionError('INVALID_REQUEST','Expected resolved emulator provenance');
    if (!request.digest.trim()) throw new AdmissionError('INVALID_REQUEST', 'Missing request digest');
    if (request.signal?.aborted) return { kind: 'refused', reason: 'CANCELLED' };
    let acquired = this.store.acquire({ ...request, category: identity.category, device }, this.dependencies.process ?? currentProcess());
    if (acquired.kind==='refused' && (acquired.reason==='DEVICE_BUSY'||acquired.reason==='DEVICE_QUARANTINED')) {
      const previous=this.store.inspect(device,identity.category)?.owner;
      if (previous && (this.dependencies.ownerLiveness?.(previous.process)??processLiveness(previous.process))==='dead') {
        this.store.quarantineAbandoned(previous,'OWNER_LOST');
        acquired=this.store.acquire({...request,category:identity.category,device},this.dependencies.process??currentProcess());
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
    const result = this.store.reserveAllocation(input, this.dependencies.process ?? currentProcess());
    if (result.kind !== 'reserved') return result;
    return { kind: 'reserved', reservation: new OwnedReservation(this.store, result.allocation) };
  }
  readAllocation(id: string): AllocationRecord | undefined { return this.store.readAllocation(canonicalAllocationId(id)); }
  readAllocationCommands(id: string): CommandRecord[] { return this.store.readAllocationCommands(canonicalAllocationId(id)); }
  readAllocationForAction(actionId: string): AllocationRecord | undefined { return this.store.readAllocationForAction(actionId); }
  consumeAllocation(binding: ActionBinding): ConsumeAllocationResult {
    const result = this.store.consumeAllocation({ ...binding, allocationId: canonicalAllocationId(binding.allocationId) }, this.dependencies.process ?? currentProcess());
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
  markerRecorded(identity: DeviceIdentity, token: string): boolean {
    return this.store.markerRecorded(canonicalDevice(identity), token);
  }
  readDeviceAttributes(identity: DeviceIdentity): unknown {
    const canonical=canonicalDevice(identity);
    return this.store.readDeviceAttributes(canonical);
  }
  inspectAppiumAutomation(identity: DeviceIdentity, inventory: Parameters<typeof inspectForeignAutomation>[1], transport?: { serial: string }): ReturnType<typeof inspectForeignAutomation> {
    const canonical = canonicalDevice(identity);
    const scope: AutomationScope | undefined = canonical.category === 'ios-simulator' ? { udid: canonical.value }
      : canonical.category === 'android-phone' ? { serial: canonical.value } : transport;
    if (!scope) throw new AdmissionError('INVALID_REQUEST', 'Emulator automation inspection needs the transport serial');
    return inspectForeignAutomation(this.store.readOwnedComponents(canonical), inventory, scope);
  }
  componentState(process: OwnerProcess): 'exited' | 'alive' | 'reused' | 'unknown' { return this.dependencies.componentLiveness?.(process) ?? componentLiveness(process); }
  submitFence(expected: OwnerIdentity, request: FenceRequest, recovery?: RecoveryIdentity): FenceReceipt {
    const parsed = fenceRequestSchema.safeParse(request);
    const exited = new Set<string>();
    if (parsed.success) for (const component of parsed.data.components) {
      if ((component.proof.kind === 'host-process-exited' || component.proof.kind === 'adb-stopped' || component.proof.kind === 'android-stream-exited') &&
        this.componentState(component.proof.process) === 'exited') exited.add(component.componentId);
    }
    const fenced = parsed.success ? parsed.data.components.filter(component => component.proof.kind === 'fenced-write') : [];
    if (fenced.length) {
      const observations = this.store.readGeneration(expected).componentObservations;
      for (const component of fenced) {
        const executors = observations.filter(observation => observation.componentId === component.componentId)
          .map(observation => fenceExecutorsSchema.safeParse(observation.payload)).find(parsed => parsed.success);
        if (executors?.data.processes.every(process => ['exited', 'reused'].includes(this.componentState(process)))) exited.add(component.componentId);
      }
    }
    return this.store.submitFence(expected, request, exited, recovery);
  }
  claimRecovery(expected: OwnerIdentity, requestId: string): { kind:'claimed'|'retrieved'; claim: RecoveryClaim } | { kind:'refused' } {
    const open=this.store.readGeneration(expected).recoveries.find(recovery=>recovery.closedAt===null);
    const abandoned=open&&(this.dependencies.ownerLiveness?.(open.process)??processLiveness(open.process))==='dead'?open:undefined;
    const result=this.store.claimRecovery(expected,requestId,this.dependencies.process??currentProcess(),abandoned);
    if (result.kind==='refused') return result;
    return {kind:result.kind,claim:new RecoveryClaim(this.store,result.identity,(request)=>this.submitFence(expected,request,result.identity))};
  }
  acquireWithAppiumRecovery(request: AdmissionRequest, options: FenceOptions): Promise<AdmissionResult> {
    return this.acquireWithRecovery(request, claim => fenceAppium({ ...options, admission: this, claim }));
  }
  async acquireWithRecovery(request: AdmissionRequest, sweep: (claim: RecoveryClaim)=>Promise<FenceRequest>): Promise<AdmissionResult> {
    const acquired=this.acquire(request);
    if (acquired.kind!=='refused'||acquired.reason!=='DEVICE_QUARANTINED') return acquired;
    const identity=canonicalDevice({category:request.category??'ios-simulator',value:request.device});
    const target=this.store.recoveryTarget(identity);
    if (!target||request.signal?.aborted) return acquired;
    const recoveryKey=JSON.stringify([target.category,target.device,target.token,target.generation]);
    if (activeRecoveries.has(recoveryKey)) return acquired;
    const claimant=this.dependencies.process??currentProcess();
    const completedClaims=this.store.readGeneration(target).recoveries.filter(recovery=>recovery.closedAt!==null
      && recovery.process.pid===claimant.pid && recovery.process.incarnation===claimant.incarnation).length;
    const requestId=createHash('sha256').update(JSON.stringify([recoveryKey,claimant.pid,claimant.incarnation,completedClaims])).digest('hex');
    activeRecoveries.add(recoveryKey);
    try {
      const recovery=this.claimRecovery(target,requestId);
      if (recovery.kind==='refused') return acquired;
      try {
        const proof=await sweep(recovery.claim);
        if(request.signal?.aborted) {recovery.claim.close();return {kind:'refused',reason:'CANCELLED'};}
        recovery.claim.submitFence(proof);
      } catch {
        try {recovery.claim.close();} catch {}
        return acquired;
      }
      return this.acquire(request);
    } finally { activeRecoveries.delete(recoveryKey); }
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
  get owner(): OwnerIdentity { return this.identity.owner; }
  observeComponent(componentId:string, observation:ComponentObservation):void { this.store.observeComponent(this.identity.owner,componentId,observation,this.identity); }
  registerComponent(component:ComponentInput):NativeComponent {return this.store.registerComponent(this.identity.owner,component,this.identity);}
  issue(request:CommandRequest):IssueResult {return this.store.authorizeRecovery(this.identity,request.operation,request);}
  async dispatchReads<T>(reads: readonly RecordedRead<T>[]): Promise<T[]> {
    if (this.closed) throw new AdmissionError('DISPATCH_CLOSED', 'Recovery dispatch is closed');
    try {
      const commands = this.store.authorizeReads(this.identity.owner, reads.map(read => read.operation), this.identity);
      return await runReads(this.store, this.identity.owner, commands, reads, () => this.closed);
    } catch (error) { this.closed = true; throw error; }
  }
  async dispatchSequence<T>(steps: readonly CommandStep<T>[]): Promise<T[]> {
    if (this.closed) throw new AdmissionError('DISPATCH_CLOSED', 'Recovery dispatch is closed');
    try {
      if (!steps.length) return [];
      const request = steps[0]!.request;
      const issued = typeof request === 'string' ? this.store.authorizeRecovery(this.identity, request) : this.issue(request);
      if (issued.kind !== 'issued') throw new AdmissionError('DISPATCH_CLOSED', 'A retrieved command cannot be sent again');
      return await runSequence(this.store, this.identity.owner, issued.command.id, steps, () => this.closed, this.identity);
    } catch (error) { this.closed = true; throw error; }
  }
  async dispatch<T>(operation: string|CommandRequest, effect: (commandId: string)=>Promise<T>): Promise<T> {
    if (this.closed) throw new AdmissionError('DISPATCH_CLOSED','Recovery dispatch is closed');
    let command:string;
    try {
      const issued=typeof operation==='string'?this.store.authorizeRecovery(this.identity,operation):this.issue(operation);
      if(issued.kind!=='issued')throw new AdmissionError('DISPATCH_CLOSED','A retrieved command cannot be sent again');
      command=issued.command.id;
    }
    catch(error){this.closed=true;throw error;}
    let result:T;
    try {result=await effect(command);}
    catch(error) {this.closed=true;this.store.settle(this.identity.owner,command,false);throw error;}
    try {this.store.settle(this.identity.owner,command,true,typeof operation!=='string'&&operation.recordResult?result:undefined);}
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
  markerKnown(token: string): boolean;
  markerReleased(): boolean;
  onRelease(callback: () => void): void;
  bindDriver(backend?: 'real' | 'fake'): AdmittedSession;
  cancel(): AttemptView | undefined;
  finalize(candidate: TerminalCandidate): Finalization;
  closeDispatch(candidate: TerminalCandidate): Finalization;
  registerComponent(component: ComponentInput): NativeComponent;
  observeComponent(componentId: string, observation: ComponentObservation): void;
  issue(request: CommandRequest): IssueResult;
  markInventoryUnknown(reason: string): void;
  /** The owner's own fence proofs for its release (park or an available finalize), taken after its last effect. */
  stageFence(request: FenceRequest): void;
}
class OwnedClaim implements AdmissionClaim {
  private closed = false;
  private cancellationRequested = false;
  private attached = false;
  private staged: FenceRequest | undefined;
  private closers: (() => void)[] = [];
  private releases: (() => void)[] = [];
  markerKnown(token: string): boolean { return this.store.markerKnown(this.identity, token); }
  markerReleased(): boolean { return this.store.markerReleased(this.identity); }
  onRelease(callback: () => void): void { this.releases.push(callback); }
  private notifyRelease(): void { if (this.markerReleased()) for (const callback of this.releases.splice(0)) callback(); }
  readonly identity: OwnerIdentity;
  constructor(private readonly store: AdmissionSqlite, identity: OwnerIdentity, private readonly parentClosed: () => boolean = () => false) {
    this.identity = Object.freeze({ ...identity, attempt: Object.freeze({ ...identity.attempt }), process: Object.freeze({ ...identity.process }) });
  }
  onClose(callback: () => void): void { this.closers.push(callback); }
  observeComponent(componentId: string, observation: ComponentObservation): void { this.store.observeComponent(this.identity,componentId,observation); }
  registerComponent(component: ComponentInput): NativeComponent { return this.store.registerComponent(this.identity, component); }
  issue(request: CommandRequest): IssueResult { return this.store.issue(this.identity, request); }
  markInventoryUnknown(reason: string): void { this.store.markInventoryUnknown(this.identity, reason); }
  stageFence(request: FenceRequest): void { this.staged = request; }
  stagedFence(): FenceRequest | undefined { return this.staged; }
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
    try { const allocation = this.store.parkAllocation(this.identity, readinessEvidence, evidenceRefs, this.staged); this.notifyRelease(); return { authority: 'committed', allocation }; }
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
    try { const attempt = this.store.finalize(this.identity, candidate, this.cancellationRequested, release, this.staged); if (release) this.notifyRelease(); return { authority: 'committed', attempt }; }
    catch (error) {
      if (error instanceof AdmissionError && error.code !== 'STATE_UNAVAILABLE') throw error;
      // Even a verified lost COMMIT reply is retrieval, never candidate publication.
      try { this.store.readAttempt(this.identity.attempt); } catch { /* Closed until authoritative resolution is possible. */ }
      return { authority: 'unconfirmed', reason: 'FINALIZATION_UNCONFIRMED' };
    }
  }
}
export type RecordedRead<T> = { operation: string | CommandRequest; read: (commandId: string) => Promise<T> };
export type CommandStep<T> = { request: string | CommandRequest; effect: (commandId: string) => Promise<T> };
async function runSequence<T>(store: AdmissionSqlite, owner: OwnerIdentity, first: string, steps: readonly CommandStep<T>[], closed: () => boolean, recovery?: RecoveryIdentity): Promise<T[]> {
  let command = first;
  const results: T[] = [];
  for (const [index, step] of steps.entries()) {
    let result: T;
    try {
      if (closed()) throw new AdmissionError('DISPATCH_CLOSED', 'Command sequence is closed');
      result = await step.effect(command);
    } catch (error) { store.settle(owner, command, false); throw error; }
    results.push(result);
    const recorded = typeof step.request !== 'string' && step.request.recordResult ? result : undefined;
    const next = steps[index + 1];
    if (next) command = store.advance(owner, command, recorded, next.request, recovery);
    else store.settle(owner, command, true, recorded);
  }
  return results;
}
async function runReads<T>(store: AdmissionSqlite, owner: OwnerIdentity, commands: string[], reads: readonly RecordedRead<T>[], closed: () => boolean): Promise<T[]> {
  const results: T[] = [];
  try {
    for (const [index, read] of reads.entries()) {
      if (closed()) throw new AdmissionError('DISPATCH_CLOSED', 'Read group is closed');
      results.push(await read.read(commands[index]!));
    }
    return results;
  } finally {
    store.settleReads(owner, commands, results.length, reads.map((read, index) =>
      typeof read.operation !== 'string' && read.operation.recordResult ? results[index] : undefined));
  }
}
export interface AdmittedSession {
  dispatch<T>(kind: string | CommandRequest, effect: (commandId: string) => Promise<T>): Promise<T>;
  dispatchReads<T>(reads: readonly RecordedRead<T>[]): Promise<T[]>;
  dispatchSequence<T>(steps: readonly CommandStep<T>[]): Promise<T[]>;
}
class OwnedSession implements AdmittedSession {
  private revoked = false;
  private pending: Promise<unknown> | undefined;
  constructor(private readonly store: AdmissionSqlite, private readonly owner: OwnerIdentity, private readonly closed: () => boolean) {}
  dispatchSequence<T>(steps: readonly CommandStep<T>[]): Promise<T[]> {
    if (this.revoked || this.closed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    if (this.pending) {
      this.store.assertDispatchOpen(this.owner);
      return this.pending.then(() => this.dispatchSequence(steps));
    }
    if (!steps.length) return Promise.resolve([]);
    let command: string;
    try {
      const request = steps[0]!.request;
      if (typeof request === 'string') command = this.store.authorize(this.owner, request);
      else {
        const issued = this.store.issue(this.owner, request);
        if (issued.kind !== 'issued') throw new AdmissionError('DISPATCH_CLOSED', 'A retrieved command cannot be sent again');
        command = issued.command.id;
      }
    } catch (error) { this.revoked = true; throw error; }
    const completion = runSequence(this.store, this.owner, command, steps, this.closed).catch(error => { this.revoked = true; throw error; });
    this.pending = completion;
    const clear = () => { if (this.pending === completion) this.pending = undefined; };
    void completion.then(clear, clear);
    return completion;
  }
  dispatchReads<T>(reads: readonly RecordedRead<T>[]): Promise<T[]> {
    if (this.revoked || this.closed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    if (this.pending) {
      this.store.assertDispatchOpen(this.owner);
      return this.pending.then(() => this.dispatchReads(reads));
    }
    let commands: string[];
    try { commands = this.store.authorizeReads(this.owner, reads.map(read => read.operation)); }
    catch (error) { this.revoked = true; throw error; }
    const completion = runReads(this.store, this.owner, commands, reads, this.closed).catch(error => { this.revoked = true; throw error; });
    this.pending = completion;
    const clear = () => { if (this.pending === completion) this.pending = undefined; };
    void completion.then(clear, clear);
    return completion;
  }
  dispatch<T>(kind: string | CommandRequest, effect: (commandId: string) => Promise<T>): Promise<T> {
    if (this.revoked || this.closed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    if (this.pending) {
      this.store.assertDispatchOpen(this.owner);
      return this.pending.then(()=>this.dispatch(kind,effect));
    }
    let command: string;
    try {
      if (typeof kind === 'string') command = this.store.authorize(this.owner, kind);
      else {
        const issued = this.store.issue(this.owner, kind);
        if (issued.kind !== 'issued') throw new AdmissionError('DISPATCH_CLOSED', 'Retrieved commands are never sent again');
        command = issued.command.id;
      }
    }
    catch (error) { this.revoked = true; throw error; }
    // No await between durable authorization and calling the backend. Cancellation
    // in another process can follow this authorization; it cannot retract it.
    let underlying: Promise<T>;
    try { underlying = effect(command); }
    catch (error) { this.revoked = true; this.store.settle(this.owner, command, false); throw error; }
    const completion = Promise.resolve(underlying).then(value => {
      try { this.store.settle(this.owner, command, true, typeof kind !== 'string' && kind.recordResult ? value : undefined); return value; }
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
  private admitted: OwnedClaim | undefined;
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
    this.admitted = new OwnedClaim(this.store, result.owner, () => this.closed);
    return { kind: 'admitted', claim: this.admitted };
  }
  fail(reason: AllocationReason, evidenceRefs: string[] = [], fence?: FenceRequest): AllocationCommit {
    this.closed = true;
    try { return { authority: 'committed', allocation: this.store.failAllocation(this.identity, reason, evidenceRefs, fence ?? this.admitted?.stagedFence()) }; }
    catch (error) { if (!(error instanceof AdmissionError) || error.code === 'STATE_UNAVAILABLE') return { authority: 'unconfirmed', reason: 'STATE_UNAVAILABLE' }; throw error; }
  }
}
