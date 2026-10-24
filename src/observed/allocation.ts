import * as fs from 'node:fs/promises';
import { isAbsolute, join, dirname, resolve } from 'node:path';
import { Admission, AdmissionError } from '../device/admission.js';
import type { ActionBinding, AllocationRecord, AllocationReservation, AllocationReason, ConsumeAllocationResult } from '../device/admission-allocation.js';
import { DeviceCliError, deviceWindowOpener, type CliRunner, type DeviceWindowOpener, type IosPreparationDriver } from '../device/index.js';
import { createPreparationDriver } from '../device/legacy-factory.js';
import { inspectArtifact, stageArtifact, verifyStagedArtifact, ArtifactError, type ArtifactRequest } from './artifact.js';
import { createSimulator, type SourceProcess } from './create-source.js';
import { selectSuppliedSource } from './supplied-source.js';
import { readAllocationConfig, installedHost, allocationSourceProcess, allocationStorage, verifyInstalledCompatibility, trackAllocationSourceProcess,
  AllocationPrerequisiteError, stableFile, isProductionSourceProcess, type InstalledHost } from './allocation-config.js';
import { allocationSnapshot, importedAllocationSnapshot, allocationError, allocationIdSchema, allocationActionIdSchema, AllocationInputError, parsePrepareAllocation, preparationDigest,
  type PrepareAllocationRequest, type AllocationResult, type AllocationOperationCode } from './allocation-schema.js';
export type { AllocationSnapshotV1, AllocationOperationError, AllocationResult } from './allocation-schema.js';

export type AllocatorOptions = {
  runsDir: string; admission?: Admission;
  /** The preparation driver for one admitted allocation. Production passes the Appium driver; a fake backend without one
   *  keeps the pre-Appium fake driver its own tests use. */
  createDriver?: () => IosPreparationDriver;
  fakeBackend?: { process: SourceProcess; runner: CliRunner; window: DeviceWindowOpener | undefined; host: InstalledHost };
};
type Job = { actionId: string; digest: string; controller: AbortController; deadline: number;
  reservation?: AllocationReservation; reservationAttempted?: boolean; driver?: IosPreparationDriver; phase: AllocationRecord['phase']; evidence: string[]; diagnostics: string[]; diagnosticsClosed: boolean;
  promise?: Promise<AllocationResult> };
