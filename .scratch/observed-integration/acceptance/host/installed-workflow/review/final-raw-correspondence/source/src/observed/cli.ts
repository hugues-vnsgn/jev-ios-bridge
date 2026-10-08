import { parsePrepareAllocation, AllocationInputError, allocationError } from './allocation-schema.js';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import type { Admission } from '../device/admission.js';
import type { ObservedActionService } from './service.js';
import type { AllocationResult, AllocationOperationError, AllocationSnapshotV1 } from './allocation.js';
import { parseObservedAction, ObservedOperationError, observedActionIdSchema, observedAllocationIdSchema,
  observedReadOptionsSchema, type ObservedOperationErrorV1, type ObservedActionRequest } from './schema.js';
import { observedActionExitCode, observedActionSummary, type ObservedActionSnapshot } from './report.js';

export type ObservedPublic = Pick<ObservedActionService<AllocationResult>, 'start' | 'inspect' | 'cancel' | 'prepareAllocation' | 'getAllocation' | 'cancelAllocation' | 'retireAllocation' | 'close'>;
export type ObservedComposition = ObservedPublic & { readonly enabled: boolean };
export type ObservedReply = ObservedActionSnapshot | AllocationResult | ObservedOperationErrorV1;
export const observedCommands = ['observed-allocate', 'observed-allocation', 'observed-retire', 'observed-allocation-cancel',
  'observed-action', 'observed-report', 'observed-cancel'] as const;
export type ObservedCommand = typeof observedCommands[number];
export const isObservedCommand = (command: string): command is ObservedCommand => observedCommands.some(value => value === command);
const preparationCommand = (command: ObservedCommand) => command !== 'observed-action' && command !== 'observed-report' && command !== 'observed-cancel';

/** A transport owns no jobs: construction is inert, and close delegates once to the shared runtime. */
export function createObservedComposition(options: { enabled: boolean; create: () => ObservedPublic | Promise<ObservedPublic>;
  beforeStart?: (request: ObservedActionRequest) => Promise<void> }): ObservedComposition {
  let module: ObservedPublic | undefined; let opening: Promise<ObservedPublic> | undefined;
  let closing: Promise<void> | undefined; let closed = false;
  const get = (): Promise<ObservedPublic> => {
    if (!opening) opening = Promise.resolve().then(options.create).then(value => { module = value; return value; });
    return opening;
  };
  const allowStart = (acceptanceKind: 'action' | 'preparation') => {
    if (closed) throw new ObservedOperationError('SHUTTING_DOWN', 'Observed execution is shutting down', { acceptanceKind });
    if (!options.enabled) throw new ObservedOperationError('OBSERVED_DISABLED', 'Observed execution is disabled', { acceptanceKind });
  };
  return { enabled: options.enabled,
    async start(raw) {
      allowStart('action'); const request = parseObservedAction(raw); const service = await get();
      allowStart('action'); await options.beforeStart?.(request); allowStart('action'); return service.start(raw);
    },
    async inspect(id, opts) { return (await get()).inspect(id, opts); }, async cancel(id) { return (await get()).cancel(id); },
    async prepareAllocation(raw) {
      allowStart('preparation');
      try { parsePrepareAllocation(raw); }
      catch (error) { throw new ObservedOperationError(error instanceof AllocationInputError && error.code === 'UNSUPPORTED_VERSION' ? 'UNSUPPORTED_VERSION' : 'INVALID_REQUEST', 'Invalid allocation request', { acceptanceKind: 'preparation' }); }
      const service = await get(); allowStart('preparation'); return service.prepareAllocation(raw);
    },
    async getAllocation(id, opts) { return (await get()).getAllocation(id, opts); },
    async cancelAllocation(id) { return (await get()).cancelAllocation(id); }, async retireAllocation(id) { return (await get()).retireAllocation(id); },
    close() {
      closed = true;
      // Calling the existing module now revokes its local gates before any bounded wait.
      return closing ??= module ? module.close() : opening ? opening.then(value => value.close(), () => undefined) : Promise.resolve();
    } };
}

