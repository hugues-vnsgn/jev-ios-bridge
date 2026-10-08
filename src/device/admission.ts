import type { AllocationReservationInput, ReserveAllocationResult, AllocationRecord, AllocationOwner, AllocationReservation, AllocationCommit, AllocationReason, PreparationClaim, ActionBinding, ConsumeAllocationResult, ActionRecordView, ActionEvidence } from './admission-allocation.js';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { AdmissionError, AdmissionSqlite, type StoreOptions } from './admission-sqlite.js';
import type { ImportedObservedAction, MigrationReceipt } from './admission-migration.js';

export type AttemptIdentity = { kind: 'observed' | 'legacy' | 'preparation'; id: string };
export type OwnerProcess = { pid: number; incarnation: string };
export type OwnerIdentity = { device: string; attempt: AttemptIdentity; token: string; generation: number; process: OwnerProcess };
export type TerminalCandidate = { outcome: 'observed' | 'completed' | 'refused' | 'inconclusive'; disposition: 'available' | 'quarantined'; payload: unknown; evidenceRefs: string[] };
export type AttemptView = { identity: AttemptIdentity; device: string; digest: string; intent: unknown; owner: OwnerIdentity; state: 'active' | 'parked' | 'terminal'; cancellationRequested: boolean; terminal: TerminalCandidate | null };
export type DeviceView = { device: string; state: 'active' | 'available' | 'quarantined'; generation: number; owner: OwnerIdentity | null; reason: string | null };
export type AdmissionRequest = { device: string; attempt: AttemptIdentity; digest: string; intent: unknown; signal?: AbortSignal };
export type AdmissionResult = { kind: 'acquired'; claim: AdmissionClaim } | { kind: 'retrieved'; attempt: AttemptView } | { kind: 'refused'; reason: 'DEVICE_BUSY' | 'DEVICE_QUARANTINED' | 'ACTION_ID_CONFLICT' | 'CANCELLED' | 'HOST_CREATION_UNRESOLVED'; blockingAllocationId?: string };
export type Finalization = { authority: 'committed'; attempt: AttemptView } | { authority: 'unconfirmed'; reason: 'FINALIZATION_UNCONFIRMED' };
export type AdmissionFault = 'beforeCommit' | 'afterCommit';
export type AdmissionDependencies = { now?: () => number; process?: OwnerProcess; ownerLiveness?: (owner: OwnerProcess) => 'alive' | 'dead' | 'unknown'; fault?: (point: AdmissionFault, operation: string) => void };
const incarnation = randomUUID();
export { AdmissionError } from './admission-sqlite.js';
export function admissionRoot(): string { return join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge/admission'); }
export function canonicalDevice(input: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) throw new AdmissionError('INVALID_REQUEST', 'Expected a simulator UUID');
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
  readImportedAllocation(allocationId: string): ImportedObservedAction | undefined { return this.store.readImportedAllocation(canonicalDevice(allocationId)); }
  acquire(request: AdmissionRequest): AdmissionResult {
    validateAttempt(request.attempt);
    const device = canonicalDevice(request.device);
    if (!request.digest.trim()) throw new AdmissionError('INVALID_REQUEST', 'Missing request digest');
    if (request.signal?.aborted) return { kind: 'refused', reason: 'CANCELLED' };
    const acquired = this.store.acquire({ ...request, device }, this.dependencies.process ?? { pid: process.pid, incarnation });
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
  readAllocation(id: string): AllocationRecord | undefined { return this.store.readAllocation(canonicalDevice(id)); }
  readAllocationForAction(actionId: string): AllocationRecord | undefined { return this.store.readAllocationForAction(actionId); }
  consumeAllocation(binding: ActionBinding): ConsumeAllocationResult {
    const result = this.store.consumeAllocation({ ...binding, allocationId: canonicalDevice(binding.allocationId) }, this.dependencies.process ?? { pid: process.pid, incarnation });
    if (result.kind !== 'consumed') return result;
    return { kind: 'consumed', claim: new OwnedClaim(this.store, result.owner), allocation: result.allocation };
  }
  listActiveAllocations(): AllocationRecord[] { return this.store.listActiveAllocations(); }
  readAction(actionId: string): ActionRecordView | undefined { return this.store.readAction(actionId); }
  recordActionExport(actionId: string, result: { status: 'complete'; terminal: string } | { status: 'failed' }): AllocationRecord { return this.store.recordActionExport(actionId, result); }
  cancelAllocation(id: string) { return this.store.changeAllocation(canonicalDevice(id), 'cancel'); }
  retireAllocation(id: string) { return this.store.changeAllocation(canonicalDevice(id), 'retire'); }
  quarantineAbandonedAllocation(expected: AllocationOwner): boolean {
    const liveness = this.dependencies.ownerLiveness?.(expected.process) ?? processLiveness(expected.process);
    return liveness === 'dead' ? this.store.quarantineAbandonedAllocation(expected) : false;
  }
  inspect(device: string): DeviceView | undefined { return this.store.inspect(canonicalDevice(device)); }
  readAttempt(identity: AttemptIdentity): AttemptView | undefined { validateAttempt(identity); return this.store.readAttempt(identity); }
  cancel(identity: AttemptIdentity): AttemptView | undefined { validateAttempt(identity); return this.store.cancel(identity); }
  quarantineAbandoned(expected: OwnerIdentity, reason: string): boolean {
    const liveness = this.dependencies.ownerLiveness?.(expected.process) ?? processLiveness(expected.process);
    if (liveness !== 'dead') return false;
    return this.store.quarantineAbandoned(expected, reason);
  }
}
function processLiveness(owner: OwnerProcess): 'alive' | 'dead' | 'unknown' {
  try { process.kill(owner.pid, 0); return 'alive'; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'; }
}

/** Constructed only after durable acquisition. Tokens supplied by requests cannot attach a driver. */
export interface AdmissionClaim {
  readonly identity: OwnerIdentity;
  bindDriver(backend?: 'real' | 'fake'): AdmittedSession;
  cancel(): AttemptView | undefined;
  finalize(candidate: TerminalCandidate): Finalization;
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
  finalize(candidate: TerminalCandidate): Finalization {
    this.close();
    try { return { authority: 'committed', attempt: this.store.finalize(this.identity, candidate, this.cancellationRequested) }; }
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
  constructor(private readonly store: AdmissionSqlite, private readonly owner: OwnerIdentity, private readonly closed: () => boolean) {}
  dispatch<T>(kind: string, effect: () => Promise<T>): Promise<T> {
    if (this.revoked || this.closed()) throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
    let command: string;
    try { command = this.store.authorize(this.owner, kind); }
    catch (error) { this.revoked = true; throw error; }
    // No await between durable authorization and calling the backend. Cancellation
    // in another process can follow this authorization; it cannot retract it.
    let underlying: Promise<T>;
    try { underlying = effect(); }
    catch (error) { this.revoked = true; this.store.settle(this.owner, command, false); throw error; }
    return Promise.resolve(underlying).then(value => {
      try { this.store.settle(this.owner, command, true); return value; }
      catch (error) { this.revoked = true; throw error; }
    }, error => { this.revoked = true; this.store.settle(this.owner, command, false); throw error; });
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
