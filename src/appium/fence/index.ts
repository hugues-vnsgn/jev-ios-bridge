import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Admission, AdmissionClaim, AdmittedSession, FenceRequest, NativeComponent, OwnerIdentity, RecoveryClaim } from '../../device/admission.js';
import { z } from 'zod/v4';
import { active, groupHeld, ownedGroup, sameIdentity, sharedService, verifyAppiumProof } from './proof.js';
import { androidProcessSchema, appiumComponentSchema, forwardInventorySchema, hostInventorySchema,
  parseEffectResult, settingKeySchema, settingsSchema, wdaInventorySchema, type AppiumComponent, type AppiumProof,
  androidIdentitySchema, type FenceEffect, type HostIdentity, type HostRow, type Transcript } from './schema.js';
export type { FenceEffect } from './schema.js';
export type FenceRunner = (effect: FenceEffect, signal: AbortSignal) => Promise<unknown>;
export type FenceOptions = { runner: FenceRunner; signal?: AbortSignal; budgetMs?: number;
  clock?: { now: () => number; sleep: (ms: number, signal: AbortSignal) => Promise<void> } };
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
  const bounded = <T>(work: () => Promise<T>) => budget.run(work);
  const transcripts: Transcript[] = [];
  const query = async (effect: FenceEffect) => {
    check();
    const id = randomUUID();
    let commandId = '';
    const result = await claim.dispatch({ requestId: id, componentId: id, operation: 'appium-fence', payload: {}, recordResult: true,
      components: [{ id, kind: 'appium-fence-command', effect }] }, async command => {
        commandId = command;
        return bounded(async () => parseEffectResult(effect, await input.runner(effect, budget.signal)));
      });
    const transcript = { id: commandId, effect, result };
    transcripts.push(transcript);
    return transcript;
  };
  const hostRead = async () => { const command = await query({ kind: 'host-inventory' }); return { command, rows: hostInventorySchema.parse(command.result) }; };
  const wait = () => budget.sleep(5000);
  const stopHost = async (target: Extract<AppiumComponent, { kind: 'appium-process-group' | 'appium-native-helper' }>): Promise<AppiumProof> => {
    const before = await hostRead();
    const live = (rows: HostRow[]) => {
      const found = target.kind === 'appium-process-group' ? ownedGroup(target, rows).filter(active) : rows.filter(row => sameIdentity(row, target.process) && active(row));
      if (found.some(sharedService)) throw new Error('Shared service cannot be stopped');
      return found;
    };
    const recorded = live(before.rows);
    const expanded = target.kind === 'appium-process-group' ? { ...target, members: [...target.members,
      ...recorded.filter(row => row.pid !== target.leader.pid && !target.members.some(member => member.pid === row.pid))] } : target;
    const remaining = (rows: HostRow[]) => expanded.kind === 'appium-process-group' ? ownedGroup(expanded, rows).filter(active) : live(rows);
    const identity = (row: HostRow): HostIdentity => ({ pid: row.pid, startTime: row.startTime });
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
      after = await hostRead();
      const surviving = remaining(after.rows);
      if (surviving.length) { await signal(after.rows, surviving, 'SIGKILL'); after = await hostRead(); }
      if (remaining(after.rows).length) throw new Error('Host process exit is not proven');
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
          let command = await query({ kind: 'wda-inventory', udid: target.udid });
          const rows = wdaInventorySchema.parse(command.result).filter(row => row.udid === target.udid && (row.bundleId === target.bundleId || row.pid === target.pid));
          if (rows.some(row => row.pid !== target.pid || row.bundleId !== target.bundleId)) throw new Error('WDA identity differs');
          if (rows.length) { await query({ kind: 'wda-stop', udid: target.udid, bundleId: target.bundleId, pid: target.pid }); command = await query({ kind: 'wda-inventory', udid: target.udid }); }
          proof = { kind: 'appium-wda-stopped', commandId: command.id }; break;
        }
        case 'appium-uiautomator2': {
          const commandIds: string[] = [];
          for (const process of target.processes) {
            let command = await query({ kind: 'android-process', serial: target.serial, pid: process.pid });
            const current = androidProcessSchema.parse(command.result);
            if (current.kind === 'running' && current.startTime === process.startTime) {
              await query({ kind: 'android-stop', serial: target.serial, process });
              command = await query({ kind: 'android-process', serial: target.serial, pid: process.pid });
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
    const view = admission.readGeneration(claim.identity.owner);
    for (const component of view.components) {
      if (proofs.some(proof => proof.componentId === component.id)) continue;
      const commands = view.commands.filter(command => command.componentId === component.id);
      const completed = commands.find(command => command.state === 'settled');
      if (['one-shot', 'adb-command', 'appium-fence-command'].includes(component.kind) && completed && commands.every(command => command.state === 'settled')) proofs.push({ componentId: component.id, proof: { kind: 'completed-command', commandId: completed.id } });
      else throw new Error(`Unproven component ${component.id}`);
    }
    check();
    return { requestId: randomUUID(), kind: 'stop', components: proofs, commands: view.commands.filter(command => command.state !== 'settled').map(command => command.id) };
  } finally { budget.close(); }
}

export function inspectForeignAutomation(owned: readonly NativeComponent[], inventory: {
  wda: unknown; uiautomator2: unknown; forwards: unknown;
}): { kind: 'available' } | { kind: 'refused'; reason: 'DEVICE_BUSY'; exitCode: 3 } {
  const components = owned.flatMap(component => { const parsed = appiumComponentSchema.safeParse(component.declaration); return parsed.success ? [parsed.data] : []; });
  const wda = wdaInventorySchema.parse(inventory.wda), forwards = forwardInventorySchema.parse(inventory.forwards);
  const uia = androidInventorySchema.parse(inventory.uiautomator2);
  const foreign = wda.some(row => !components.some(target => target.kind === 'appium-wda' && target.udid === row.udid && target.bundleId === row.bundleId && target.pid === row.pid))
    || forwards.some(row => !components.some(target => target.kind === 'appium-forward' && target.serial === row.serial && target.local === row.local && target.remote === row.remote))
    || uia.some(row => !components.some(target => target.kind === 'appium-uiautomator2' && target.serial === row.serial && target.processes.some(process => process.pid === row.pid && process.startTime === row.startTime)));
  return foreign ? { kind: 'refused', reason: 'DEVICE_BUSY', exitCode: 3 } : { kind: 'available' };
}
const androidInventorySchema = z.array(androidIdentitySchema.extend({ serial: z.string().min(1) })).max(4096);

async function removeOwnedForward(target: Extract<AppiumComponent, { kind: 'appium-forward' }>, query: (effect: FenceEffect) => Promise<Transcript>): Promise<AppiumProof> {
  let command = await query({ kind: 'forward-inventory' });
  const rows = forwardInventorySchema.parse(command.result).filter(row => row.local === target.local);
  if (rows.some(row => row.serial !== target.serial || row.remote !== target.remote)) throw new Error('Forward identity differs');
  if (rows.length) {
    await query({ kind: 'forward-remove', serial: target.serial, local: target.local, remote: target.remote });
    command = await query({ kind: 'forward-inventory' });
  }
  const proof = { kind: 'appium-forward-removed', commandId: command.id } satisfies AppiumProof;
  if (!verifyAppiumProof(target, proof, [command])) throw new Error('Owned forward is still present');
  return proof;
}

export async function clearOwnedForwards(input: FenceOptions & { admission: Admission; owner: OwnerIdentity; dispatcher: Pick<AdmittedSession, 'dispatch'> }): Promise<FenceRequest['components']> {
  const targets = input.admission.readGeneration(input.owner).components.flatMap(component => {
    const parsed = appiumComponentSchema.safeParse(component.declaration);
    return parsed.success && parsed.data.kind === 'appium-forward' ? [parsed.data] : [];
  });
  const budget = new CleanupBudget(input);
  const query = async (effect: FenceEffect) => {
    budget.check();
    const id = randomUUID();
    let commandId = '';
    const result = await input.dispatcher.dispatch({ requestId: id, componentId: id, operation: 'appium-fence', payload: {}, recordResult: true,
      components: [{ id, kind: 'appium-fence-command', effect }] }, async command => {
        commandId = command;
        return budget.run(async () => parseEffectResult(effect, await input.runner(effect, budget.signal)));
      });
    return { id: commandId, effect, result };
  };
  try {
    const proofs: FenceRequest['components'] = [];
    for (const target of targets) {
      const proof = await removeOwnedForward(target, query);
      proofs.push({ componentId: target.id, proof });
    }
    return proofs;
  } finally { budget.close(); }
}