const stageReasons: Partial<Record<AllocationRecord['phase'], AllocationReason>> = { booting: 'BOOT_FAILED', installing: 'INSTALL_FAILED', launching: 'LAUNCH_FAILED', readiness: 'READINESS_FAILED' };
class PreparationFailure extends Error { constructor(readonly reason: AllocationReason) { super(reason); } }
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((done, fail) => {
    const cancel = () => fail(signal.reason); signal.addEventListener('abort', cancel, { once: true });
    promise.then(done, fail).finally(() => signal.removeEventListener('abort', cancel)).catch(() => {});
    if (signal.aborted) cancel();
  });
}
async function pause(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((done, fail) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); done(); }, ms);
    const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); fail(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  });
}
/** The store owns identity and authority. This module owns only preparation scheduling and bounded local operations. */
export class ObservedAllocator {
  private readonly admission: Admission;
  private readonly host: InstalledHost;
  private readonly jobs = new Map<string, Job>();
  private readonly pending = new Set<Promise<unknown>>();
  private closed = false;
  private closing: Promise<void> | undefined;
  constructor(private readonly options: AllocatorOptions) {
    if (!isAbsolute(options.runsDir) || options.runsDir.includes('\0') || options.runsDir.length > 4096 || (!options.fakeBackend && !options.createDriver)) throw new AllocationInputError('CONFIG_INVALID');
    if (options.fakeBackend && (!options.admission || !Object.hasOwn(options.fakeBackend, 'window')
      || typeof options.fakeBackend.process !== 'function' || typeof options.fakeBackend.runner !== 'function'
      || isProductionSourceProcess(options.fakeBackend.process) || (options.fakeBackend.window !== undefined && options.fakeBackend.window === deviceWindowOpener(false, {})))) throw new AllocationInputError('CONFIG_INVALID');
    this.admission = options.admission ?? Admission.open();
    this.admission.assertBackend(options.fakeBackend ? 'fake' : 'real');
    this.host = options.fakeBackend?.host ?? installedHost();
  }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise); promise.then(() => this.pending.delete(promise), () => this.pending.delete(promise)); return promise;
  }
  private local<T>(job: Job, promise: Promise<T>, signal = job.controller.signal): Promise<T> {
    return abortable(this.track(promise), signal);
  }
  async prepare(raw: unknown): Promise<AllocationResult> {
    let request: PrepareAllocationRequest;
    try { request = parsePrepareAllocation(raw); } catch (error) { return allocationError(error instanceof AllocationInputError ? error.code : 'INVALID_REQUEST'); }
    const digest = preparationDigest(request);
    try {
      const existing = this.admission.readAllocationForAction(request.actionId);
      if (existing) return existing.preparationDigest === digest ? allocationSnapshot(existing)
        : allocationError('ACTION_ID_CONFLICT', this.identity(existing), 'yes');
      const imported = this.admission.readImportedAction(request.actionId);
      if (imported) return allocationError('ACTION_ID_CONFLICT', { actionId: request.actionId, allocationId: imported.allocationId });
      if (this.admission.readAttempt({ kind: 'observed', id: request.actionId }) || this.admission.readAttempt({ kind: 'preparation', id: request.actionId })) {
        return allocationError('ACTION_ID_CONFLICT', { actionId: request.actionId });
      }
    } catch { return allocationError('STORE_UNAVAILABLE', { actionId: request.actionId }, 'unknown'); }
    if (this.closed) return allocationError('SHUTTING_DOWN', { actionId: request.actionId });
    const running = this.jobs.get(request.actionId);
    if (running) return running.digest === digest ? running.promise! : allocationError('ACTION_ID_CONFLICT', { actionId: request.actionId });
    const job: Job = { actionId: request.actionId, digest, controller: new AbortController(), deadline: Date.now() + request.timeoutMs,
      phase: 'reserved', evidence: [], diagnostics: [], diagnosticsClosed: false };
    this.jobs.set(request.actionId, job);
    job.promise = this.execute(job, request).finally(() => { if (this.jobs.get(job.actionId) === job) this.jobs.delete(job.actionId); });
    return job.promise;
  }
  private identity(record: AllocationRecord) { return { actionId: record.actionId, allocationId: record.allocationId, evidenceDirectory: record.evidenceDirectory }; }
  private imported(id: string): AllocationResult | undefined {
    const historical = this.admission.readImportedAllocation(id); if (!historical) return undefined;
    const view = this.admission.readAction(historical.actionId);
    if (view?.kind !== 'imported' || view.action.allocationId !== id || view.action.actionId !== historical.actionId
      || view.action.device !== historical.device || view.action.outcome !== historical.outcome) throw new AllocationInputError('STORE_UNAVAILABLE');
    return importedAllocationSnapshot(view);
  }
  private reservationRefusal(reason: AllocationReason, actionId: string, blockingAllocationId?: string): AllocationResult {
    const identity = { actionId, ...(blockingAllocationId ? { blockingAllocationId } : {}) };
    if (reason !== 'HOST_CREATION_UNRESOLVED') return allocationError(reason, identity);
    try {
      const blocker = blockingAllocationId ? this.admission.readAllocation(blockingAllocationId) : undefined;
      if (!blocker || blocker.allocationId !== blockingAllocationId || !blocker.hostCreationBlocked || !isAbsolute(blocker.evidenceDirectory)) throw new AllocationInputError('STORE_UNAVAILABLE');
      return allocationError(reason, { ...identity, evidenceDirectory: blocker.evidenceDirectory });
    } catch { return allocationError('STORE_UNAVAILABLE', identity); }
  }
  private check(job: Job): void {
    job.controller.signal.throwIfAborted();
    if (Date.now() >= job.deadline) throw new PreparationFailure(job.phase === 'readiness' ? 'READINESS_FAILED' : 'PREPARATION_UNCONFIRMED');
    if (job.reservation) {
      const record = this.admission.readAllocation(job.reservation.identity.allocationId);
      if (!record || record.cancellationRequested || record.state !== 'preparing') throw new PreparationFailure('CANCELLED');
    }
  }
  private async stage<T>(job: Job, limit: number, effect: (signal: AbortSignal, remaining: () => number) => Promise<T>): Promise<T> {
    this.check(job); const deadline = Math.min(job.deadline, Date.now() + limit); const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, job.controller.signal]);
    const remaining = () => { signal.throwIfAborted(); this.check(job); const left = deadline - Date.now();
      if (left <= 0) throw new PreparationFailure(job.phase === 'readiness' ? 'READINESS_FAILED' : 'PREPARATION_UNCONFIRMED'); return left; };
    const timer = setTimeout(() => controller.abort(new PreparationFailure(job.phase === 'readiness' ? 'READINESS_FAILED' : 'PREPARATION_UNCONFIRMED')), Math.max(1, deadline - Date.now()));
    try { return await this.local(job, effect(signal, remaining), signal); }
    finally { clearTimeout(timer); }
  }
  private async directory(path: string): Promise<void> {
    const normalized = resolve(path); if (normalized !== path) throw new Error('Evidence directory must be canonical');
    const parts = normalized.split('/').filter(Boolean); let cursor = '/';
    for (let i = 0; i < parts.length; i++) {
      cursor = join(cursor, parts[i]!);
      let s;
      try { s = await fs.lstat(cursor); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await fs.mkdir(cursor, { mode: 0o700 }); s = await fs.lstat(cursor); }
      if (s.isSymbolicLink() || !s.isDirectory()) throw new Error('Unsafe evidence directory');
      if (cursor === normalized && (s.uid !== this.host.account.uid || (s.mode & 0o777) !== 0o700)) throw new Error('Evidence root must be private');
    }
  }
  private async write(path: string, content: string | Buffer, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted(); const file = await fs.open(path, 'wx', 0o600);
    try { await file.writeFile(content); await file.sync(); signal.throwIfAborted(); }
    finally { await file.close(); }
  }
  private diagnostic(job: Job, operation: string, outcome: unknown): void {
    if (job.diagnosticsClosed || job.controller.signal.aborted) return;
    try {
      const bounded = (value: string) => Buffer.from(value).subarray(0, 16384).toString('utf8');
      const value = outcome instanceof Error ? { operation, error: bounded(outcome.message), ...(outcome instanceof DeviceCliError ? { code: bounded(outcome.code), terminalAcknowledged: outcome.terminalAcknowledged } : {}) }
        : { operation, exitCode: (outcome as { exitCode: number | null }).exitCode,
          stdout: bounded((outcome as { stdout: string }).stdout), stderr: bounded((outcome as { stderr: string }).stderr) };
      const entry = JSON.stringify(value);
      if (Buffer.byteLength('[' + [...job.diagnostics, entry].join(',') + ']') <= 65536) job.diagnostics.push(entry);
    } catch { /* Private diagnostics never authorize work or replace the original outcome. */ }
  }
  private async persistDiagnostics(job: Job, signal: AbortSignal): Promise<void> {
    job.diagnosticsClosed = true; if (!job.reservation || !job.diagnostics.length) return;
    const path = join(job.reservation.snapshot.evidenceDirectory, 'source-diagnostics.json');
    if (job.evidence.includes(path)) return;
    await abortable(this.track(this.write(path, '[' + job.diagnostics.join(',') + ']', signal)), signal); job.evidence.push(path);
  }
  private async storage(job: Job, staging: string, artifactBytes: number, signal = job.controller.signal): Promise<void> {
    this.check(job); const record = this.admission.readAllocation(job.reservation!.identity.allocationId)!;
    const capacity = this.admission.readAllocationCapacity(); const storage = await this.local(job, allocationStorage(this.host, staging), signal); this.check(job);
    const b = record.budgets;
    if (capacity.heldAllocations > b.maxRetainedAllocations || capacity.reservedBytes > b.maxReservedBytes) throw new PreparationFailure('BUDGET_EXHAUSTED');
    if (storage.simulatorFreeBytes - capacity.reservedBytes < b.minFreeBytes
      || storage.stagingFreeBytes - capacity.reservedBytes - artifactBytes < b.minFreeBytes) throw new PreparationFailure('STORAGE_UNAVAILABLE');
  }
  private async execute(job: Job, request: PrepareAllocationRequest): Promise<AllocationResult> {
    const overall = setTimeout(() => job.controller.abort(new PreparationFailure(job.phase === 'readiness' ? 'READINESS_FAILED' : 'PREPARATION_UNCONFIRMED')), request.timeoutMs);
    const monitor = setInterval(() => { if (job.reservation) {
      try { const record = this.admission.readAllocation(job.reservation.identity.allocationId);
        if (!record || record.cancellationRequested) job.controller.abort(new PreparationFailure('CANCELLED')); }
      catch { job.controller.abort(new PreparationFailure('STATE_UNAVAILABLE')); }
    } }, 100);
    try {
      const config = await this.local(job, readAllocationConfig({ account: this.host.account, fs: this.host.fs })); this.check(job);
      const selected = request.source.kind === 'create' ? { status: 'selected' as const, source: request.source }
        : selectSuppliedSource(request.source.inventoryId, config.inventory);
      if (selected.status !== 'selected') throw new PreparationFailure(selected.reason);
      const source = { ...selected.source, kind: request.source.kind } as AllocationRecord['source'];
      const evidenceDirectory = join(resolve(this.options.runsDir), 'observed', request.actionId, 'allocation');
      const stagingRoot = join(evidenceDirectory, 'staging');
      const process = this.options.fakeBackend?.process ?? allocationSourceProcess(this.host, [request.app.artifactPath, stagingRoot]);
      const trackedProcess = trackAllocationSourceProcess(process, (file, invoke) => this.track(Promise.resolve().then(invoke).then(
        receipt => { this.diagnostic(job, file, receipt); return receipt; }, error => { this.diagnostic(job, file, error); throw error; })));
      const proof = await this.stage(job, 10000, signal => verifyInstalledCompatibility(source, this.host, trackedProcess, signal));
      const artifactRequest: ArtifactRequest = { ...request.app, target: proof, maxBytes: config.budgets.maxArtifactBytes, stagingRoot };
      const inspected = await this.stage(job, Math.max(1, job.deadline - Date.now()), signal => inspectArtifact(artifactRequest, { process: trackedProcess, signal }));
      await this.local(job, this.directory(resolve(this.options.runsDir))); this.check(job);
      const storage = await this.local(job, allocationStorage(this.host, resolve(this.options.runsDir))); this.check(job);
      job.reservationAttempted = true;
      const reserved = this.admission.reserveAllocation({ actionId: request.actionId, preparationDigest: job.digest, preparation: request,
        appBundleId: request.app.bundleId, source, inspectedContentDigest: inspected.contentDigest, artifactBytes: inspected.bytes,
        configVersion: config.version, configDigest: config.digest, budgets: { ...config.budgets, timeoutMs: request.timeoutMs }, storage, evidenceDirectory });
      if (reserved.kind === 'retrieved') return allocationSnapshot(reserved.allocation);
      if (reserved.kind === 'refused') return this.reservationRefusal(reserved.reason, request.actionId, reserved.blockingAllocationId);
      job.reservation = reserved.reservation; this.check(job);
      await this.local(job, this.directory(dirname(evidenceDirectory))); await this.local(job, fs.mkdir(evidenceDirectory, { mode: 0o700 })); await this.local(job, fs.mkdir(stagingRoot, { mode: 0o700 }));
      const proofPath = join(evidenceDirectory, 'host-prerequisites.json');
      await this.local(job, this.write(proofPath, JSON.stringify(proof), job.controller.signal)); job.evidence.push(proofPath);
      const requestPath = join(evidenceDirectory, 'preparation-request.json'); await this.local(job, this.write(requestPath, JSON.stringify(request), job.controller.signal)); job.evidence.push(requestPath);
      const staged = await this.stage(job, Math.max(1, job.deadline - Date.now()), signal => stageArtifact(artifactRequest, { process: trackedProcess, signal }));
      if (staged.contentDigest !== inspected.contentDigest || staged.bytes !== inspected.bytes) throw new PreparationFailure('ARTIFACT_INVALID');
      job.reservation.stage(staged);
      await this.local(job, verifyStagedArtifact(staged, { signal: job.controller.signal })); await this.storage(job, stagingRoot, staged.bytes);
      if (source.kind === 'create') {
        job.phase = 'creating';
        const receipt = await createSimulator({ allocationId: job.reservation.identity.allocationId, deviceTypeId: source.deviceTypeId,
          runtimeId: source.runtimeId, timeoutMs: Math.max(1, Math.min(config.budgets.createTimeoutMs, job.deadline - Date.now())) },
        { process: trackedProcess, signal: job.controller.signal, dispatch: operation => job.reservation!.create(operation) });
        if (receipt.status !== 'created') throw new PreparationFailure(receipt.status === 'unknown' ? 'CREATE_UNCONFIRMED' : receipt.reason);
      }
      this.check(job); job.phase = 'admitting'; const admitted = job.reservation.admit();
      if (admitted.kind !== 'admitted') throw new PreparationFailure(admitted.reason);
      job.driver = this.options.createDriver?.() ?? createPreparationDriver({ cwd: evidenceDirectory, admission: this.admission, capture: 'full', screenshots: true,
        ...(this.options.fakeBackend ? { runner: this.options.fakeBackend.runner, deviceWindow: this.options.fakeBackend.window ?? (async () => {}),
          fakeBackend: { runner: this.options.fakeBackend.runner, window: this.options.fakeBackend.window }, lockRoot: join(this.options.runsDir, 'leases') } : {}) });
      await job.driver.attachPreparation(admitted.claim, { app: { bundleId: request.app.bundleId } }, job.controller.signal);
      // Supplied availability is verified through the admitted driver capability, never a bare runner.
      if (source.kind === 'supplied') {
        const status = await this.stage(job, config.budgets.bootTimeoutMs, (signal, remaining) => job.driver!.inventoryStatus(signal, remaining()));
        if (!status?.isAvailable) throw new PreparationFailure('INVENTORY_INELIGIBLE');
      }
      job.phase = 'booting';
      await this.stage(job, config.budgets.bootTimeoutMs, async (signal, remaining) => {
        await job.driver!.boot(signal, remaining());
        while (await job.driver!.bootState(signal, remaining()) !== 'Booted') await pause(1000, signal);
      });
      job.phase = 'installing';
      await this.stage(job, config.budgets.installTimeoutMs, async (signal, remaining) => {
        await this.local(job, verifyStagedArtifact(staged, { signal }), signal); await this.storage(job, stagingRoot, staged.bytes, signal);
        await job.driver!.install(staged.stagedPath, signal, remaining());
      });
      job.phase = 'launching'; await this.stage(job, config.budgets.launchTimeoutMs, (signal, remaining) => job.driver!.launch(signal, remaining()));
      job.phase = 'readiness';
      const refs = await this.stage(job, config.budgets.readinessTimeoutMs, async (signal, remaining) => {
        let observation;
        while (true) {
          try { observation = await job.driver!.readiness(signal, remaining()); break; }
          catch (error) { if (!(error instanceof DeviceCliError && error.terminalAcknowledged && error.code === 'READINESS_FAILED')) throw error; await pause(1000, signal); }
        }
        const refs: string[] = []; this.check(job); signal.throwIfAborted();
        if (observation.screenshotPath) {
          if (!isAbsolute(observation.screenshotPath)) throw new Error('Screenshot path is invalid');
          const screenshot = await this.local(job, stableFile(observation.screenshotPath, fs, 10 * 1024 ** 2), signal);
          const path = join(evidenceDirectory, 'readiness-1.jpg'); await this.local(job, this.write(path, screenshot, signal), signal); refs.push(path); observation = { ...observation, screenshotPath: path };
        }
        const path = join(evidenceDirectory, 'readiness-1.json'); await this.local(job, this.write(path, JSON.stringify(observation), signal), signal); refs.unshift(path); return refs;
      });
      await this.persistDiagnostics(job, job.controller.signal); this.check(job); const commit = await job.driver.park(refs, job.evidence, job.controller.signal);
      if (commit.authority !== 'committed') throw new PreparationFailure('STATE_UNAVAILABLE');
      this.jobs.delete(job.actionId); return allocationSnapshot(commit.allocation);
    } catch (error) {
      this.diagnostic(job, 'preparation/' + job.phase, error); job.diagnosticsClosed = true;
      const reason = error instanceof PreparationFailure ? error.reason : error instanceof AllocationPrerequisiteError ? error.reason
        : error instanceof ArtifactError ? error.reason : error instanceof DeviceCliError && error.terminalAcknowledged
          ? stageReasons[job.phase] ?? 'ADMISSION_REFUSED'
          : job.controller.signal.aborted && job.controller.signal.reason instanceof PreparationFailure ? job.controller.signal.reason.reason
          : error instanceof AdmissionError ? 'STATE_UNAVAILABLE' : job.phase === 'readiness' ? 'READINESS_FAILED' : 'PREPARATION_UNCONFIRMED';
      if (!job.reservation) {
        if (job.reservationAttempted) {
          try { const accepted = this.admission.readAllocationForAction(request.actionId);
            if (accepted) return accepted.preparationDigest === job.digest ? allocationSnapshot(accepted)
              : allocationError('ACTION_ID_CONFLICT', this.identity(accepted), 'yes');
          } catch { return allocationError('STORE_UNAVAILABLE', { actionId: request.actionId }, 'unknown'); }
        }
        return allocationError(reason as AllocationOperationCode, { actionId: request.actionId });
      }
      job.driver?.revokeIssuance();
      const finalizationSignal = AbortSignal.timeout(5000);
      const finalized = await Promise.allSettled([
        this.persistDiagnostics(job, finalizationSignal),
        job.driver ? abortable(this.track(job.driver.close(finalizationSignal)), finalizationSignal) : Promise.resolve(),
      ]);
      // A deadline wrapper is not proof that the underlying local close settled.
      const alreadyUncertain = ['PREPARATION_UNCONFIRMED', 'CREATE_UNCONFIRMED', 'READINESS_FAILED', 'CANCELLED'].includes(reason);
      const terminalReason = finalized.some(result => result.status === 'rejected') && !alreadyUncertain ? 'PREPARATION_UNCONFIRMED' : reason;
      try {
        const before = this.admission.readAllocation(job.reservation.identity.allocationId);
        if (before && before.state !== 'preparing') return allocationSnapshot(before);
        const commit = job.reservation.fail(terminalReason, job.evidence);
        if (commit.authority === 'committed') return allocationSnapshot(commit.allocation);
      } catch { /* Fresh authoritative retrieval is the only remaining authority path. */ }
      try { const record = this.admission.readAllocation(job.reservation.identity.allocationId); if (record) return allocationSnapshot(record); } catch { /* No alternate storage. */ }
      return allocationError('STORE_UNAVAILABLE', { actionId: request.actionId, allocationId: job.reservation.identity.allocationId }, 'unknown');
    } finally { clearInterval(monitor); clearTimeout(overall); }
  }
  async get(id: string, options: { waitMs?: number; signal?: AbortSignal } = {}): Promise<AllocationResult> {
    const parsed = allocationIdSchema.safeParse(id); const wait = options.waitMs ?? 0;
    if (!parsed.success || !Number.isSafeInteger(wait) || wait < 0 || wait > 45000) return allocationError('INVALID_REQUEST');
    const deadline = Date.now() + wait;
    try {
      while (true) {
        if (options.signal?.aborted) return allocationError('WAIT_CANCELLED', { allocationId: parsed.data }, 'unknown');
        const record = this.admission.readAllocation(parsed.data);
        if (!record) return this.imported(parsed.data) ?? allocationError('ALLOCATION_NOT_FOUND', { allocationId: parsed.data });
        if (record.state !== 'preparing' || Date.now() >= deadline) return allocationSnapshot(record);
        await pause(Math.min(100, deadline - Date.now()), options.signal ?? new AbortController().signal);
      }
    } catch { return allocationError(options.signal?.aborted ? 'WAIT_CANCELLED' : 'STORE_UNAVAILABLE', { allocationId: parsed.data }, 'unknown'); }
  }
  private async change(id: string, operation: 'cancel' | 'retire'): Promise<AllocationResult> {
    const parsed = allocationIdSchema.safeParse(id); if (!parsed.success) return allocationError('INVALID_REQUEST');
    // A stored claim identifies our local job without relying on a fallible store read.
    const owned = operation === 'cancel' ? [...this.jobs.values()].find(job => job.reservation?.identity.allocationId === parsed.data) : undefined;
    const revokeOwned = () => { owned?.controller.abort(new PreparationFailure('CANCELLED')); owned?.driver?.revokeIssuance(); };
    try {
      if (!this.admission.readAllocation(parsed.data)) {
        const historical = this.imported(parsed.data); if (historical) return historical;
      }
      const changed = operation === 'cancel' ? this.admission.cancelAllocation(parsed.data) : this.admission.retireAllocation(parsed.data);
      if (changed.kind === 'refused') {
        if (changed.reason === 'ALLOCATION_BUSY') {
          const current = this.admission.readAllocation(parsed.data);
          if (!current || current.allocationId !== parsed.data || !(current.state === 'executing' || operation === 'retire' && current.state === 'preparing')
            || !allocationActionIdSchema.safeParse(current.actionId).success
            || !isAbsolute(current.evidenceDirectory)) throw new AllocationInputError('STORE_UNAVAILABLE');
          return allocationError(changed.reason, { ...this.identity(current), state: current.state }, 'yes');
        }
        return allocationError(changed.reason, { allocationId: parsed.data }, changed.reason === 'ALLOCATION_NOT_FOUND' ? 'no' : 'yes');
      }
      const job = this.jobs.get(changed.allocation.actionId);
      if (operation === 'cancel' && job && changed.allocation.state === 'preparing') {
        job.controller.abort(new PreparationFailure('CANCELLED')); job.driver?.revokeIssuance();
        await abortable(job.promise!, AbortSignal.timeout(5000)).catch(() => {});
      }
      return await this.get(parsed.data);
    } catch { revokeOwned(); return allocationError('STORE_UNAVAILABLE', { allocationId: parsed.data }, 'unknown'); }
  }
  cancel(id: string): Promise<AllocationResult> { return this.change(id, 'cancel'); }
  retire(id: string): Promise<AllocationResult> { return this.change(id, 'retire'); }
  consume(binding: ActionBinding): ConsumeAllocationResult { return this.admission.consumeAllocation(binding); }
  /** Explicit startup maintenance only. Reads never recover or take over another owner. */
  recoverAbandoned(): number {
    let recovered = 0;
    for (const allocation of this.admission.listActiveAllocations()) {
      if (allocation.state === 'preparing' && this.admission.quarantineAbandonedAllocation(allocation.owner)) recovered++;
    }
    return recovered;
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const work: Promise<unknown>[] = [];
    for (const job of this.jobs.values()) {
      if (job.reservation) {
        try { const record = this.admission.readAllocation(job.reservation.identity.allocationId);
          if (record && record.state !== 'preparing') { this.jobs.delete(job.actionId); continue; }
          this.admission.cancelAllocation(job.reservation.identity.allocationId);
        } catch { /* Close local issuance even when authority is unavailable. */ }
      }
      job.controller.abort(new PreparationFailure('CANCELLED')); job.driver?.revokeIssuance();
      if (job.promise) work.push(job.promise);
    }
    this.closing = abortable(Promise.allSettled([...work, ...this.pending]), AbortSignal.timeout(5000)).then(() => {}, () => {});
    return this.closing;
  }
}
