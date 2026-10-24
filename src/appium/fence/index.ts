import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import type { Admission, AdmissionClaim, AdmittedSession, FenceRequest, NativeComponent, RecoveryClaim } from '../../device/admission.js';
import { z } from 'zod/v4';
import { active, groupHeld, ownedGroup, readbackOf, recordedRows, sameIdentity, settles, sharedService, verifyAppiumProof } from './proof.js';
import { androidProcessSchema, appiumComponentSchema, automationForward, fenceCommandSchema, fenceExecutorsSchema, forwardInventorySchema, hostInventorySchema,
  parseEffectResult, readOnly, sameForward, settingKeySchema, settingsSchema, wdaInventorySchema, type AppiumComponent, type AppiumProof,
  androidIdentitySchema, type Executor, type FenceEffect, type HostIdentity, type HostRow, type Transcript } from './schema.js';
export type { FenceEffect } from './schema.js';
export type FenceRunner = (effect: FenceEffect, signal: AbortSignal, started?: (host: Executor) => void) => Promise<unknown>;
export type FenceOptions = { runner: FenceRunner; revalidate: (serial: string) => Promise<void>; signal?: AbortSignal; budgetMs?: number;
  clock?: { now: () => number; sleep: (ms: number, signal: AbortSignal) => Promise<void> } };
