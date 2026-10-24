import { z } from 'zod';
import { IdentityResolutionError, identityUnavailable } from './android/probe.js';
import type { AndroidIdentityInventory, EmulatorObservation, IdentityProbe, PhoneObservation } from './android/probe.js';
export { IdentityResolutionError } from './android/probe.js';
export type { IdentityProbe, IdentityUnavailableReason, IdentityConflictReason } from './android/probe.js';

export type IdentityRequest =
  | Readonly<{ category: 'android' | 'android-emulator' | 'android-phone' | 'ios-phone'; name: string }>
  | Readonly<{ category: 'ios-simulator'; name: string; deviceSet?: string }>;
export type SimulatorIdentity = Readonly<{ category: 'ios-simulator'; value: string; deviceSet: string;
  state: string; probeReplies: { simulatorList: string } }>;
export type ResolvedIdentity = EmulatorObservation | PhoneObservation | SimulatorIdentity;

export async function resolveIdentity(input: { request: IdentityRequest; probe: IdentityProbe; signal: AbortSignal }): Promise<ResolvedIdentity> {
  if (input.request.category === 'ios-phone' || /^(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{16})$/i.test(input.request.name)) throw new IdentityResolutionError({ code: 'CATEGORY_NOT_ENABLED' });
  if (input.request.category === 'ios-simulator') {
    const inventory = await input.probe.simulatorSet(input.signal);
    if (input.request.deviceSet && input.request.deviceSet !== inventory.deviceSet) identityUnavailable('NONDEFAULT_DEVICE_SET');
    let raw: unknown;
    try { raw = JSON.parse(inventory.reply); } catch { identityUnavailable('MALFORMED_PROVENANCE'); }
    const parsed = z.object({ devices: z.record(z.string(), z.array(z.object({
      udid: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i), name: z.string(), state: z.string(), isAvailable: z.boolean(),
    }))) }).safeParse(raw);
    if (!parsed.success) identityUnavailable('MALFORMED_PROVENANCE');
    const matches = Object.values(parsed.data.devices).flat().filter(device =>
      device.udid.toUpperCase() === input.request.name.toUpperCase() || device.name === input.request.name);
    if (matches.length > 1) throw new IdentityResolutionError({ code: 'DEVICE_AMBIGUOUS' });
    const match = matches[0];
    if (!match) throw new IdentityResolutionError({ code: 'DEVICE_NOT_FOUND' });
    return { category: 'ios-simulator', value: match.udid.toUpperCase(), deviceSet: inventory.deviceSet, state: match.state,
      probeReplies: { simulatorList: inventory.reply } };
  }
  const inventory = await input.probe.android(input.signal, input.request.name);
  return selectAndroid(input.request, inventory);
}

function selectAndroid(request: IdentityRequest, inventory: AndroidIdentityInventory): EmulatorObservation | PhoneObservation {
  const directories = new Map<string, string>();
  for (const item of inventory) {
    if (item.category !== 'android-emulator') continue;
    const key = `${item.provenance.directory.device}/${item.provenance.directory.inode}`;
    const previous = directories.get(key);
    if (previous && previous !== item.value) throw new IdentityResolutionError({ code: 'DEVICE_IDENTITY_CONFLICT', reason: 'PATH_INODE_DISAGREEMENT' });
    directories.set(key, item.value);
  }
  const serial = inventory.find(item => item.transport.serial === request.name);
  const matches = serial ? [serial] : inventory.filter(item => item.category === 'android-emulator'
    ? item.provenance.avdName === request.name : item.value === request.name);
  if (matches.length > 1) throw new IdentityResolutionError({ code: 'DEVICE_AMBIGUOUS' });
  const match = matches[0];
  if (!match || (request.category !== 'android' && request.category !== match.category)) throw new IdentityResolutionError({ code: 'DEVICE_NOT_FOUND' });
  return match;
}

export function sameIdentity(left: ResolvedIdentity, right: ResolvedIdentity): boolean {
  return left.category === right.category && left.value === right.value;
}

export async function revalidateIdentity(input: { identity: ResolvedIdentity; probe: IdentityProbe; signal: AbortSignal }): Promise<ResolvedIdentity> {
  const identity = input.identity;
  const current = await resolveIdentity({ request: { category: identity.category,
    name: identity.category === 'ios-simulator' ? identity.value : identity.transport.serial }, probe: input.probe, signal: input.signal });
  if (current.category === 'android-phone' && current.transport.state !== 'device') {
    throw new IdentityResolutionError({ code: current.transport.state === 'unauthorized' ? 'DEVICE_UNAUTHORIZED' : 'DEVICE_NOT_CONNECTED' });
  }
  const incarnationChanged = identity.category === 'android-emulator' && current.category === 'android-emulator' &&
    (identity.provenance.process.pid !== current.provenance.process.pid || identity.provenance.process.startedAt !== current.provenance.process.startedAt ||
      identity.provenance.directory.device !== current.provenance.directory.device || identity.provenance.directory.inode !== current.provenance.directory.inode);
  if (!sameIdentity(identity, current) || incarnationChanged) throw new IdentityResolutionError({ code: 'DEVICE_IDENTITY_CONFLICT', reason: 'TRANSPORT_CHANGED' });
  return current;
}
