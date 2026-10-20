import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { androidAvd, androidSerial } from './scripted/schema.js';
import type { ScriptedScenario } from './scripted/contracts.js';

export const profileNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
export const profileBudgetsSchema = z.strictObject({
  startupMs: z.number().int().min(1000).max(600_000).optional(),
  operationMs: z.number().int().min(1000).max(600_000).optional(),
  cleanupMs: z.number().int().min(1000).max(120_000).optional(),
});
const profileSchema = z.strictObject({
  platform: z.enum(['ios', 'android']),
  deviceCategory: z.enum(['ios-simulator', 'android-emulator', 'android-phone']),
  device: z.string().min(1).max(100),
  app: z.string().min(1).optional(),
  budgets: profileBudgetsSchema.optional(),
}).superRefine((profile, context) => {
  const ios = profile.deviceCategory === 'ios-simulator';
  if ((profile.platform === 'ios') !== ios) context.addIssue({ code: 'custom', message: 'Platform and category disagree' });
  const validDevice = ios ? /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(profile.device)
    : (profile.deviceCategory === 'android-phone' ? androidSerial : androidAvd).test(profile.device);
  if (!validDevice) context.addIssue({ code: 'custom', message: 'Invalid device' });
  if (profile.app !== undefined && !(ios ? /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
    : /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/).test(profile.app)) {
    context.addIssue({ code: 'custom', message: 'Invalid app' });
  }
});
const profilesFileSchema = z.strictObject({
  version: z.literal(1),
  defaultProfile: profileNameSchema.optional(),
  profiles: z.record(profileNameSchema, profileSchema),
});

export type Profile = z.infer<typeof profileSchema>;
export type ProfileBudgets = z.infer<typeof profileBudgetsSchema>;
export interface ProfileBinding { name: string; digest: string }
export interface SelectedProfile { profile: Profile; binding: ProfileBinding }
export class ProfileError extends Error {
  constructor(readonly code: 'INVALID_PROFILE_FILE' | 'PROFILE_NOT_FOUND' | 'PROFILE_CONFLICT',
    message = code === 'INVALID_PROFILE_FILE' ? 'The project profiles file is invalid.' : 'The selected profile was not found.') {
    super(message);
  }
}

export function profileLimits(selected: SelectedProfile | undefined, requested: ProfileBudgets): ProfileBudgets {
  if (!selected) return requested;
  const ceilings = selected.profile.budgets ?? {};
  const limits: ProfileBudgets = { ...ceilings };
  for (const field of ['startupMs', 'operationMs', 'cleanupMs'] as const) {
    const value = requested[field];
    if (value === undefined) continue;
    if (ceilings[field] !== undefined && value > ceilings[field]) throw new ProfileError('PROFILE_CONFLICT', `Requested ${field} exceeds the selected profile budget.`);
    limits[field] = value;
  }
  return limits;
}

export function profileDevice(profile: Profile): { udid: string } | { serial: string } | { avd: string } {
  if (profile.platform === 'ios') return { udid: profile.device.toUpperCase() };
  return profile.deviceCategory === 'android-phone' || profile.device.startsWith('emulator-')
    ? { serial: profile.device } : { avd: profile.device };
}

export function profileScenario(scenario: ScriptedScenario, selected: SelectedProfile): ScriptedScenario {
  const { profile } = selected;
  const android = scenario.platform === 'android';
  const app = scenario.platform === 'android' ? scenario.app.package : scenario.app.bundleId;
  if ((android ? 'android' : 'ios') !== profile.platform) {
    throw new ProfileError('PROFILE_CONFLICT', 'Scenario platform conflicts with the selected profile.');
  }
  if (profile.app !== undefined && profile.app !== app) {
    throw new ProfileError('PROFILE_CONFLICT', 'Scenario app conflicts with the selected profile.');
  }
  const device = profileDevice(profile);
  const own = scenario.device;
  if (own) {
    for (const [kind, value] of Object.entries(own)) {
      if (value === undefined) continue;
      const expected = device[kind as keyof typeof device];
      if (expected === undefined || (kind === 'udid' ? String(value).toUpperCase() !== expected : value !== expected)) {
        throw new ProfileError('PROFILE_CONFLICT', 'Scenario device conflicts with the selected profile.');
      }
    }
  }
  return scenario.platform === 'android' ? { ...scenario, device: device as { serial: string } | { avd: string } }
    : { ...scenario, device: device as { udid: string } };
}

export async function readProfile(projectDir: string, explicit?: string,
  scenario?: Pick<ScriptedScenario, 'platform'>): Promise<SelectedProfile | undefined> {
  let source: string;
  try { source = await readFile(join(projectDir, '.jev', 'profiles.json'), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ProfileError('INVALID_PROFILE_FILE');
    if (explicit !== undefined) throw new ProfileError('PROFILE_NOT_FOUND');
    return undefined;
  }
  let file: z.infer<typeof profilesFileSchema>;
  try { file = profilesFileSchema.parse(JSON.parse(source)); }
  catch { throw new ProfileError('INVALID_PROFILE_FILE'); }
  const name = explicit ?? file.defaultProfile;
  if (name === undefined) return undefined;
  const profile = Object.hasOwn(file.profiles, name) ? file.profiles[name] : undefined;
  if (!profile) throw new ProfileError('PROFILE_NOT_FOUND');
  if (explicit === undefined && scenario !== undefined && profile.platform !== (scenario.platform ?? 'ios')) return undefined;
  return { profile, binding: { name, digest: createHash('sha256').update(JSON.stringify(profile)).digest('hex') } };
}