/** Configuration gates only new ready consumption; immutable retrieval/conflict remains runtime-owned. */
export async function validateObservedStartConfiguration(admission: Pick<Admission, 'readAction'>, request: ObservedActionRequest,
  validate: () => Promise<unknown>): Promise<void> {
  const eligible = () => {
    const view = admission.readAction(request.actionId);
    return view?.kind === 'allocation' && view.allocation.actionId === request.actionId &&
      view.allocation.allocationId === request.allocationId && view.allocation.appBundleId === request.app.bundleId &&
      view.allocation.actionDigest === null && view.allocation.state === 'ready';
  };
  let ready: boolean;
  try { ready = eligible(); } catch { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Authoritative action state is unavailable', { actionId: request.actionId, acceptance: 'unknown' }); }
  if (!ready) return;
  try { await validate(); }
  catch {
    try {
      if (!eligible()) return;
    }
    catch { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Authoritative action state is unavailable', { actionId: request.actionId, acceptance: 'unknown' }); }
    throw new ObservedOperationError('CONFIGURATION_ERROR', 'Observed allocation configuration is invalid', { actionId: request.actionId, allocationId: request.allocationId });
  }
}

/** Only installed CLI composition reaches this factory; test stores have no production override. */
export function productionObservedComposition(options: { enabled: boolean; runsDir: string; cwd: string }): ObservedComposition {
  let admission: Admission;
  return createObservedComposition({ enabled: options.enabled,
    async create() {
      const [{ Admission }, { ObservedAllocator }, { ObservedActionService, observedDriverFactory }, { deviceWindowOpener }, { BRIDGE_VERSION }] = await Promise.all([
        import('../device/admission.js'), import('./allocation.js'), import('./service.js'), import('../device/index.js'), import('../version.js')]);
      try { admission = Admission.open(); }
      catch { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Existing admission authority is unavailable', { acceptance: 'unknown' }); }
      const runsDir = resolve(options.runsDir);
      const allocator = new ObservedAllocator({ admission, runsDir });
      const deviceWindow = deviceWindowOpener(false);
      return new ObservedActionService({ admission, allocator, runsDir, bridgeVersion: BRIDGE_VERSION, backend: 'real', enabled: options.enabled,
        createDriver: observedDriverFactory({ cwd: options.cwd, admission, ...(deviceWindow ? { deviceWindow } : {}) }) });
    },
    async beforeStart(request) {
      const { readAllocationConfig } = await import('./allocation-config.js');
      await validateObservedStartConfiguration(admission, request, () => readAllocationConfig());
    } });
}
export function observedError(error: unknown, acceptanceKind: 'action' | 'preparation'): ObservedOperationErrorV1 | AllocationOperationError {
  if (error instanceof ObservedOperationError) return { ...error.toJSON(), acceptanceKind };
  if (error instanceof AllocationInputError) {
    if (acceptanceKind === 'preparation') return allocationError(error.code, {}, ['STATE_UNAVAILABLE', 'STORE_UNAVAILABLE'].includes(error.code) ? 'unknown' : 'no');
    return new ObservedOperationError(error.code === 'INVALID_REQUEST' || error.code === 'UNSUPPORTED_VERSION' ? error.code : 'CONFIGURATION_ERROR', 'Observed allocation configuration is invalid').toJSON();
  }
  return new ObservedOperationError('INTERNAL_ERROR', 'Observed operation failed', { acceptanceKind, acceptance: 'unknown' }).toJSON();
}
export const isObservedError = (reply: ObservedReply): reply is ObservedOperationErrorV1 | AllocationOperationError => 'kind' in reply && reply.kind === 'observed-operation-error';
export function observedExitCode(reply: ObservedReply): 0 | 2 | 3 {
  if (isObservedError(reply)) return 3;
  if ('kind' in reply) return observedActionExitCode(reply);
  return reply.authority === 'committed' && ['prepared', 'action_completed', 'retired_unused'].includes(reply.outcome ?? '') ? 0
    : reply.authority === 'committed' && reply.outcome === 'refused' ? 3 : 2;
}
export function observedSummary(reply: ObservedReply): string {
  if (isObservedError(reply)) return `${reply.code}: ${reply.message}${reply.evidenceDirectory ? '; evidence ' + reply.evidenceDirectory : ''}`;
  if ('kind' in reply) return observedActionSummary(reply);
  const evidence = reply.evidenceRefs.join(', ') || '(no recorded evidence)';
  return `${reply.allocationId}: ${reply.outcome ?? reply.state} (${reply.authority}); evidence ${evidence}`;
}
async function readRequest(path: string, projectDir: string): Promise<unknown> {
  try {
    const file = await open(resolve(projectDir, path), constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      if (!(await file.stat()).isFile()) throw new Error();
      const bytes = Buffer.alloc(65537); let length = 0;
      while (length < bytes.length) {
        const result = await file.read(bytes, length, bytes.length - length);
        if (result.bytesRead === 0) break;
        length += result.bytesRead;
      }
      if (length > 65536) throw new Error();
      return JSON.parse(bytes.subarray(0, length).toString('utf8'));
    } finally { await file.close(); }
  } catch { throw new ObservedOperationError('INVALID_REQUEST', 'Expected a readable bounded JSON request file'); }
}
/** CLI parsing/rendering only. Signals stop waits or close the owned shared runtime, never replay. */
export async function runObservedCommand(module: ObservedComposition, command: ObservedCommand, argument: string | undefined,
  options: { json: boolean; waitMs?: number; projectDir: string; signal?: AbortSignal; write: (text: string) => void }): Promise<number> {
  const acceptanceKind = preparationCommand(command) ? 'preparation' : 'action';
  let reply: ObservedReply;
  try {
    if (!argument) throw new ObservedOperationError('INVALID_REQUEST', 'Observed command requires one argument', { acceptanceKind });
    const read = command === 'observed-report' || command === 'observed-allocation';
    if (options.waitMs !== undefined && !read) throw new ObservedOperationError('INVALID_REQUEST', '--wait-ms is only valid for observed reads', { acceptanceKind });
    const wait = observedReadOptionsSchema.safeParse({ waitMs: options.waitMs ?? 0 });
    if (!wait.success) throw new ObservedOperationError('INVALID_REQUEST', 'Invalid observed wait duration', { acceptanceKind });
    const readOptions = { waitMs: wait.data.waitMs, ...(options.signal ? { signal: options.signal } : {}) };
    if (command === 'observed-action' || command === 'observed-allocate') {
      if (!module.enabled) throw new ObservedOperationError('OBSERVED_DISABLED', 'Observed execution is disabled', { acceptanceKind });
      const raw = await readRequest(argument, options.projectDir);
      if (command === 'observed-allocate') reply = await module.prepareAllocation(raw);
      else {
        const started = await module.start(raw); reply = started;
        while (reply.state !== 'terminal' && reply.state !== 'unresolved') reply = await module.inspect(started.actionId, { waitMs: 45000, ...(options.signal ? { signal: options.signal } : {}) });
        reply = { ...reply, disposition: started.disposition };
      }
    } else if (acceptanceKind === 'action') {
      if (!observedActionIdSchema.safeParse(argument).success) throw new ObservedOperationError('INVALID_REQUEST', 'Invalid action identity');
      reply = command === 'observed-report' ? await module.inspect(argument, readOptions) : await module.cancel(argument);
    } else {
      const id = observedAllocationIdSchema.safeParse(argument);
      if (!id.success) throw new ObservedOperationError('INVALID_REQUEST', 'Invalid allocation identity', { acceptanceKind });
      reply = command === 'observed-allocation' ? await module.getAllocation(id.data, readOptions)
        : command === 'observed-retire' ? await module.retireAllocation(id.data) : await module.cancelAllocation(id.data);
    }
  } catch (error) { reply = observedError(error, acceptanceKind); }
  options.write((options.json ? JSON.stringify(reply) : observedSummary(reply)) + '\n');
  return observedExitCode(reply);
}