type Dispatcher = Pick<AdmittedSession, 'dispatch'> & Pick<AdmissionClaim, 'observeComponent'>;
const POLL_CAP = 12;
const defaultClock = { now: () => performance.now(), sleep: (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
}) };
class CleanupBudget {
  private readonly controller = new AbortController();
  private readonly clock;
  private readonly end: number;
  private readonly timer;
  private readonly externalAbort = () => this.controller.abort(this.options.signal?.reason);
  readonly signal = this.controller.signal;
  constructor(private readonly options: FenceOptions) {
    const duration = options.budgetMs ?? 45000;
    if (!(duration > 0 && duration <= 45000)) throw new Error('Invalid fence budget');
    this.clock = options.clock ?? defaultClock;
    this.end = this.clock.now() + duration;
    options.signal?.addEventListener('abort', this.externalAbort, { once: true });
    if (options.signal?.aborted) this.externalAbort();
    this.timer = setTimeout(() => this.controller.abort(new Error('Fence cleanup budget exhausted')), duration);
  }
  check() {
    this.signal.throwIfAborted();
    if (this.clock.now() >= this.end) { this.controller.abort(new Error('Fence cleanup budget exhausted')); this.signal.throwIfAborted(); }
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.check();
    let abort: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => { abort = () => reject(this.signal.reason); this.signal.addEventListener('abort', abort, { once: true }); });
    try { const result = await Promise.race([work(), interrupted]); this.check(); return result; }
    finally { this.signal.removeEventListener('abort', abort); }
  }
  sleep(ms: number) { return this.run(() => this.clock.sleep(ms, this.signal)); }
  close() { clearTimeout(this.timer); this.options.signal?.removeEventListener('abort', this.externalAbort); }
}
function recordedQuery(input: FenceOptions, budget: CleanupBudget, dispatcher: Dispatcher) {
  const keepExecutorsForLaterProof = (id: string, executors: Executor[]) => dispatcher.observeComponent(id, { kind: 'fence-executors', processes: executors });
  return async (effect: FenceEffect): Promise<Transcript> => {
    budget.check();
    if ('serial' in effect) await budget.run(() => input.revalidate(effect.serial));
    const id = randomUUID();
    let commandId = '';
    const result = await dispatcher.dispatch({ requestId: id, componentId: id, operation: 'appium-fence', payload: {}, recordResult: true,
      components: [{ id, kind: 'appium-fence-command', effect }] }, async command => {
        commandId = command;
        const executors: Executor[] = [];
        try { return await budget.run(async () => recordedRows(effect, parseEffectResult(effect, await input.runner(effect, budget.signal, process => executors.push(process))))); }
        catch (error) { if (!readOnly(effect)) keepExecutorsForLaterProof(id, executors); throw error; }
      });
    return { id: commandId, effect, result };
  };
}
export function recordAppiumComponents(claim: AdmissionClaim, declarations: readonly unknown[]): AppiumComponent[] {
  const components = declarations.map(raw => appiumComponentSchema.parse(raw));
  for (const component of components) claim.registerComponent(component);
  return components;
}
export async function fenceAppium(input: FenceOptions & { admission: Admission; claim: RecoveryClaim }): Promise<FenceRequest> {
  const { admission, claim } = input;
  const original = admission.readGeneration(claim.identity.owner);
  if (original.inventoryUnknownReason !== null) throw new Error('Unknown component inventory remains quarantined');
  const targets = original.components.flatMap(component => {
    const parsed = appiumComponentSchema.safeParse(component.declaration);
    return parsed.success ? [parsed.data] : [];
  });
  const budget = new CleanupBudget(input);
  const check = () => budget.check();
  const transcripts: Transcript[] = [];
  const recorded = recordedQuery(input, budget, claim);
  const query = async (effect: FenceEffect) => {
    const transcript = await recorded(effect);
    transcripts.push(transcript);
    return transcript;
  };
  const poll = async (effect: FenceEffect, gone: (result: unknown) => boolean) => {
    let delay = 500;
    for (let reads = 1; ; reads++) {
      const command = await query(effect);
      if (gone(command.result)) return command;
      if (reads === POLL_CAP) throw new Error('Stop evidence not reached within the poll cap');
      await budget.sleep(delay);
      delay = Math.min(delay * 2, 4000);
    }
  };
  const hostRead = async (of: HostIdentity[], gone: (rows: HostRow[]) => boolean = () => true) => {
    const command = await poll({ kind: 'host-inventory', of }, result => gone(hostInventorySchema.parse(result)));
    return { command, rows: hostInventorySchema.parse(command.result) };
  };
  const wait = () => budget.sleep(5000);
  const stopHost = async (target: Extract<AppiumComponent, { kind: 'appium-process-group' | 'appium-native-helper' }>): Promise<AppiumProof> => {
    const identity = (row: HostIdentity): HostIdentity => ({ pid: row.pid, startTime: row.startTime });
    const named = (group: typeof target) => (group.kind === 'appium-process-group' ? [group.leader, ...group.members] : [group.process]).map(identity);
    const before = await hostRead(named(target));
    const live = (rows: HostRow[]) => {
      const found = target.kind === 'appium-process-group' ? ownedGroup(target, rows).filter(active) : rows.filter(row => sameIdentity(row, target.process) && active(row));
      if (found.some(sharedService)) throw new Error('Shared service cannot be stopped');
      return found;
    };
    const recorded = live(before.rows);
    const expanded = target.kind === 'appium-process-group' ? { ...target, members: [...target.members,
      ...recorded.filter(row => row.pid !== target.leader.pid && !target.members.some(member => member.pid === row.pid))] } : target;
    const remaining = (rows: HostRow[]) => expanded.kind === 'appium-process-group' ? ownedGroup(expanded, rows).filter(active) : live(rows);
    const signal = async (inventory: HostRow[], rows: HostRow[], name: 'SIGTERM' | 'SIGKILL') => {
      const group = target.kind === 'appium-process-group' && groupHeld(target, inventory) ? target : undefined;
      const grouped = group ? rows.filter(row => row.pgid === group.pgid) : [];
      if (group && grouped.length) await query({ kind: 'host-signal-group', pgid: group.pgid, members: grouped.map(identity), signal: name });
      for (const row of rows) if (!grouped.includes(row)) await query({ kind: 'host-signal', process: identity(row), signal: name });
    };
    let after = before;
    if (recorded.length) {
      await signal(before.rows, recorded, 'SIGTERM');
      await wait();
      after = await hostRead(named(expanded));
      const surviving = remaining(after.rows);
      if (surviving.length) { await signal(after.rows, surviving, 'SIGKILL'); after = await hostRead(named(expanded), rows => !remaining(rows).length); }
    }
    return target.kind === 'appium-process-group'
      ? { kind: 'appium-group-stopped', beforeCommandId: before.command.id, afterCommandId: after.command.id }
      : { kind: 'appium-helper-stopped', commandId: after.command.id };
  };
  const order = { 'appium-process-group': 0, 'appium-wda': 1, 'appium-uiautomator2': 1, 'appium-native-helper': 2, 'appium-settings': 3, 'appium-forward': 4 };
  targets.sort((a, b) => order[a.kind] - order[b.kind]);
  const proofs: FenceRequest['components'] = [];
  try {
    for (const target of targets) {
      let proof: AppiumProof;
      switch (target.kind) {
        case 'appium-process-group': case 'appium-native-helper': proof = await stopHost(target); break;
        case 'appium-wda': {
          const matching = (result: unknown) => wdaInventorySchema.parse(result).filter(row => row.udid === target.udid && (row.bundleId === target.bundleId || row.pid === target.pid));
          let command = await query({ kind: 'wda-inventory', udid: target.udid });
          const rows = matching(command.result);
          if (rows.some(row => row.pid !== target.pid || row.bundleId !== target.bundleId)) throw new Error('WDA identity differs');
          if (rows.length) { await query({ kind: 'wda-stop', udid: target.udid, bundleId: target.bundleId, pid: target.pid }); command = await poll({ kind: 'wda-inventory', udid: target.udid }, result => !matching(result).length); }
          proof = { kind: 'appium-wda-stopped', commandId: command.id }; break;
        }
        case 'appium-uiautomator2': {
          const commandIds: string[] = [];
          for (const process of target.processes) {
            const read = { kind: 'android-process', serial: target.serial, pid: process.pid } as const;
            const gone = (result: unknown) => { const state = androidProcessSchema.parse(result); return state.kind === 'absent' || state.startTime !== process.startTime; };
            let command = await query(read);
            if (!gone(command.result)) {
              await query({ kind: 'android-stop', serial: target.serial, process });
              command = await poll(read, gone);
            }
            commandIds.push(command.id);
          }
          proof = { kind: 'appium-uiautomator2-stopped', commandIds }; break;
        }
        case 'appium-forward': proof = await removeOwnedForward(target, query); break;
        case 'appium-settings': {
          const before = await query({ kind: 'settings-read', serial: target.serial });
          const values = settingsSchema.parse(before.result);
          for (const key of settingKeySchema.options) if (values[key] !== target.values[key]) await query({ kind: 'settings-write', serial: target.serial, key, value: target.values[key] });
          const command = await query({ kind: 'settings-read', serial: target.serial });
          proof = { kind: 'appium-settings-restored', commandId: command.id }; break;
        }
        default: { const exhaustive: never = target; throw new Error(String(exhaustive)); }
      }
      if (!verifyAppiumProof(target, proof, transcripts)) throw new Error(`Missing stop evidence for ${target.id}`);
      proofs.push({ componentId: target.id, proof });
    }
    for (const component of original.components) {
      const invocation = fenceCommandSchema.safeParse(component.declaration);
      if (!invocation.success || original.commands.filter(command => command.componentId === component.id).every(command => command.state === 'settled')) continue;
      const effect = invocation.data.effect;
      if (readOnly(effect)) {
        const answered = transcripts.find(transcript => isDeepStrictEqual(transcript.effect, effect)) ?? await query(effect);
        proofs.push({ componentId: component.id, proof: { kind: 'superseded-read', commandId: answered.id } });
        continue;
      }
      const executors = original.componentObservations.filter(observation => observation.componentId === component.id)
        .map(observation => fenceExecutorsSchema.safeParse(observation.payload)).find(parsed => parsed.success);
      if (!executors) throw new Error(`Unproven component ${component.id}`);
      if (!executors.data.processes.every(process => ['exited', 'reused'].includes(admission.componentState(process)))) throw new Error(`Executor exit is not proven for ${component.id}`);
      const answer = transcripts.find(transcript => settles(effect, transcript)) ?? await query(readbackOf(effect));
      if (!settles(effect, answer)) throw new Error(`Unproven component ${component.id}`);
      proofs.push({ componentId: component.id, proof: { kind: 'fenced-write', commandId: answer.id } });
    }
    const view = admission.readGeneration(claim.identity.owner);
    for (const component of view.components) {
      if (proofs.some(proof => proof.componentId === component.id)) continue;
      const commands = view.commands.filter(command => command.componentId === component.id);
      const completed = commands.find(command => command.state === 'settled');
      if (['one-shot', 'adb-command', 'appium-fence-command'].includes(component.kind) && completed && commands.every(command => command.state === 'settled')) { proofs.push({ componentId: component.id, proof: { kind: 'completed-command', commandId: completed.id } }); continue; }
      throw new Error(`Unproven component ${component.id}`);
    }
    check();
    return { requestId: randomUUID(), kind: 'stop', components: proofs, commands: view.commands.filter(command => command.state !== 'settled').map(command => command.id) };
  } finally { budget.close(); }
}

