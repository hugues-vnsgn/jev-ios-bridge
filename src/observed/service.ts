import { isAbsolute, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CLEANUP_BUDGET_MS } from '../appium/fence/index.js';
import { Admission, AdmissionError, type OwnerProcess } from '../device/admission.js';
import type { ActionBinding, ConsumeAllocationResult, ObservedClaim, AllocationRecord, ActionRecordView } from '../device/admission-allocation.js';
import { createObservedDriver } from '../device/legacy-factory.js';
import type { ObservedActionDriver, MobileBuildMcpDriverOptions } from '../device/index.js';
import { runObservedTap, boundedObserved, type ObservedTapResult } from '../experimental/observed-tap.js';
import { FileObservedEvidence, type ObservedEvidenceStore } from './evidence.js';
import { renderObservedAction, type ObservedActionSnapshot } from './report.js';
import { ObservedOperationError, parseObservedAction, observedActionDigest, canonicalJson, observedActionIdSchema,
  observedReadOptionsSchema, type ObservedActionRequest } from './schema.js';

export interface ObservedAllocator<Result = unknown> {
  prepare(raw: unknown): Promise<Result>;
  get(id: string, options?: { waitMs?: number; signal?: AbortSignal }): Promise<Result>;
  cancel(id: string): Promise<Result>;
  retire(id: string): Promise<Result>;
  consume(binding: ActionBinding): ConsumeAllocationResult;
  close(): Promise<void>;
}
/** Admission is borrowed; per-operation SQLite lifetime remains inside the accepted capability. */
export interface ObservedServiceOptions<Result = unknown> {
  admission: Admission; runsDir: string; bridgeVersion: string; backend: 'real' | 'fake';
  createDriver: () => ObservedActionDriver; allocator?: ObservedAllocator<Result>; enabled?: boolean;
  evidence?: ObservedEvidenceStore;
  ownerLiveness?: (owner: OwnerProcess) => 'alive' | 'dead' | 'unknown';
}
interface ActionJob { claim: ObservedClaim; controller: AbortController; driver: ObservedActionDriver | undefined; done: Promise<void> }
function ownerLiveness(owner: OwnerProcess): 'alive' | 'dead' | 'unknown' {
  try { process.kill(owner.pid, 0); return 'alive'; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'; }
}
/** The pre-Appium action driver with the observed capture policy fixed, for its own tests. */
export function observedDriverFactory(options: MobileBuildMcpDriverOptions): () => ObservedActionDriver {
  return () => createObservedDriver({ ...options, capture: 'full', screenshots: true, stopAppOnClose: false,
    reuseActionCapture: false, verifyScreenshotAgreement: false });
}
/** One lifecycle and authoritative resolver, shared by public and historical adapters. */
export class ObservedActionService<Result = unknown> {
  private closed = false;
  private closing: Promise<void> | undefined;
  private readonly jobs = new Map<string, ActionJob>();
  private readonly unconfirmed = new Set<string>();
  private readonly evidence: ObservedEvidenceStore;
  constructor(private readonly options: ObservedServiceOptions<Result>) {
    options.admission.assertBackend(options.backend);
    this.evidence = options.evidence ?? new FileObservedEvidence();
  }
  private view(actionId: string): ActionRecordView | undefined {
    try { return this.options.admission.readAction(actionId); }
    catch { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Authoritative action state is unavailable', { actionId, acceptance: 'unknown' }); }
  }
  private snapshot(actionId: string, disposition: 'started' | 'retrieved' = 'retrieved'): ObservedActionSnapshot {
    const view = this.view(actionId);
    if (!view) throw new ObservedOperationError('ACTION_NOT_FOUND', 'Observed action was not found', { actionId });
    const unavailable = view.kind === 'allocation' && view.attempt?.state !== 'terminal' && !!view.attempt &&
      (this.options.ownerLiveness ?? ownerLiveness)(view.attempt.owner.process) === 'dead';
    return renderObservedAction(view, { disposition, ownerUnavailable: unavailable, finalizationUnconfirmed: this.unconfirmed.has(actionId) });
  }
  async start(raw: unknown): Promise<ObservedActionSnapshot> {
    const request = parseObservedAction(raw);
    if (this.closed) throw new ObservedOperationError('SHUTTING_DOWN', 'Observed execution is shutting down');
    if (this.options.enabled !== true) throw new ObservedOperationError('OBSERVED_DISABLED', 'Observed execution is disabled');
    const digest = observedActionDigest(request);
    const prior = this.view(request.actionId);
    if (prior?.kind === 'imported' || (prior?.kind === 'allocation' && (prior.allocation.allocationId !== request.allocationId ||
      prior.allocation.appBundleId !== request.app.bundleId || (prior.allocation.actionDigest !== null &&
        (prior.allocation.actionDigest !== digest || canonicalJson(prior.allocation.actionRequest) !== canonicalJson(request)))))) {
      throw new ObservedOperationError('ACTION_ID_CONFLICT', 'Observed action identity conflicts with its immutable binding', {
        actionId: request.actionId, allocationId: request.allocationId, acceptance: prior?.kind === 'imported' || prior?.allocation.actionDigest ? 'yes' : 'no' });
    }
    if (prior?.kind === 'allocation' && prior.allocation.actionDigest !== null) return this.snapshot(request.actionId);
    const directory = join(resolve(this.options.runsDir), 'observed', request.actionId);
    const binding: ActionBinding = { allocationId: request.allocationId, actionId: request.actionId, actionDigest: digest,
      request: JSON.parse(JSON.stringify(request)) as ActionBinding['request'], appBundleId: request.app.bundleId,
      evidence: { bridgeVersion: this.options.bridgeVersion, directory, request: join(directory, 'request.json') } };
    let result: ConsumeAllocationResult;
    try { result = this.options.allocator?.consume(binding) ?? this.options.admission.consumeAllocation(binding); }
    catch {
      // A lost consume reply can only retrieve. It can never attach a replacement owner.
      const resolved = this.view(request.actionId);
      if (resolved?.kind === 'allocation' && resolved.allocation.allocationId === request.allocationId &&
        resolved.allocation.appBundleId === request.app.bundleId && resolved.allocation.actionDigest === digest &&
        canonicalJson(resolved.allocation.actionRequest) === canonicalJson(request)) return this.snapshot(request.actionId);
      throw new ObservedOperationError('STORE_UNAVAILABLE', 'Action acceptance could not be confirmed', {
        actionId: request.actionId, allocationId: request.allocationId, acceptance: 'unknown', evidenceDirectory: directory });
    }
    if (result.kind === 'refused') {
      const code = result.reason === 'ACTION_ID_CONFLICT' ? 'ACTION_ID_CONFLICT' : result.reason === 'ALLOCATION_NOT_FOUND' ? 'ALLOCATION_NOT_FOUND'
        : result.reason === 'HOST_CREATION_UNRESOLVED' ? 'HOST_CREATION_UNRESOLVED' : 'ALLOCATION_NOT_READY';
      let evidenceDirectory: string | undefined;
      if (code === 'HOST_CREATION_UNRESOLVED') {
        try {
          const blocker = result.blockingAllocationId ? this.options.admission.readAllocation(result.blockingAllocationId) : undefined;
          if (!blocker || blocker.allocationId !== result.blockingAllocationId || !blocker.hostCreationBlocked || !isAbsolute(blocker.evidenceDirectory)) {
            throw new Error('Unverified blocker evidence');
          }
          evidenceDirectory = blocker.evidenceDirectory;
        } catch {
          throw new ObservedOperationError('STORE_UNAVAILABLE', 'Blocking allocation evidence is unavailable', {
            actionId: request.actionId, allocationId: request.allocationId,
            ...(result.blockingAllocationId ? { blockingAllocationId: result.blockingAllocationId } : {}) });
        }
      }
      throw new ObservedOperationError(code, 'Prepared allocation cannot be consumed', { actionId: request.actionId, allocationId: request.allocationId,
        ...(result.blockingAllocationId ? { blockingAllocationId: result.blockingAllocationId } : {}),
        ...(evidenceDirectory ? { evidenceDirectory } : {}) });
    }
    if (result.kind === 'retrieved') return this.snapshot(request.actionId);
    const job: ActionJob = { claim: result.claim, controller: new AbortController(), driver: undefined, done: Promise.resolve() };
    this.jobs.set(request.actionId, job);
    job.done = this.execute(request, result.allocation, job).catch(() => { this.unconfirmed.add(request.actionId); })
      .finally(() => { this.jobs.delete(request.actionId); });
    return this.snapshot(request.actionId, 'started');
  }
  /** Compatibility lookup never adopts a raw device or grants preparation permission. */
  async startHistorical(input: Omit<ObservedActionRequest, 'allocationId'>, device: string): Promise<ObservedActionSnapshot> {
    const request = parseObservedAction({ ...input, allocationId: '00000000-0000-4000-8000-000000000000' });
    const view = this.view(request.actionId);
    if (view?.kind === 'imported' && view.action.device === device) return this.snapshot(request.actionId);
    if (view?.kind !== 'allocation' || view.allocation.device !== device || view.allocation.appBundleId !== request.app.bundleId ||
      (view.allocation.actionDigest === null && view.allocation.state !== 'ready')) {
      throw new ObservedOperationError('MIGRATION_REQUIRED', 'Raw-device execution requires a matching bound ready allocation');
    }
    return this.start({ ...request, allocationId: view.allocation.allocationId });
  }
  private async execute(request: ObservedActionRequest, allocation: AllocationRecord, job: ActionJob): Promise<void> {
    const directory = allocation.actionEvidence!.directory;
    const deadline = AbortSignal.timeout(request.timeoutMs);
    const signal = AbortSignal.any([job.controller.signal, deadline]);
    const monitor = setInterval(() => {
      try {
        const view = this.view(request.actionId);
        if (view?.kind === 'allocation' && view.attempt?.cancellationRequested) {
          job.driver?.revokeIssuance(); job.controller.abort(new Error('CANCELLED'));
        }
      } catch { job.driver?.revokeIssuance(); job.controller.abort(new Error('STATE_UNAVAILABLE')); }
    }, 100);
    let result: ObservedTapResult = { status: 'inconclusive', reason: 'RESULT_EVIDENCE_UNCONFIRMED',
      actionAttempted: false, actionAcknowledged: false, observations: 0 };
    let attaching = false;
    try {
      await boundedObserved(() => this.evidence.prepare(directory, request), signal);
      attaching = true;
      job.driver = this.options.createDriver();
      await boundedObserved(() => job.driver!.attachObserved(job.claim, { app: request.app }, signal), signal);
      attaching = false;
      result = await runObservedTap({ request, claim: job.claim, admission: this.options.admission, driver: job.driver, signal,
        onObservation: async (snapshot, index) => {
          const refs = await this.evidence.observation(directory, snapshot, index);
          signal.throwIfAborted(); job.claim.recordObservation(refs);
        } });
    } catch (error) {
      let view: ActionRecordView | undefined;
      try { view = this.view(request.actionId); } catch { this.unconfirmed.add(request.actionId); }
      const progress = view?.kind === 'allocation' ? view.allocation.actionEvidence : null;
      result = { status: 'inconclusive', reason: signal.aborted ? job.controller.signal.aborted ? 'CANCELLED' : 'DEADLINE_EXCEEDED'
        : attaching || error instanceof AdmissionError ? 'PREPARATION_UNCONFIRMED' : 'RESULT_EVIDENCE_UNCONFIRMED',
        actionAttempted: progress?.actionAttempted ?? null, actionAcknowledged: progress?.actionAcknowledged ?? null,
        observations: progress?.observationCount ?? 0 };
    } finally { clearInterval(monitor); job.driver?.revokeIssuance(); }
    await this.finish(request, directory, job, result);
  }
  private async finish(request: ObservedActionRequest, directory: string, job: ActionJob, result: ObservedTapResult): Promise<void> {
    // The driver closes while the claim still issues, so it can fence its own components. A fencing driver's close
    // (a group stop alone is TERM, 5 s, then KILL) has its own cleanup budget; any other close shares the finish budget.
    const close = async (signal: AbortSignal) => {
      try { await boundedObserved(() => job.driver!.close(signal), signal); }
      catch { if (result.status !== 'inconclusive') result = { ...result, status: 'inconclusive', reason: 'FINISH_UNCONFIRMED' }; }
    };
    const cleanupBudgetMs = job.driver?.cleanupBudgetMs;
    if (job.driver && cleanupBudgetMs !== undefined) await close(AbortSignal.timeout(Math.min(cleanupBudgetMs, CLEANUP_BUDGET_MS)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('FINISH_UNCONFIRMED')), 5000);
    const finalization = controller.signal;
    try {
      if (job.driver && cleanupBudgetMs === undefined) await close(finalization);
      let began = true;
      try { job.claim.beginFinalization(); }
      catch { this.unconfirmed.add(request.actionId); began = false; }
      if (!began) return;
      // Observation has completed; cancellation remains live throughout the separate finalization budget.
      if (job.controller.signal.aborted && result.status !== 'inconclusive') result = { ...result, status: 'inconclusive', reason: 'CANCELLED' };
      try { await boundedObserved(() => this.evidence.provisional(directory, result), finalization); }
      catch { if (result.status !== 'inconclusive') result = { ...result, status: 'inconclusive', reason: 'RESULT_EVIDENCE_UNCONFIRMED' }; }
      const finalView = this.view(request.actionId);
      if ((job.controller.signal.aborted || (finalView?.kind === 'allocation' && finalView.attempt?.cancellationRequested)) && result.status !== 'inconclusive') {
        result = { ...result, status: 'inconclusive', reason: 'CANCELLED' };
      }
      const evidenceRefs = finalView?.kind === 'allocation' ? finalView.allocation.actionEvidence?.observations ?? [] : [];
      const finalized = job.claim.finalize({ outcome: result.status === 'outcome_observed' || result.status === 'already_satisfied' ? 'observed' : result.status,
        disposition: result.status === 'inconclusive' ? 'quarantined' : 'available', payload: { outcome: result.status, reason: result.reason },
        evidenceRefs: [join(directory, 'request.json'), ...evidenceRefs] });
      if (finalized.authority !== 'committed') this.unconfirmed.add(request.actionId);
      const committed = this.snapshot(request.actionId);
      if (committed.authority !== 'committed') return;
      // Projection errors cannot rewrite the immutable committed outcome or disposition.
      try {
        const terminal = await boundedObserved(() => this.evidence.terminal(directory, committed), finalization);
        this.options.admission.recordActionExport(request.actionId, { status: 'complete', terminal });
      } catch {
        try { this.options.admission.recordActionExport(request.actionId, { status: 'failed' }); } catch { /* Outcome remains committed. */ }
      }
    } finally { clearTimeout(timer); }
  }

  async inspect(actionId: string, options: { waitMs?: number; signal?: AbortSignal } = {}): Promise<ObservedActionSnapshot> {
    if (!observedActionIdSchema.safeParse(actionId).success) throw new ObservedOperationError('INVALID_REQUEST', 'Invalid action identity');
    const parsed = observedReadOptionsSchema.safeParse({ ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {}) });
    if (!parsed.success) throw new ObservedOperationError('INVALID_REQUEST', 'Invalid observed wait budget');
    const expires = Date.now() + parsed.data.waitMs;
    while (true) {
      if (options.signal?.aborted) throw new ObservedOperationError('WAIT_CANCELLED', 'Observed read wait was cancelled');
      const snapshot = this.snapshot(actionId);
      if (snapshot.state === 'terminal' || snapshot.state === 'unresolved' || Date.now() >= expires) {
        const job = this.jobs.get(actionId);
        if (snapshot.state === 'terminal' && job && Date.now() < expires) {
          try { await boundedObserved(() => job.done, AbortSignal.any([AbortSignal.timeout(Math.max(1, expires - Date.now())),
            ...(options.signal ? [options.signal] : [])])); } catch { /* Return current persisted state at the wait boundary. */ }
          if (options.signal?.aborted) throw new ObservedOperationError('WAIT_CANCELLED', 'Observed read wait was cancelled');
          return this.snapshot(actionId);
        }
        return snapshot;
      }
      try { await delay(Math.min(100, Math.max(1, expires - Date.now())), undefined, options.signal ? { signal: options.signal } : {}); }
      catch { throw new ObservedOperationError('WAIT_CANCELLED', 'Observed read wait was cancelled'); }
    }
  }
  async cancel(actionId: string): Promise<ObservedActionSnapshot> {
    if (!observedActionIdSchema.safeParse(actionId).success) throw new ObservedOperationError('INVALID_REQUEST', 'Invalid action identity');
    const job = this.jobs.get(actionId);
    // Explicit cancellation closes this owner's dispatch gate even when the authoritative read fails.
    if (job) { job.driver?.revokeIssuance(); job.controller.abort(new Error('CANCELLED')); }
    const prior = await this.inspect(actionId);
    if (prior.state === 'terminal') return prior;
    let durable = true;
    try { this.options.admission.cancel({ kind: 'observed', id: actionId }); }
    catch { durable = false; }
    finally {
      if (job) {
        job.driver?.revokeIssuance();
        try { job.claim.cancel(); } catch { /* Local issuance is closed even when durable cancellation is unavailable. */ }
        finally { job.controller.abort(new Error('CANCELLED')); }
      }
    }
    if (!durable) throw new ObservedOperationError('STORE_UNAVAILABLE', 'Cancellation could not be durably confirmed', { actionId, acceptance: 'yes' });
    if (job) {
      try { await boundedObserved(() => job.done, AbortSignal.timeout(5000)); } catch { /* No takeover or device cleanup. */ }
    }
    return this.snapshot(actionId);
  }
  /** Explicit recovery; construction, start retrieval, inspect and wait never call it. */
  recoverAbandoned(): void {
    for (const allocation of this.options.admission.listActiveAllocations()) {
      const view = this.view(allocation.actionId);
      if (view?.kind === 'allocation' && view.attempt?.state === 'active' &&
        (this.options.ownerLiveness ?? ownerLiveness)(view.attempt.owner.process) === 'dead') {
        this.options.admission.quarantineAbandoned(view.attempt.owner, 'OWNER_LOST');
      }
    }
  }
  private allocator(): ObservedAllocator<Result> {
    if (!this.options.allocator) throw new ObservedOperationError('CONFIGURATION_ERROR', 'Observed allocation is not configured', { acceptanceKind: 'preparation' });
    return this.options.allocator;
  }
  async prepareAllocation(raw: unknown): Promise<Result> {
    if (this.closed) throw new ObservedOperationError('SHUTTING_DOWN', 'Observed execution is shutting down', { acceptanceKind: 'preparation' });
    if (this.options.enabled !== true) throw new ObservedOperationError('OBSERVED_DISABLED', 'Observed execution is disabled', { acceptanceKind: 'preparation' });
    return this.allocator().prepare(raw);
  }
  async getAllocation(id: string, options?: { waitMs?: number; signal?: AbortSignal }): Promise<Result> { return this.allocator().get(id, options); }
  async cancelAllocation(id: string): Promise<Result> { return this.allocator().cancel(id); }
  async retireAllocation(id: string): Promise<Result> { return this.allocator().retire(id); }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const owned = [...this.jobs.values()];
    for (const job of owned) {
      job.driver?.revokeIssuance();
      try { job.claim.cancel(); } catch { /* The local gate closes even if storage is unavailable. */ }
      job.controller.abort(new Error('CANCELLED'));
    }
    let allocatorClose: Promise<void>;
    try { allocatorClose = this.options.allocator?.close() ?? Promise.resolve(); }
    catch { allocatorClose = Promise.reject(new Error('Allocator shutdown failed')); }
    this.closing = this.shutdown(owned, allocatorClose); return this.closing;
  }
  private async shutdown(owned: ActionJob[], allocatorClose: Promise<void>): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('FINISH_UNCONFIRMED')), 5000);
    try {
      await Promise.allSettled([...owned.map(job => boundedObserved(() => job.done, controller.signal)),
        boundedObserved(() => allocatorClose, controller.signal)]);
    } finally { clearTimeout(timer); }
  }
}
