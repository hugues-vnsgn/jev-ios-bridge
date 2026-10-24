import { isDeepStrictEqual } from 'node:util';
import { androidProcessSchema, forwardInventorySchema, hostInventorySchema, settingsSchema, wdaInventorySchema,
  type AppiumComponent, type AppiumProof, type HostIdentity, type HostRow, type Transcript } from './schema.js';

export const sameIdentity = (row: HostIdentity, expected: HostIdentity) => row.pid === expected.pid && row.startTime === expected.startTime;
const reused = (rows: HostRow[], identity: HostIdentity) => rows.some(row => row.pid === identity.pid && row.startTime !== identity.startTime);
export function sharedService(row: HostRow): boolean {
  const executable = row.executable.split(/\s+/)[0]?.split('/').at(-1);
  return row.sharedService === true || executable === 'CoreSimulatorService' || executable === 'com.apple.CoreSimulator.CoreSimulatorService'
    || (executable === 'adb' && /\bfork-server\b.*\bserver\b/.test(row.executable));
}
export const active = (row: HostRow) => row.state === 'running';
type Group = Extract<AppiumComponent, { kind: 'appium-process-group' }>;
export const groupHeld = (target: Group, rows: HostRow[]) => !reused(rows, target.leader);
export function ownedGroup(target: Group, rows: HostRow[]): HostRow[] {
  const recorded = [target.leader, ...target.members].filter(identity => !reused(rows, identity));
  const linked = new Set(recorded.map(row => Number(row.pid)));
  for (const row of rows.filter(active)) {
    const ancestor = row.launchChain?.[0];
    if (ancestor && sameIdentity(ancestor, target.leader) && row.runMarker !== target.runMarker && !sharedService(row)) throw new Error('Launch attestation is inconsistent');
  }
  for (const row of rows.filter(row => row.runMarker === target.runMarker && active(row) && !sharedService(row))) {
    const ancestor = row.launchChain?.[0];
    if (!ancestor || !sameIdentity(ancestor, target.leader)) throw new Error('Launch ancestry is unprovable');
    linked.add(row.pid);
  }
  let prior = -1;
  while (prior !== linked.size) {
    prior = linked.size;
    for (const row of rows) if (linked.has(row.ppid)) linked.add(row.pid);
  }
  const group = rows.filter(row => linked.has(row.pid));
  if (groupHeld(target, rows) && rows.some(row => active(row) && row.pgid === target.pgid && !linked.has(row.pid))) throw new Error('Unmatched process group member');
  for (const row of group.filter(active)) {
    if (sharedService(row)) throw new Error('Shared service cannot be stopped');
  }
  return group;
}
export function verifyAppiumProof(target: AppiumComponent, proof: AppiumProof, transcripts: Transcript[]): boolean {
  const read = (id: string) => transcripts.find(command => command.id === id);
  switch (target.kind) {
    case 'appium-process-group': {
      if (proof.kind !== 'appium-group-stopped') return false;
      const before = read(proof.beforeCommandId), after = read(proof.afterCommandId);
      if (before?.effect.kind !== 'host-inventory' || after?.effect.kind !== 'host-inventory') return false;
      const initial = hostInventorySchema.parse(before.result), final = hostInventorySchema.parse(after.result);
      const recorded = ownedGroup(target, initial);
      const expanded = { ...target, members: [...target.members, ...recorded.filter(row => row.pid !== target.leader.pid && !target.members.some(member => member.pid === row.pid))] };
      return !ownedGroup(expanded, final).some(active) && !(groupHeld(target, final) && final.some(row => active(row) && row.pgid === target.pgid));
    }
    case 'appium-wda': {
      if (proof.kind !== 'appium-wda-stopped') return false;
      const command = read(proof.commandId);
      return command?.effect.kind === 'wda-inventory' && command.effect.udid === target.udid
        && !wdaInventorySchema.parse(command.result).some(row => row.udid === target.udid && (row.bundleId === target.bundleId || row.pid === target.pid));
    }
    case 'appium-uiautomator2': {
      if (proof.kind !== 'appium-uiautomator2-stopped' || proof.commandIds.length !== target.processes.length || new Set(proof.commandIds).size !== proof.commandIds.length) return false;
      return target.processes.every(process => proof.commandIds.some(id => {
        const command = read(id);
        if (command?.effect.kind !== 'android-process' || command.effect.serial !== target.serial || command.effect.pid !== process.pid) return false;
        const state = androidProcessSchema.parse(command.result);
        return state.kind === 'absent' || state.startTime !== process.startTime;
      }));
    }
    case 'appium-forward': {
      if (proof.kind !== 'appium-forward-removed') return false;
      const command = read(proof.commandId);
      return command?.effect.kind === 'forward-inventory' && !forwardInventorySchema.parse(command.result).some(row => row.local === target.local);
    }
    case 'appium-settings': {
      if (proof.kind !== 'appium-settings-restored') return false;
      const command = read(proof.commandId);
      return command?.effect.kind === 'settings-read' && command.effect.serial === target.serial && isDeepStrictEqual(settingsSchema.parse(command.result), target.values);
    }
    case 'appium-native-helper': {
      if (proof.kind !== 'appium-helper-stopped') return false;
      const command = read(proof.commandId);
      return command?.effect.kind === 'host-inventory' && !hostInventorySchema.parse(command.result).some(row => sameIdentity(row, target.process) && active(row));
    }
    default: { const exhaustive: never = target; return exhaustive; }
  }
}