export type AutomationScope = { udid: string } | { serial: string };
export function inspectForeignAutomation(owned: readonly NativeComponent[], inventory: {
  wda: unknown; uiautomator2: unknown; forwards: unknown;
}, scope: AutomationScope): { kind: 'available' } | { kind: 'refused'; reason: 'DEVICE_BUSY'; exitCode: 3 } {
  const components = owned.flatMap(component => { const parsed = appiumComponentSchema.safeParse(component.declaration); return parsed.success ? [parsed.data] : []; });
  const onSimulator = (row: { udid: string }) => 'udid' in scope && row.udid.toUpperCase() === scope.udid.toUpperCase();
  const onSerial = (row: { serial: string }) => 'serial' in scope && row.serial === scope.serial;
  const wda = wdaInventorySchema.parse(inventory.wda).filter(onSimulator);
  const forwards = forwardInventorySchema.parse(inventory.forwards).filter(row => onSerial(row) && automationForward(row));
  const uia = androidInventorySchema.parse(inventory.uiautomator2).filter(onSerial);
  const foreign = wda.some(row => !components.some(target => target.kind === 'appium-wda' && target.udid === row.udid && target.bundleId === row.bundleId && target.pid === row.pid))
    || forwards.some(row => !components.some(target => target.kind === 'appium-forward' && target.serial === row.serial && target.local === row.local && target.remote === row.remote))
    || uia.some(row => !components.some(target => target.kind === 'appium-uiautomator2' && target.serial === row.serial && target.processes.some(process => process.pid === row.pid && process.startTime === row.startTime)));
  return foreign ? { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 } : { kind: 'available' };
}
const androidInventorySchema = z.array(androidIdentitySchema.extend({ serial: z.string().min(1) })).max(4096);

async function removeOwnedForward(target: Extract<AppiumComponent, { kind: 'appium-forward' }>, query: (effect: FenceEffect) => Promise<Transcript>): Promise<AppiumProof> {
  let command = await query({ kind: 'forward-inventory' });
  if (forwardInventorySchema.parse(command.result).some(row => sameForward(row, target))) {
    await query({ kind: 'forward-remove', serial: target.serial, local: target.local, remote: target.remote });
    command = await query({ kind: 'forward-inventory' });
  }
  const proof = { kind: 'appium-forward-removed', commandId: command.id } satisfies AppiumProof;
  if (!verifyAppiumProof(target, proof, [command])) throw new Error('Owned forward is still present');
  return proof;
}

export async function clearOwnedForwards(input: FenceOptions & { admission: Admission; claim: Pick<AdmissionClaim, 'identity' | 'observeComponent'>; dispatcher: Pick<AdmittedSession, 'dispatch'> }): Promise<FenceRequest['components']> {
  const targets = input.admission.readGeneration(input.claim.identity).components.flatMap(component => {
    const parsed = appiumComponentSchema.safeParse(component.declaration);
    return parsed.success && parsed.data.kind === 'appium-forward' ? [parsed.data] : [];
  });
  const budget = new CleanupBudget(input);
  const query = recordedQuery(input, budget, { dispatch: input.dispatcher.dispatch.bind(input.dispatcher), observeComponent: input.claim.observeComponent.bind(input.claim) });
  try {
    const proofs: FenceRequest['components'] = [];
    for (const target of targets) {
      const proof = await removeOwnedForward(target, query);
      proofs.push({ componentId: target.id, proof });
    }
    return proofs;
  } finally { budget.close(); }
}
